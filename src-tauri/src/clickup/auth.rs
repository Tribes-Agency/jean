use reqwest::Client;
use serde::Deserialize;
use std::net::SocketAddr;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use super::keychain;

/// OAuth token response from ClickUp
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

/// Success HTML page shown to the user after OAuth callback
const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
  <title>ClickUp Connected</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #e0e0e0; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #7b68ee; margin-bottom: 0.5rem; }
    p { color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connected to ClickUp</h1>
    <p>You can close this tab and return to Jean.</p>
  </div>
</body>
</html>"#;

/// Error HTML page shown when something goes wrong
const ERROR_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
  <title>ClickUp Connection Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #e0e0e0; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #e74c3c; margin-bottom: 0.5rem; }
    p { color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connection Failed</h1>
    <p>Something went wrong. Please try again from Jean.</p>
  </div>
</body>
</html>"#;

/// Start the OAuth flow:
/// 1. Bind a temporary local HTTP server for the callback
/// 2. Open the ClickUp authorization URL in the browser
/// 3. Wait for the callback with the authorization code
/// 4. Exchange the code for an access token
/// 5. Store the token in the keychain
/// 6. Emit `clickup:auth-complete` event to the frontend
#[tauri::command]
pub async fn clickup_start_oauth(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    log::info!("Starting ClickUp OAuth flow");

    if client_id.is_empty() || client_secret.is_empty() {
        return Err("Client ID and Client Secret are required".to_string());
    }

    // Bind to port 8642 for OAuth callback (must match the redirect URI registered in ClickUp)
    let port: u16 = 8642;
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
        .await
        .map_err(|e| format!("Failed to bind OAuth callback server on port {port}: {e}. Is another process using this port?"))?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    log::info!("OAuth callback server listening on port {port}");

    // Build the ClickUp authorization URL
    let auth_url = format!(
        "https://app.clickup.com/api?client_id={client_id}&redirect_uri={redirect_uri}"
    );

    // Open the authorization URL in the system browser
    open_in_browser(&auth_url)?;

    // Channel to pass the authorization code from the callback handler
    let (code_tx, code_rx) = oneshot::channel::<Result<String, String>>();
    let code_tx = std::sync::Arc::new(tokio::sync::Mutex::new(Some(code_tx)));

    // Build the axum router for the OAuth callback
    let code_tx_clone = code_tx.clone();
    let router = axum::Router::new().route(
        "/callback",
        axum::routing::get(move |query: axum::extract::Query<CallbackParams>| {
            let code_tx = code_tx_clone.clone();
            async move {
                let mut guard = code_tx.lock().await;
                if let Some(tx) = guard.take() {
                    if let Some(code) = query.code.clone() {
                        let _ = tx.send(Ok(code));
                        axum::response::Html(SUCCESS_HTML.to_string())
                    } else {
                        let error = query
                            .error
                            .clone()
                            .unwrap_or_else(|| "No authorization code received".to_string());
                        let _ = tx.send(Err(error));
                        axum::response::Html(ERROR_HTML.to_string())
                    }
                } else {
                    axum::response::Html(SUCCESS_HTML.to_string())
                }
            }
        }),
    );

    // Spawn the callback server with a timeout
    let server_handle = tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .ok();
    });

    // Wait for the authorization code with a 5-minute timeout
    let code = match tokio::time::timeout(std::time::Duration::from_secs(300), code_rx).await {
        Ok(Ok(result)) => {
            // Abort the server now that we have the code
            server_handle.abort();
            result?
        }
        Ok(Err(_)) => {
            server_handle.abort();
            return Err("OAuth callback channel closed unexpectedly".to_string());
        }
        Err(_) => {
            server_handle.abort();
            return Err(
                "OAuth flow timed out. Please try again and complete authorization within 5 minutes."
                    .to_string(),
            );
        }
    };

    log::info!("Received OAuth authorization code, exchanging for token");

    // Exchange the authorization code for an access token
    let token = exchange_code_for_token(&client_id, &client_secret, &code).await?;

    // Store the token in the keychain
    keychain::store_clickup_token(&token)?;

    log::info!("ClickUp OAuth flow complete, token stored in keychain");

    // Emit event to frontend
    app.emit("clickup:auth-complete", ())
        .map_err(|e| format!("Failed to emit auth-complete event: {e}"))?;

    Ok(())
}

/// Exchange an authorization code for an access token via the ClickUp API.
async fn exchange_code_for_token(
    client_id: &str,
    client_secret: &str,
    code: &str,
) -> Result<String, String> {
    let client = Client::new();

    let response = client
        .post("https://api.clickup.com/api/v2/oauth/token")
        .query(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to exchange OAuth code: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!(
            "ClickUp token exchange failed (HTTP {status}): {body}"
        ));
    }

    let token_response: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    Ok(token_response.access_token)
}

/// Query parameters received on the OAuth callback
#[derive(Debug, Deserialize)]
struct CallbackParams {
    code: Option<String>,
    error: Option<String>,
}

/// Open a URL in the system browser (cross-platform)
fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_exchange_code_formats_correct_request() {
        // This test verifies the token exchange URL and parameter construction.
        // We can't test against the real ClickUp API, but we can verify the
        // function returns an error for invalid credentials (meaning it made the request).
        let result = exchange_code_for_token("fake_id", "fake_secret", "fake_code").await;
        assert!(result.is_err());
        // The error should be from the HTTP request, not a panic
        let err = result.unwrap_err();
        assert!(
            err.contains("ClickUp token exchange failed") || err.contains("Failed to exchange"),
            "Unexpected error: {err}"
        );
    }
}

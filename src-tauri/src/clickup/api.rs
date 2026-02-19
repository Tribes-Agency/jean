use reqwest::{Client, Response, StatusCode};

use super::keychain;
use super::types::*;

const BASE_URL: &str = "https://api.clickup.com/api/v2";

/// ClickUp API error types
#[derive(Debug)]
pub enum ClickUpApiError {
    /// Token missing or invalid — keychain has been cleared
    AuthError(String),
    /// Rate limited — includes retry-after timestamp (Unix seconds)
    RateLimited { reset_at: Option<u64> },
    /// Generic API or network error
    RequestError(String),
}

impl std::fmt::Display for ClickUpApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClickUpApiError::AuthError(msg) => write!(f, "Authentication error: {msg}"),
            ClickUpApiError::RateLimited { reset_at } => {
                if let Some(ts) = reset_at {
                    write!(f, "Rate limited. Retry after timestamp {ts}")
                } else {
                    write!(f, "Rate limited. Please wait before retrying.")
                }
            }
            ClickUpApiError::RequestError(msg) => write!(f, "{msg}"),
        }
    }
}

impl From<ClickUpApiError> for String {
    fn from(e: ClickUpApiError) -> String {
        e.to_string()
    }
}

/// Get the stored ClickUp token or return an auth error.
fn require_token() -> Result<String, ClickUpApiError> {
    match keychain::get_clickup_token() {
        Ok(Some(token)) => Ok(token),
        Ok(None) => Err(ClickUpApiError::AuthError(
            "Not authenticated with ClickUp. Please sign in first.".to_string(),
        )),
        Err(e) => Err(ClickUpApiError::AuthError(e)),
    }
}

/// Check response for rate limit and auth errors.
/// Logs a warning if rate limit remaining is below threshold.
async fn check_response(response: Response) -> Result<Response, ClickUpApiError> {
    // Log rate limit warnings
    if let Some(remaining) = response
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
    {
        if remaining < 10 {
            log::warn!("ClickUp rate limit low: {remaining} requests remaining");
        }
    }

    let status = response.status();

    if status == StatusCode::UNAUTHORIZED {
        // Token is invalid — clear it from keychain
        log::warn!("ClickUp API returned 401, clearing stored token");
        let _ = keychain::delete_clickup_token();
        return Err(ClickUpApiError::AuthError(
            "ClickUp token is invalid or expired. Please sign in again.".to_string(),
        ));
    }

    if status == StatusCode::TOO_MANY_REQUESTS {
        let reset_at = response
            .headers()
            .get("x-ratelimit-reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());
        return Err(ClickUpApiError::RateLimited { reset_at });
    }

    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(ClickUpApiError::RequestError(format!(
            "ClickUp API error (HTTP {status}): {body}"
        )));
    }

    Ok(response)
}

/// List workspaces the user has access to.
/// ClickUp API calls these "teams".
pub async fn list_workspaces() -> Result<Vec<ClickUpWorkspace>, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let response = client
        .get(format!("{BASE_URL}/team"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to fetch workspaces: {e}")))?;

    let response = check_response(response).await?;

    #[derive(serde::Deserialize)]
    struct TeamsResponse {
        teams: Vec<ClickUpWorkspace>,
    }

    let data: TeamsResponse = response
        .json()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to parse workspaces: {e}")))?;

    Ok(data.teams)
}

/// List spaces in a workspace.
pub async fn list_spaces(workspace_id: &str) -> Result<Vec<ClickUpSpace>, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let response = client
        .get(format!("{BASE_URL}/team/{workspace_id}/space"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to fetch spaces: {e}")))?;

    let response = check_response(response).await?;

    #[derive(serde::Deserialize)]
    struct SpacesResponse {
        spaces: Vec<ClickUpSpace>,
    }

    let data: SpacesResponse = response
        .json()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to parse spaces: {e}")))?;

    Ok(data.spaces)
}

/// List tasks across a workspace, optionally filtered by space IDs.
///
/// Uses the "filtered team tasks" endpoint which searches across all lists.
/// Pagination is 0-indexed, 100 tasks per page.
pub async fn list_tasks(
    workspace_id: &str,
    space_ids: &[String],
    include_closed: bool,
    page: u32,
) -> Result<ClickUpTaskListResult, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let mut url = format!("{BASE_URL}/team/{workspace_id}/task?page={page}");

    if include_closed {
        url.push_str("&include_closed=true");
    }

    for space_id in space_ids {
        url.push_str(&format!("&space_ids[]={space_id}"));
    }

    // Order by most recently updated
    url.push_str("&order_by=updated&reverse=true");

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to fetch tasks: {e}")))?;

    let response = check_response(response).await?;

    // The API returns { tasks: [...], last_page: bool }
    let data: ClickUpTaskListResult = response
        .json()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to parse tasks: {e}")))?;

    Ok(data)
}

/// List folders in a space (each folder includes its lists).
pub async fn list_folders(space_id: &str) -> Result<Vec<ClickUpFolder>, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let response = client
        .get(format!("{BASE_URL}/space/{space_id}/folder"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to fetch folders: {e}")))?;

    let response = check_response(response).await?;

    #[derive(serde::Deserialize)]
    struct FoldersResponse {
        #[serde(default)]
        folders: Vec<ClickUpFolder>,
    }

    let body = response.text().await.map_err(|e| {
        ClickUpApiError::RequestError(format!("Failed to read folders response: {e}"))
    })?;

    log::debug!("ClickUp folders response for space {space_id}: {body}");

    let data: FoldersResponse = serde_json::from_str(&body).map_err(|e| {
        ClickUpApiError::RequestError(format!("Failed to parse folders: {e} — body: {body}"))
    })?;

    Ok(data.folders)
}

/// List folderless lists in a space.
pub async fn list_folderless_lists(space_id: &str) -> Result<Vec<ClickUpList>, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let response = client
        .get(format!("{BASE_URL}/space/{space_id}/list"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| {
            ClickUpApiError::RequestError(format!("Failed to fetch folderless lists: {e}"))
        })?;

    let response = check_response(response).await?;

    #[derive(serde::Deserialize)]
    struct ListsResponse {
        #[serde(default)]
        lists: Vec<ClickUpList>,
    }

    let body = response.text().await.map_err(|e| {
        ClickUpApiError::RequestError(format!("Failed to read folderless lists response: {e}"))
    })?;

    log::debug!("ClickUp folderless lists response for space {space_id}: {body}");

    let data: ListsResponse = serde_json::from_str(&body).map_err(|e| {
        ClickUpApiError::RequestError(format!(
            "Failed to parse folderless lists: {e} — body: {body}"
        ))
    })?;

    Ok(data.lists)
}

/// List tasks in a specific list.
pub async fn list_tasks_in_list(
    list_id: &str,
    include_closed: bool,
    page: u32,
) -> Result<ClickUpTaskListResult, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let mut url = format!("{BASE_URL}/list/{list_id}/task?page={page}");

    if include_closed {
        url.push_str("&include_closed=true");
    }

    url.push_str("&order_by=updated&reverse=true");

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to fetch list tasks: {e}")))?;

    let response = check_response(response).await?;

    let body = response.text().await.map_err(|e| {
        ClickUpApiError::RequestError(format!("Failed to read list tasks response: {e}"))
    })?;

    log::debug!(
        "ClickUp list tasks response for list {list_id} (first 500 chars): {}",
        &body[..body.len().min(500)]
    );

    let data: ClickUpTaskListResult = serde_json::from_str(&body).map_err(|e| {
        ClickUpApiError::RequestError(format!("Failed to parse list tasks: {e} — body: {body}"))
    })?;

    Ok(data)
}

/// Search for a task by its internal ID or custom ID.
///
/// Tries internal ID first (`GET /task/{query}`), then custom ID
/// (`GET /task/{query}?custom_task_ids=true&team_id={workspace_id}`).
/// Returns None if neither lookup succeeds.
pub async fn search_task_by_id(
    query: &str,
    workspace_id: &str,
) -> Result<Option<ClickUpTask>, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    // Try internal ID first
    let response = client
        .get(format!("{BASE_URL}/task/{query}"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| ClickUpApiError::RequestError(format!("Failed to fetch task: {e}")))?;

    // Check for auth/rate-limit errors but treat 404 and other client errors as "not found"
    match response.status() {
        StatusCode::UNAUTHORIZED => {
            log::warn!("ClickUp API returned 401, clearing stored token");
            let _ = keychain::delete_clickup_token();
            return Err(ClickUpApiError::AuthError(
                "ClickUp token is invalid or expired. Please sign in again.".to_string(),
            ));
        }
        StatusCode::TOO_MANY_REQUESTS => {
            let reset_at = response
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            return Err(ClickUpApiError::RateLimited { reset_at });
        }
        s if s.is_success() => {
            // Parse the full task response into our minimal ClickUpTask struct
            // (serde ignores extra fields automatically)
            match response.json::<ClickUpTask>().await {
                Ok(task) => return Ok(Some(task)),
                Err(e) => {
                    log::debug!("Failed to parse task from internal ID lookup: {e}");
                }
            }
        }
        _ => {
            log::debug!("Internal ID lookup failed for '{query}', trying custom ID");
        }
    }

    // Try custom ID lookup
    let response = client
        .get(format!(
            "{BASE_URL}/task/{query}?custom_task_ids=true&team_id={workspace_id}"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| {
            ClickUpApiError::RequestError(format!("Failed to fetch task by custom ID: {e}"))
        })?;

    match response.status() {
        StatusCode::UNAUTHORIZED => {
            log::warn!("ClickUp API returned 401, clearing stored token");
            let _ = keychain::delete_clickup_token();
            return Err(ClickUpApiError::AuthError(
                "ClickUp token is invalid or expired. Please sign in again.".to_string(),
            ));
        }
        StatusCode::TOO_MANY_REQUESTS => {
            let reset_at = response
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            return Err(ClickUpApiError::RateLimited { reset_at });
        }
        s if s.is_success() => match response.json::<ClickUpTask>().await {
            Ok(task) => return Ok(Some(task)),
            Err(e) => {
                log::debug!("Failed to parse task from custom ID lookup: {e}");
            }
        },
        _ => {
            log::debug!("Custom ID lookup also failed for '{query}'");
        }
    }

    Ok(None)
}

/// Get a single task's full detail including markdown description.
pub async fn get_task(task_id: &str) -> Result<ClickUpTaskDetail, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let response = client
        .get(format!(
            "{BASE_URL}/task/{task_id}?include_markdown_description=true"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| {
            ClickUpApiError::RequestError(format!("Failed to fetch task {task_id}: {e}"))
        })?;

    let response = check_response(response).await?;

    let mut task: ClickUpTaskDetail = response.json().await.map_err(|e| {
        ClickUpApiError::RequestError(format!("Failed to parse task {task_id}: {e}"))
    })?;

    // Use markdown_description if available, fall back to plain description
    if task.markdown_description.is_some() {
        task.description = task.markdown_description.take();
    }

    Ok(task)
}

/// Get comments for a task.
pub async fn get_task_comments(
    task_id: &str,
) -> Result<Vec<ClickUpComment>, ClickUpApiError> {
    let token = require_token()?;
    let client = Client::new();

    let response = client
        .get(format!("{BASE_URL}/task/{task_id}/comment"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| {
            ClickUpApiError::RequestError(format!(
                "Failed to fetch comments for task {task_id}: {e}"
            ))
        })?;

    let response = check_response(response).await?;

    #[derive(serde::Deserialize)]
    struct CommentsResponse {
        comments: Vec<ClickUpComment>,
    }

    let data: CommentsResponse = response.json().await.map_err(|e| {
        ClickUpApiError::RequestError(format!(
            "Failed to parse comments for task {task_id}: {e}"
        ))
    })?;

    Ok(data.comments)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_url_construction() {
        let url = format!("{BASE_URL}/team");
        assert_eq!(url, "https://api.clickup.com/api/v2/team");
    }

    #[test]
    fn test_spaces_url_construction() {
        let url = format!("{BASE_URL}/team/{}/space", "workspace123");
        assert_eq!(
            url,
            "https://api.clickup.com/api/v2/team/workspace123/space"
        );
    }

    #[test]
    fn test_tasks_url_construction() {
        let workspace_id = "ws123";
        let page = 0;
        let mut url = format!("{BASE_URL}/team/{workspace_id}/task?page={page}");
        url.push_str("&include_closed=true");
        url.push_str("&space_ids[]=space1");
        url.push_str("&space_ids[]=space2");
        url.push_str("&order_by=updated&reverse=true");

        assert_eq!(
            url,
            "https://api.clickup.com/api/v2/team/ws123/task?page=0&include_closed=true&space_ids[]=space1&space_ids[]=space2&order_by=updated&reverse=true"
        );
    }

    #[test]
    fn test_task_detail_url_construction() {
        let url = format!(
            "{BASE_URL}/task/{}?include_markdown_description=true",
            "abc123"
        );
        assert_eq!(
            url,
            "https://api.clickup.com/api/v2/task/abc123?include_markdown_description=true"
        );
    }

    #[test]
    fn test_task_comments_url_construction() {
        let url = format!("{BASE_URL}/task/{}/comment", "abc123");
        assert_eq!(
            url,
            "https://api.clickup.com/api/v2/task/abc123/comment"
        );
    }

    #[test]
    fn test_clickup_api_error_display() {
        let auth_err = ClickUpApiError::AuthError("token expired".to_string());
        assert!(auth_err.to_string().contains("token expired"));

        let rate_err = ClickUpApiError::RateLimited {
            reset_at: Some(1700000000),
        };
        assert!(rate_err.to_string().contains("1700000000"));

        let rate_err_none = ClickUpApiError::RateLimited { reset_at: None };
        assert!(rate_err_none.to_string().contains("Please wait"));

        let req_err = ClickUpApiError::RequestError("network failure".to_string());
        assert!(req_err.to_string().contains("network failure"));
    }

    #[test]
    fn test_clickup_api_error_to_string() {
        let err = ClickUpApiError::AuthError("test".to_string());
        let s: String = err.into();
        assert!(s.contains("test"));
    }
}

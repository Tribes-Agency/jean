use keyring::Entry;

const SERVICE_NAME: &str = "jean-app";
const ACCOUNT_KEY: &str = "clickup-access-token";

/// Store a ClickUp access token in the OS keychain.
pub fn store_clickup_token(token: &str) -> Result<(), String> {
    let entry =
        Entry::new(SERVICE_NAME, ACCOUNT_KEY).map_err(|e| format!("Keychain error: {e}"))?;
    entry
        .set_password(token)
        .map_err(|e| format!("Failed to store token in keychain: {e}"))
}

/// Retrieve the ClickUp access token from the OS keychain.
/// Returns None if no token is stored.
pub fn get_clickup_token() -> Result<Option<String>, String> {
    let entry =
        Entry::new(SERVICE_NAME, ACCOUNT_KEY).map_err(|e| format!("Keychain error: {e}"))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve token from keychain: {e}")),
    }
}

/// Delete the ClickUp access token from the OS keychain.
pub fn delete_clickup_token() -> Result<(), String> {
    let entry =
        Entry::new(SERVICE_NAME, ACCOUNT_KEY).map_err(|e| format!("Keychain error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already gone, that's fine
        Err(e) => Err(format!("Failed to delete token from keychain: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test helpers using unique keychain keys to avoid parallel test interference.
    fn store_token(key: &str, token: &str) -> Result<(), String> {
        let entry =
            Entry::new(SERVICE_NAME, key).map_err(|e| format!("Keychain error: {e}"))?;
        entry
            .set_password(token)
            .map_err(|e| format!("Failed to store token in keychain: {e}"))
    }

    fn get_token(key: &str) -> Result<Option<String>, String> {
        let entry =
            Entry::new(SERVICE_NAME, key).map_err(|e| format!("Keychain error: {e}"))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to retrieve token from keychain: {e}")),
        }
    }

    fn delete_token(key: &str) -> Result<(), String> {
        let entry =
            Entry::new(SERVICE_NAME, key).map_err(|e| format!("Keychain error: {e}"))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Failed to delete token from keychain: {e}")),
        }
    }

    #[test]
    fn test_store_retrieve_delete_roundtrip() {
        let key = "clickup-test-roundtrip";
        let test_token = "test-clickup-token-12345";

        // Store
        store_token(key, test_token).expect("Failed to store token");

        // Retrieve
        let retrieved = get_token(key).expect("Failed to get token");
        assert_eq!(retrieved, Some(test_token.to_string()));

        // Delete
        delete_token(key).expect("Failed to delete token");

        // Verify gone
        let after_delete = get_token(key).expect("Failed to check token after delete");
        assert_eq!(after_delete, None);
    }

    #[test]
    fn test_get_nonexistent_token_returns_none() {
        let key = "clickup-test-nonexistent";
        // Ensure clean state
        let _ = delete_token(key);

        let result = get_token(key).expect("Failed to check token");
        assert_eq!(result, None);
    }

    #[test]
    fn test_delete_nonexistent_token_is_ok() {
        let key = "clickup-test-delete-noop";
        // Ensure clean state
        let _ = delete_token(key);

        // Deleting when nothing is stored should succeed
        delete_token(key).expect("Delete of nonexistent token should succeed");
    }
}

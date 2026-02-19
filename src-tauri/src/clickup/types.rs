use serde::{Deserialize, Serialize};

// =============================================================================
// ClickUp Types - API/command data (Pattern B: camelCase via serde)
//
// IMPORTANT: These structs are used for BOTH:
// 1. Deserializing from ClickUp API (which returns snake_case)
// 2. Serializing to frontend (which expects camelCase)
//
// The `rename_all = "camelCase"` handles frontend serialization.
// The `alias` attributes handle ClickUp API deserialization for multi-word fields.
// =============================================================================

/// Deserialize a value that may be a string OR number into Option<String>.
/// ClickUp API returns `task_count` as a number in some endpoints and a string in others.
fn deserialize_string_or_number<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde_json::Value;
    let v = Option::<Value>::deserialize(deserializer)?;
    Ok(v.and_then(|v| match v {
        Value::String(s) if !s.is_empty() => Some(s),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }))
}

/// ClickUp task status with color
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpStatus {
    pub status: String,
    pub color: String,
    #[serde(rename = "type", alias = "type")]
    pub status_type: String, // "open" | "closed" | "custom"
}

/// ClickUp user
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpUser {
    pub id: u64,
    pub username: String,
    #[serde(default)]
    pub initials: String,
}

/// ClickUp task from list response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTask {
    pub id: String,
    #[serde(default, alias = "custom_id")]
    pub custom_id: Option<String>,
    pub name: String,
    pub status: ClickUpStatus,
    #[serde(alias = "date_created")]
    pub date_created: String, // Unix ms as string
    pub url: String,
    /// Parent task ID (null for top-level tasks, set when subtasks=true)
    #[serde(default)]
    pub parent: Option<String>,
    /// Task assignees
    #[serde(default)]
    pub assignees: Vec<ClickUpUser>,
}

/// ClickUp comment on a task
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpComment {
    #[serde(alias = "comment_text")]
    pub comment_text: String,
    pub user: ClickUpUser,
    pub date: String,
}

/// ClickUp task detail with description and comments
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTaskDetail {
    pub id: String,
    #[serde(default, alias = "custom_id")]
    pub custom_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Markdown description (returned when `include_markdown_description=true`)
    #[serde(default, alias = "markdown_description")]
    pub markdown_description: Option<String>,
    pub status: ClickUpStatus,
    #[serde(alias = "date_created")]
    pub date_created: String,
    pub url: String,
    #[serde(default)]
    pub comments: Vec<ClickUpComment>,
    /// Subtasks (populated by the command, not the API directly)
    #[serde(default)]
    pub subtasks: Vec<ClickUpTask>,
}

/// ClickUp workspace (called "team" in API)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpWorkspace {
    pub id: String,
    pub name: String,
}

/// ClickUp space within a workspace
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpSpace {
    pub id: String,
    pub name: String,
}

/// ClickUp list within a folder or space
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpList {
    pub id: String,
    pub name: String,
    #[serde(
        default,
        alias = "task_count",
        deserialize_with = "deserialize_string_or_number"
    )]
    pub task_count: Option<String>,
    #[serde(default)]
    pub archived: bool,
}

/// ClickUp folder within a space (contains lists)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpFolder {
    pub id: String,
    pub name: String,
    #[serde(
        default,
        alias = "task_count",
        deserialize_with = "deserialize_string_or_number"
    )]
    pub task_count: Option<String>,
    #[serde(default)]
    pub lists: Vec<ClickUpList>,
}

/// Hierarchy of folders and folderless lists within a space
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpSpaceHierarchy {
    #[serde(alias = "space_id")]
    pub space_id: String,
    pub folders: Vec<ClickUpFolder>,
    #[serde(alias = "folderless_lists")]
    pub folderless_lists: Vec<ClickUpList>,
}

/// Authenticated user info from GET /user
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpAuthenticatedUser {
    pub id: u64,
    pub username: String,
    pub email: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default, alias = "profile_picture")]
    pub profile_picture: Option<String>,
    #[serde(default)]
    pub initials: Option<String>,
}

/// Shared hierarchy: tasks, lists, and folders shared with the authenticated user
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpSharedHierarchy {
    #[serde(default)]
    pub tasks: Vec<ClickUpTask>,
    #[serde(default)]
    pub lists: Vec<ClickUpList>,
    #[serde(default)]
    pub folders: Vec<ClickUpFolder>,
}

/// Auth status check result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpAuthStatus {
    pub authenticated: bool,
    #[serde(default)]
    pub error: Option<String>,
}

/// Result of listing ClickUp tasks (with pagination info)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTaskListResult {
    pub tasks: Vec<ClickUpTask>,
    #[serde(default, alias = "last_page")]
    pub last_page: bool,
}

/// Loaded context reference for a ClickUp task
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedClickUpTaskContext {
    pub id: String,
    #[serde(default, alias = "custom_id")]
    pub custom_id: Option<String>,
    pub name: String,
    #[serde(alias = "comment_count")]
    pub comment_count: u32,
    #[serde(alias = "workspace_id")]
    pub workspace_id: String,
    #[serde(default, alias = "subtask_count")]
    pub subtask_count: u32,
}

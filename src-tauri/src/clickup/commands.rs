use super::api;
use super::keychain;
use super::types::*;
use crate::projects::github_issues;

/// Check if the user is authenticated with ClickUp (token exists in keychain).
#[tauri::command]
pub async fn clickup_check_auth() -> Result<ClickUpAuthStatus, String> {
    match keychain::get_clickup_token() {
        Ok(Some(_)) => Ok(ClickUpAuthStatus {
            authenticated: true,
            error: None,
        }),
        Ok(None) => Ok(ClickUpAuthStatus {
            authenticated: false,
            error: None,
        }),
        Err(e) => Ok(ClickUpAuthStatus {
            authenticated: false,
            error: Some(e),
        }),
    }
}

/// Remove the ClickUp access token from the keychain (logout).
#[tauri::command]
pub async fn clickup_logout() -> Result<(), String> {
    keychain::delete_clickup_token()?;
    log::info!("ClickUp token removed from keychain");
    Ok(())
}

/// List workspaces the user has access to.
#[tauri::command]
pub async fn clickup_list_workspaces() -> Result<Vec<ClickUpWorkspace>, String> {
    log::trace!("Listing ClickUp workspaces");
    let workspaces = api::list_workspaces().await?;
    log::trace!("Found {} ClickUp workspaces", workspaces.len());
    Ok(workspaces)
}

/// List spaces in a workspace.
#[tauri::command]
pub async fn clickup_list_spaces(workspace_id: String) -> Result<Vec<ClickUpSpace>, String> {
    log::trace!("Listing ClickUp spaces for workspace {workspace_id}");
    let spaces = api::list_spaces(&workspace_id).await?;
    log::trace!("Found {} ClickUp spaces", spaces.len());
    Ok(spaces)
}

/// List tasks in a workspace, optionally filtered by space.
#[tauri::command]
pub async fn clickup_list_tasks(
    workspace_id: String,
    space_ids: Vec<String>,
    include_closed: bool,
    page: u32,
) -> Result<ClickUpTaskListResult, String> {
    log::trace!("Listing ClickUp tasks for workspace {workspace_id}, page {page}");
    let result = api::list_tasks(&workspace_id, &space_ids, include_closed, page).await?;
    log::trace!(
        "Found {} ClickUp tasks (last_page: {})",
        result.tasks.len(),
        result.last_page
    );
    Ok(result)
}

/// Get the hierarchy (folders + folderless lists) for a space.
#[tauri::command]
pub async fn clickup_get_space_hierarchy(
    space_id: String,
) -> Result<ClickUpSpaceHierarchy, String> {
    log::trace!("Getting ClickUp space hierarchy for space {space_id}");

    let (folders_result, lists_result) = tokio::join!(
        api::list_folders(&space_id),
        api::list_folderless_lists(&space_id)
    );

    let folders = folders_result?;
    let folderless_lists = lists_result?;

    log::trace!(
        "Got {} folders and {} folderless lists for space {space_id}",
        folders.len(),
        folderless_lists.len()
    );

    Ok(ClickUpSpaceHierarchy {
        space_id,
        folders,
        folderless_lists,
    })
}

/// List tasks in a specific list.
#[tauri::command]
pub async fn clickup_list_tasks_in_list(
    list_id: String,
    include_closed: bool,
    page: u32,
) -> Result<ClickUpTaskListResult, String> {
    log::trace!("Listing ClickUp tasks in list {list_id}, page {page}");
    let result = api::list_tasks_in_list(&list_id, include_closed, page).await?;
    log::trace!(
        "Found {} tasks in list {list_id} (last_page: {})",
        result.tasks.len(),
        result.last_page
    );
    Ok(result)
}

/// Search for a task by internal ID or custom ID.
/// Returns None if no task is found.
#[tauri::command]
pub async fn clickup_search_task_by_id(
    query: String,
    workspace_id: String,
) -> Result<Option<ClickUpTask>, String> {
    log::trace!("Searching ClickUp task by ID: '{query}' in workspace {workspace_id}");
    let result = api::search_task_by_id(&query, &workspace_id).await?;
    log::trace!(
        "ClickUp task ID search result: {}",
        if result.is_some() { "found" } else { "not found" }
    );
    Ok(result)
}

/// Get a single task's full detail including comments.
#[tauri::command]
pub async fn clickup_get_task(task_id: String) -> Result<ClickUpTaskDetail, String> {
    log::trace!("Getting ClickUp task {task_id}");

    // Fetch task detail and comments in parallel
    let (task_result, comments_result) =
        tokio::join!(api::get_task(&task_id), api::get_task_comments(&task_id));

    let mut task = task_result?;
    let comments = comments_result?;
    task.comments = comments;

    log::trace!(
        "Got ClickUp task {} with {} comments",
        task_id,
        task.comments.len()
    );
    Ok(task)
}

/// Format ClickUp task context as markdown for the context file.
fn format_clickup_task_context_markdown(task: &ClickUpTaskDetail) -> String {
    let mut content = String::new();

    // Header with custom ID if available
    let id_prefix = task
        .custom_id
        .as_deref()
        .map(|id| format!("{id}: "))
        .unwrap_or_default();
    content.push_str(&format!("# ClickUp Task {id_prefix}{}\n\n", task.name));

    content.push_str("---\n\n");

    content.push_str("## Description\n\n");
    if let Some(desc) = &task.description {
        if !desc.is_empty() {
            content.push_str(desc);
        } else {
            content.push_str("*No description provided.*");
        }
    } else {
        content.push_str("*No description provided.*");
    }
    content.push_str("\n\n");

    if !task.comments.is_empty() {
        content.push_str("## Comments\n\n");
        for comment in &task.comments {
            content.push_str(&format!(
                "### @{} ({})\n\n",
                comment.user.username, comment.date
            ));
            content.push_str(&comment.comment_text);
            content.push_str("\n\n---\n\n");
        }
    }

    content.push_str("---\n\n");
    content.push_str("*Investigate this task and propose a solution.*\n");

    content
}

/// Load/refresh ClickUp task context for a session.
///
/// Fetches task detail + comments from ClickUp API, writes markdown to
/// shared `git-context/` directory, and tracks the reference.
#[tauri::command]
pub async fn load_clickup_task_context(
    app: tauri::AppHandle,
    session_id: String,
    task_id: String,
    workspace_id: String,
) -> Result<LoadedClickUpTaskContext, String> {
    log::trace!("Loading ClickUp task {task_id} context for session {session_id}");

    // Fetch task detail and comments in parallel
    let (task_result, comments_result) =
        tokio::join!(api::get_task(&task_id), api::get_task_comments(&task_id));

    let mut task = task_result?;
    let comments = comments_result?;
    let comment_count = comments.len() as u32;
    task.comments = comments;

    // Write to shared git-context directory
    let contexts_dir = github_issues::get_github_contexts_dir(&app)?;
    std::fs::create_dir_all(&contexts_dir)
        .map_err(|e| format!("Failed to create git-context directory: {e}"))?;

    // File format: clickup-task-{task_id}.md
    let context_file = contexts_dir.join(format!("clickup-task-{task_id}.md"));
    let context_content = format_clickup_task_context_markdown(&task);

    std::fs::write(&context_file, context_content)
        .map_err(|e| format!("Failed to write ClickUp task context file: {e}"))?;

    // Add reference tracking
    github_issues::add_clickup_task_reference(&app, &task_id, &session_id)?;

    log::trace!(
        "ClickUp task context loaded for task {} ({} comments)",
        task_id,
        comment_count
    );

    Ok(LoadedClickUpTaskContext {
        id: task.id,
        custom_id: task.custom_id,
        name: task.name,
        comment_count,
        workspace_id,
    })
}

/// List all loaded ClickUp task contexts for a session.
#[tauri::command]
pub async fn list_loaded_clickup_task_contexts(
    app: tauri::AppHandle,
    session_id: String,
    worktree_id: Option<String>,
) -> Result<Vec<LoadedClickUpTaskContext>, String> {
    log::trace!("Listing loaded ClickUp task contexts for session {session_id}");

    let mut task_keys = github_issues::get_session_clickup_task_refs(&app, &session_id)?;

    // Also check worktree_id refs (create_worktree stores refs under worktree_id)
    if let Some(ref wt_id) = worktree_id {
        if let Ok(wt_keys) = github_issues::get_session_clickup_task_refs(&app, wt_id) {
            for key in wt_keys {
                if !task_keys.contains(&key) {
                    task_keys.push(key);
                }
            }
        }
    }

    if task_keys.is_empty() {
        return Ok(vec![]);
    }

    let contexts_dir = github_issues::get_github_contexts_dir(&app)?;
    let mut contexts = Vec::new();

    for key in task_keys {
        // Key format: "clickup-{task_id}"
        let task_id = match key.strip_prefix("clickup-") {
            Some(id) => id,
            None => continue,
        };

        let context_file = contexts_dir.join(format!("clickup-task-{task_id}.md"));

        if let Ok(content) = std::fs::read_to_string(&context_file) {
            // Parse name from first line: "# ClickUp Task [CUSTOM-ID: ]Name"
            let name = content
                .lines()
                .next()
                .and_then(|line| line.strip_prefix("# ClickUp Task "))
                .map(|rest| {
                    // Strip custom ID prefix if present (e.g., "PROJ-42: Task name" -> "Task name")
                    if let Some((_prefix, after_colon)) = rest.split_once(": ") {
                        // Check if prefix looks like a custom ID (all uppercase/digits/dash)
                        if _prefix
                            .chars()
                            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
                        {
                            return after_colon.to_string();
                        }
                    }
                    rest.to_string()
                })
                .unwrap_or_else(|| format!("Task {task_id}"));

            // Extract custom ID from the header if present
            let custom_id = content
                .lines()
                .next()
                .and_then(|line| line.strip_prefix("# ClickUp Task "))
                .and_then(|rest| rest.split_once(": "))
                .and_then(|(prefix, _)| {
                    if prefix
                        .chars()
                        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
                    {
                        Some(prefix.to_string())
                    } else {
                        None
                    }
                });

            // Count comments by counting "### @" headers
            let comment_count = content.matches("### @").count() as u32;

            contexts.push(LoadedClickUpTaskContext {
                id: task_id.to_string(),
                custom_id,
                name,
                comment_count,
                workspace_id: String::new(), // Not stored in file, will be empty on reload
            });
        }
    }

    log::trace!("Found {} loaded ClickUp task contexts", contexts.len());
    Ok(contexts)
}

/// Remove a loaded ClickUp task context for a session.
#[tauri::command]
pub async fn remove_clickup_task_context(
    app: tauri::AppHandle,
    session_id: String,
    task_id: String,
) -> Result<(), String> {
    log::trace!("Removing ClickUp task {task_id} context for session {session_id}");

    // Remove reference
    let is_orphaned = github_issues::remove_clickup_task_reference(&app, &task_id, &session_id)?;

    // If orphaned, delete the shared file immediately
    if is_orphaned {
        let contexts_dir = github_issues::get_github_contexts_dir(&app)?;
        let context_file = contexts_dir.join(format!("clickup-task-{task_id}.md"));

        if context_file.exists() {
            std::fs::remove_file(&context_file)
                .map_err(|e| format!("Failed to remove ClickUp task context file: {e}"))?;
            log::trace!("Deleted orphaned ClickUp task context file");
        }
    }

    log::trace!("ClickUp task context removed successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_clickup_task_context_markdown_with_custom_id() {
        let task = ClickUpTaskDetail {
            id: "abc123".to_string(),
            custom_id: Some("PROJ-42".to_string()),
            name: "Fix the login bug".to_string(),
            description: Some("Users can't log in after password reset.".to_string()),
            markdown_description: None,
            status: ClickUpStatus {
                status: "open".to_string(),
                color: "#d3d3d3".to_string(),
                status_type: "open".to_string(),
            },
            date_created: "1700000000000".to_string(),
            url: "https://app.clickup.com/t/abc123".to_string(),
            comments: vec![ClickUpComment {
                comment_text: "I can reproduce this.".to_string(),
                user: ClickUpUser {
                    id: 1,
                    username: "alice".to_string(),
                    initials: "A".to_string(),
                },
                date: "1700000001000".to_string(),
            }],
        };

        let md = format_clickup_task_context_markdown(&task);

        assert!(md.starts_with("# ClickUp Task PROJ-42: Fix the login bug\n"));
        assert!(md.contains("## Description"));
        assert!(md.contains("Users can't log in after password reset."));
        assert!(md.contains("## Comments"));
        assert!(md.contains("### @alice"));
        assert!(md.contains("I can reproduce this."));
        assert!(md.contains("*Investigate this task and propose a solution.*"));
    }

    #[test]
    fn test_format_clickup_task_context_markdown_without_custom_id() {
        let task = ClickUpTaskDetail {
            id: "abc123".to_string(),
            custom_id: None,
            name: "Simple task".to_string(),
            description: None,
            markdown_description: None,
            status: ClickUpStatus {
                status: "open".to_string(),
                color: "#d3d3d3".to_string(),
                status_type: "open".to_string(),
            },
            date_created: "1700000000000".to_string(),
            url: "https://app.clickup.com/t/abc123".to_string(),
            comments: vec![],
        };

        let md = format_clickup_task_context_markdown(&task);

        assert!(md.starts_with("# ClickUp Task Simple task\n"));
        assert!(md.contains("*No description provided.*"));
        assert!(!md.contains("## Comments"));
    }

    #[test]
    fn test_format_clickup_task_context_markdown_empty_description() {
        let task = ClickUpTaskDetail {
            id: "abc123".to_string(),
            custom_id: None,
            name: "Task".to_string(),
            description: Some(String::new()),
            markdown_description: None,
            status: ClickUpStatus {
                status: "open".to_string(),
                color: "#d3d3d3".to_string(),
                status_type: "open".to_string(),
            },
            date_created: "1700000000000".to_string(),
            url: "https://app.clickup.com/t/abc123".to_string(),
            comments: vec![],
        };

        let md = format_clickup_task_context_markdown(&task);
        assert!(md.contains("*No description provided.*"));
    }
}

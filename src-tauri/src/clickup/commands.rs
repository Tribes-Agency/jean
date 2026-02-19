use super::api;
use super::keychain;
use super::types::*;
use crate::projects::github_issues;

/// Get the authenticated ClickUp user's profile.
#[tauri::command]
pub async fn clickup_get_user() -> Result<ClickUpAuthenticatedUser, String> {
    log::trace!("Getting authenticated ClickUp user");
    let user = api::get_authorized_user().await?;
    log::trace!("Got ClickUp user: {} (id: {})", user.username, user.id);
    Ok(user)
}

/// Get tasks assigned to the authenticated user across a workspace.
#[tauri::command]
pub async fn clickup_get_my_tasks(
    workspace_id: String,
    include_closed: bool,
) -> Result<ClickUpTaskListResult, String> {
    log::trace!("Getting ClickUp my tasks for workspace {workspace_id}");

    // Get user ID first
    let user = api::get_authorized_user().await?;

    // Fetch tasks assigned to this user with subtasks included
    let result = api::list_tasks(
        &workspace_id,
        &[],
        include_closed,
        0,
        Some(&[user.id]),
        true,
        None,
    )
    .await?;

    log::trace!(
        "Found {} tasks assigned to user {} (last_page: {})",
        result.tasks.len(),
        user.username,
        result.last_page
    );
    Ok(result)
}

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

/// Get the shared hierarchy (tasks, lists, folders shared with the user).
#[tauri::command]
pub async fn clickup_get_shared_hierarchy(
    workspace_id: String,
) -> Result<ClickUpSharedHierarchy, String> {
    log::trace!("Getting ClickUp shared hierarchy for workspace {workspace_id}");
    let shared = api::get_shared_hierarchy(&workspace_id).await?;
    log::trace!(
        "Got shared hierarchy: {} tasks, {} lists, {} folders",
        shared.tasks.len(),
        shared.lists.len(),
        shared.folders.len()
    );
    Ok(shared)
}

/// List tasks in a workspace, optionally filtered by space and/or search text.
#[tauri::command]
pub async fn clickup_list_tasks(
    workspace_id: String,
    space_ids: Vec<String>,
    include_closed: bool,
    page: u32,
    search: Option<String>,
) -> Result<ClickUpTaskListResult, String> {
    log::trace!("Listing ClickUp tasks for workspace {workspace_id}, page {page}, search={search:?}");
    let result = api::list_tasks(
        &workspace_id,
        &space_ids,
        include_closed,
        page,
        None,
        false,
        search.as_deref(),
    )
    .await?;
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
    subtasks: Option<bool>,
) -> Result<ClickUpTaskListResult, String> {
    let include_subtasks = subtasks.unwrap_or(true);
    log::trace!("Listing ClickUp tasks in list {list_id}, page {page}, subtasks={include_subtasks}");
    let result = api::list_tasks_in_list(&list_id, include_closed, page, include_subtasks).await?;
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

/// Get a single task's full detail including comments and subtasks.
#[tauri::command]
pub async fn clickup_get_task(task_id: String) -> Result<ClickUpTaskDetail, String> {
    log::trace!("Getting ClickUp task {task_id}");

    // Fetch task detail, comments, and subtasks in parallel
    let (task_result, comments_result, subtasks_result) = tokio::join!(
        api::get_task(&task_id),
        api::get_task_comments(&task_id),
        api::get_task_subtasks(&task_id)
    );

    let mut task = task_result?;
    let comments = comments_result?;
    task.comments = comments;
    task.subtasks = subtasks_result.unwrap_or_default();

    log::trace!(
        "Got ClickUp task {} with {} comments, {} subtasks",
        task_id,
        task.comments.len(),
        task.subtasks.len()
    );
    Ok(task)
}

/// Subtask info for inclusion in parent context file.
struct SubtaskInfo {
    id: String,
    name: String,
    status: String,
}

/// Format ClickUp task context as markdown for the context file.
fn format_clickup_task_context_markdown(
    task: &ClickUpTaskDetail,
    subtasks: &[SubtaskInfo],
) -> String {
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

    if !subtasks.is_empty() {
        content.push_str("## Subtasks\n\n");
        for sub in subtasks {
            content.push_str(&format!(
                "- **{}** [{}] — see `clickup-subtask-{}.md`\n",
                sub.name, sub.status, sub.id
            ));
        }
        content.push_str("\n");
    }

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

/// Format ClickUp subtask context as markdown.
fn format_clickup_subtask_context_markdown(
    subtask: &ClickUpTaskDetail,
    parent_id: &str,
    parent_name: &str,
) -> String {
    let mut content = String::new();

    let id_prefix = subtask
        .custom_id
        .as_deref()
        .map(|id| format!("{id}: "))
        .unwrap_or_default();
    content.push_str(&format!(
        "# ClickUp Subtask {id_prefix}{}\n\n",
        subtask.name
    ));
    content.push_str(&format!(
        "**Parent:** {parent_name} (`clickup-task-{parent_id}.md`)\n\n"
    ));

    content.push_str("---\n\n");

    content.push_str("## Description\n\n");
    if let Some(desc) = &subtask.description {
        if !desc.is_empty() {
            content.push_str(desc);
        } else {
            content.push_str("*No description provided.*");
        }
    } else {
        content.push_str("*No description provided.*");
    }
    content.push_str("\n\n");

    if !subtask.comments.is_empty() {
        content.push_str("## Comments\n\n");
        for comment in &subtask.comments {
            content.push_str(&format!(
                "### @{} ({})\n\n",
                comment.user.username, comment.date
            ));
            content.push_str(&comment.comment_text);
            content.push_str("\n\n---\n\n");
        }
    }

    content.push_str("---\n\n");
    content.push_str(&format!("*Context for parent task {parent_id}.*\n"));

    content
}

/// Load/refresh ClickUp task context for a session.
///
/// Fetches task detail + comments from ClickUp API, writes markdown to
/// shared `git-context/` directory, and tracks the reference.
/// Also fetches subtasks and writes separate context files for each.
#[tauri::command]
pub async fn load_clickup_task_context(
    app: tauri::AppHandle,
    session_id: String,
    task_id: String,
    workspace_id: String,
) -> Result<LoadedClickUpTaskContext, String> {
    log::trace!("Loading ClickUp task {task_id} context for session {session_id}");

    // Fetch task detail, comments, and subtasks in parallel
    let (task_result, comments_result, subtasks_result) = tokio::join!(
        api::get_task(&task_id),
        api::get_task_comments(&task_id),
        api::list_tasks(&workspace_id, &[], true, 0, None, true, None)
    );

    let mut task = task_result?;
    let comments = comments_result?;
    let comment_count = comments.len() as u32;
    task.comments = comments;

    // Identify subtasks (tasks with parent == task_id)
    let subtask_tasks: Vec<ClickUpTask> = subtasks_result
        .map(|result| {
            result
                .tasks
                .into_iter()
                .filter(|t| t.parent.as_deref() == Some(&task_id))
                .collect()
        })
        .unwrap_or_default();

    // Write to shared git-context directory
    let contexts_dir = github_issues::get_github_contexts_dir(&app)?;
    std::fs::create_dir_all(&contexts_dir)
        .map_err(|e| format!("Failed to create git-context directory: {e}"))?;

    // Fetch subtask details in parallel
    let mut subtask_infos = Vec::new();
    let mut subtask_futures = Vec::new();
    for sub in &subtask_tasks {
        let sub_id = sub.id.clone();
        subtask_futures.push(async move {
            let (detail, comments) =
                tokio::join!(api::get_task(&sub_id), api::get_task_comments(&sub_id));
            (sub_id, detail, comments)
        });
    }

    let subtask_results = futures_util::future::join_all(subtask_futures).await;

    let parent_name = task.name.clone();
    for (sub_id, detail_result, comments_result) in subtask_results {
        match (detail_result, comments_result) {
            (Ok(mut detail), Ok(sub_comments)) => {
                detail.comments = sub_comments;

                subtask_infos.push(SubtaskInfo {
                    id: detail.id.clone(),
                    name: detail.name.clone(),
                    status: detail.status.status.clone(),
                });

                // Write subtask context file
                let subtask_content =
                    format_clickup_subtask_context_markdown(&detail, &task_id, &parent_name);
                let subtask_file = contexts_dir.join(format!("clickup-subtask-{sub_id}.md"));
                std::fs::write(&subtask_file, subtask_content).map_err(|e| {
                    format!("Failed to write subtask context file for {sub_id}: {e}")
                })?;

                // Track subtask reference
                github_issues::add_clickup_task_reference(&app, &sub_id, &session_id)?;

                log::trace!("Wrote subtask context for {sub_id}");
            }
            (Err(e), _) => {
                log::warn!("Failed to fetch subtask {sub_id} detail: {e}");
            }
            (_, Err(e)) => {
                log::warn!("Failed to fetch subtask {sub_id} comments: {e}");
            }
        }
    }

    let subtask_count = subtask_infos.len() as u32;

    // Write parent task context file (with subtask references)
    let context_file = contexts_dir.join(format!("clickup-task-{task_id}.md"));
    let context_content = format_clickup_task_context_markdown(&task, &subtask_infos);

    std::fs::write(&context_file, context_content)
        .map_err(|e| format!("Failed to write ClickUp task context file: {e}"))?;

    // Add parent reference tracking
    github_issues::add_clickup_task_reference(&app, &task_id, &session_id)?;

    log::trace!(
        "ClickUp task context loaded for task {} ({} comments, {} subtasks)",
        task_id,
        comment_count,
        subtask_count
    );

    Ok(LoadedClickUpTaskContext {
        id: task.id,
        custom_id: task.custom_id,
        name: task.name,
        comment_count,
        workspace_id,
        subtask_count,
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

            // Count subtasks by counting lines matching "see `clickup-subtask-"
            let subtask_count = content
                .matches("see `clickup-subtask-")
                .count() as u32;

            contexts.push(LoadedClickUpTaskContext {
                id: task_id.to_string(),
                custom_id,
                name,
                comment_count,
                workspace_id: String::new(), // Not stored in file, will be empty on reload
                subtask_count,
            });
        }
    }

    log::trace!("Found {} loaded ClickUp task contexts", contexts.len());
    Ok(contexts)
}

/// Remove a loaded ClickUp task context for a session.
/// Also removes any subtask context files associated with the parent task.
#[tauri::command]
pub async fn remove_clickup_task_context(
    app: tauri::AppHandle,
    session_id: String,
    task_id: String,
) -> Result<(), String> {
    log::trace!("Removing ClickUp task {task_id} context for session {session_id}");

    // Remove parent reference
    let is_orphaned = github_issues::remove_clickup_task_reference(&app, &task_id, &session_id)?;

    if is_orphaned {
        let contexts_dir = github_issues::get_github_contexts_dir(&app)?;

        // Delete the parent context file
        let context_file = contexts_dir.join(format!("clickup-task-{task_id}.md"));
        if context_file.exists() {
            std::fs::remove_file(&context_file)
                .map_err(|e| format!("Failed to remove ClickUp task context file: {e}"))?;
            log::trace!("Deleted orphaned ClickUp task context file");
        }

        // Find and delete subtask context files (clickup-subtask-*.md)
        // We scan for files that reference this parent in their content
        if let Ok(entries) = std::fs::read_dir(&contexts_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let filename = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default();

                if filename.starts_with("clickup-subtask-") && filename.ends_with(".md") {
                    // Check if this subtask belongs to the parent being removed
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if content.contains(&format!("clickup-task-{task_id}.md")) {
                            // Extract subtask ID from filename
                            if let Some(sub_id) = filename
                                .strip_prefix("clickup-subtask-")
                                .and_then(|s| s.strip_suffix(".md"))
                            {
                                // Remove subtask reference
                                let _ = github_issues::remove_clickup_task_reference(
                                    &app, sub_id, &session_id,
                                );
                            }
                            let _ = std::fs::remove_file(&path);
                            log::trace!("Deleted subtask context file: {filename}");
                        }
                    }
                }
            }
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

        let md = format_clickup_task_context_markdown(&task, &[]);

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

        let md = format_clickup_task_context_markdown(&task, &[]);

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

        let md = format_clickup_task_context_markdown(&task, &[]);
        assert!(md.contains("*No description provided.*"));
    }

    #[test]
    fn test_format_clickup_task_context_with_subtasks() {
        let task = ClickUpTaskDetail {
            id: "parent1".to_string(),
            custom_id: None,
            name: "Parent task".to_string(),
            description: Some("Parent description.".to_string()),
            markdown_description: None,
            status: ClickUpStatus {
                status: "open".to_string(),
                color: "#d3d3d3".to_string(),
                status_type: "open".to_string(),
            },
            date_created: "1700000000000".to_string(),
            url: "https://app.clickup.com/t/parent1".to_string(),
            comments: vec![],
        };

        let subtasks = vec![
            SubtaskInfo {
                id: "sub1".to_string(),
                name: "Subtask one".to_string(),
                status: "open".to_string(),
            },
            SubtaskInfo {
                id: "sub2".to_string(),
                name: "Subtask two".to_string(),
                status: "in progress".to_string(),
            },
        ];

        let md = format_clickup_task_context_markdown(&task, &subtasks);

        assert!(md.contains("## Subtasks"));
        assert!(md.contains("**Subtask one** [open] — see `clickup-subtask-sub1.md`"));
        assert!(md.contains("**Subtask two** [in progress] — see `clickup-subtask-sub2.md`"));
    }

    #[test]
    fn test_format_clickup_subtask_context_markdown() {
        let subtask = ClickUpTaskDetail {
            id: "sub1".to_string(),
            custom_id: Some("PROJ-43".to_string()),
            name: "Subtask name".to_string(),
            description: Some("Subtask description.".to_string()),
            markdown_description: None,
            status: ClickUpStatus {
                status: "open".to_string(),
                color: "#d3d3d3".to_string(),
                status_type: "open".to_string(),
            },
            date_created: "1700000000000".to_string(),
            url: "https://app.clickup.com/t/sub1".to_string(),
            comments: vec![ClickUpComment {
                comment_text: "Working on it.".to_string(),
                user: ClickUpUser {
                    id: 1,
                    username: "bob".to_string(),
                    initials: "B".to_string(),
                },
                date: "1700000002000".to_string(),
            }],
        };

        let md = format_clickup_subtask_context_markdown(&subtask, "parent1", "Parent task");

        assert!(md.starts_with("# ClickUp Subtask PROJ-43: Subtask name\n"));
        assert!(md.contains("**Parent:** Parent task (`clickup-task-parent1.md`)"));
        assert!(md.contains("Subtask description."));
        assert!(md.contains("### @bob"));
        assert!(md.contains("Working on it."));
        assert!(md.contains("*Context for parent task parent1.*"));
    }
}

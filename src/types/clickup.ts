/**
 * ClickUp types matching Rust structs in src-tauri/src/clickup/types.rs
 *
 * All Rust structs use #[serde(rename_all = "camelCase")], so field names
 * are camelCase here (Pattern B from CLAUDE.md).
 */

export interface ClickUpStatus {
  status: string
  color: string
  /** "open" | "closed" | "custom" — renamed from status_type via #[serde(rename = "type")] */
  type: string
}

export interface ClickUpUser {
  id: number
  username: string
  initials: string
}

export interface ClickUpTask {
  id: string
  customId: string | null
  name: string
  status: ClickUpStatus
  dateCreated: string // Unix ms as string
  url: string
  /** Parent task ID (null for top-level tasks, set when subtasks=true) */
  parent: string | null
  /** Task assignees */
  assignees: ClickUpUser[]
}

export interface ClickUpComment {
  commentText: string
  user: ClickUpUser
  date: string
}

export interface ClickUpTaskDetail {
  id: string
  customId: string | null
  name: string
  description: string | null
  markdownDescription: string | null
  status: ClickUpStatus
  dateCreated: string
  url: string
  comments: ClickUpComment[]
}

export interface ClickUpWorkspace {
  id: string
  name: string
}

export interface ClickUpSpace {
  id: string
  name: string
}

export interface ClickUpList {
  id: string
  name: string
  taskCount: string | null
  archived: boolean
}

export interface ClickUpFolder {
  id: string
  name: string
  taskCount: string | null
  lists: ClickUpList[]
}

export interface ClickUpSpaceHierarchy {
  spaceId: string
  folders: ClickUpFolder[]
  folderlessLists: ClickUpList[]
}

export interface ClickUpAuthStatus {
  authenticated: boolean
  error: string | null
}

export interface ClickUpTaskListResult {
  tasks: ClickUpTask[]
  lastPage: boolean
}

export interface LoadedClickUpTaskContext {
  id: string
  customId: string | null
  name: string
  commentCount: number
  workspaceId: string
  subtaskCount: number
}

export interface ClickUpAuthenticatedUser {
  id: number
  username: string
  email: string
  color: string | null
  profilePicture: string | null
  initials: string | null
}

export type IssueSource = 'github' | 'clickup'

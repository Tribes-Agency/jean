import { useQuery } from '@tanstack/react-query'
import { invoke } from '@/lib/transport'
import { logger } from '@/lib/logger'
import type {
  ClickUpAuthenticatedUser,
  ClickUpAuthStatus,
  ClickUpWorkspace,
  ClickUpSpace,
  ClickUpTask,
  ClickUpTaskDetail,
  ClickUpTaskListResult,
  ClickUpSpaceHierarchy,
  ClickUpSharedHierarchy,
  LoadedClickUpTaskContext,
} from '@/types/clickup'
import { isTauri } from './projects'

// Query keys for ClickUp
export const clickupQueryKeys = {
  all: ['clickup'] as const,
  auth: () => [...clickupQueryKeys.all, 'auth'] as const,
  workspaces: () => [...clickupQueryKeys.all, 'workspaces'] as const,
  spaces: (workspaceId: string) =>
    [...clickupQueryKeys.all, 'spaces', workspaceId] as const,
  tasks: (workspaceId: string, spaceId: string, includeClosed: boolean) =>
    [
      ...clickupQueryKeys.all,
      'tasks',
      workspaceId,
      spaceId,
      includeClosed,
    ] as const,
  spaceHierarchy: (spaceId: string) =>
    [...clickupQueryKeys.all, 'space-hierarchy', spaceId] as const,
  listTasks: (listId: string, includeClosed: boolean) =>
    [...clickupQueryKeys.all, 'list-tasks', listId, includeClosed] as const,
  taskLookup: (query: string, workspaceId: string) =>
    [...clickupQueryKeys.all, 'task-lookup', query, workspaceId] as const,
  task: (taskId: string) => [...clickupQueryKeys.all, 'task', taskId] as const,
  loadedContexts: (sessionId: string) =>
    [...clickupQueryKeys.all, 'loaded-contexts', sessionId] as const,
  sharedHierarchy: (workspaceId: string) =>
    [...clickupQueryKeys.all, 'shared-hierarchy', workspaceId] as const,
  user: () => [...clickupQueryKeys.all, 'user'] as const,
  myTasks: (workspaceId: string, includeClosed: boolean) =>
    [
      ...clickupQueryKeys.all,
      'myTasks',
      workspaceId,
      includeClosed,
    ] as const,
}

/**
 * Hook to check ClickUp authentication status
 */
export function useClickUpAuth(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clickupQueryKeys.auth(),
    queryFn: async (): Promise<ClickUpAuthStatus> => {
      if (!isTauri()) {
        return { authenticated: false, error: null }
      }

      try {
        logger.debug('Checking ClickUp auth status')
        const status = await invoke<ClickUpAuthStatus>('clickup_check_auth')
        logger.debug('ClickUp auth status', {
          authenticated: status.authenticated,
        })
        return status
      } catch (error) {
        logger.error('Failed to check ClickUp auth', { error })
        return { authenticated: false, error: String(error) }
      }
    },
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10,
  })
}

/**
 * Hook to get the authenticated ClickUp user profile.
 * Cached indefinitely since user data doesn't change during a session.
 */
export function useClickUpUser(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clickupQueryKeys.user(),
    queryFn: async (): Promise<ClickUpAuthenticatedUser> => {
      if (!isTauri()) {
        throw new Error('Not running in Tauri')
      }

      logger.debug('Fetching authenticated ClickUp user')
      const user = await invoke<ClickUpAuthenticatedUser>('clickup_get_user')
      logger.info('ClickUp user loaded', {
        id: user.id,
        username: user.username,
      })
      return user
    },
    enabled: options?.enabled ?? true,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  })
}

/**
 * Hook to get tasks assigned to the authenticated user across a workspace.
 */
export function useClickUpMyTasks(
  workspaceId: string | null,
  includeClosed = false,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: clickupQueryKeys.myTasks(workspaceId ?? '', includeClosed),
    queryFn: async (): Promise<ClickUpTaskListResult> => {
      if (!isTauri() || !workspaceId) {
        return { tasks: [], lastPage: true }
      }

      logger.debug('Fetching ClickUp my tasks', { workspaceId, includeClosed })
      const result = await invoke<ClickUpTaskListResult>(
        'clickup_get_my_tasks',
        { workspaceId, includeClosed }
      )
      logger.info('ClickUp my tasks loaded', {
        count: result.tasks.length,
        lastPage: result.lastPage,
      })
      return result
    },
    enabled: (options?.enabled ?? true) && !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })
}

/**
 * Hook to list ClickUp workspaces
 */
export function useClickUpWorkspaces(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clickupQueryKeys.workspaces(),
    queryFn: async (): Promise<ClickUpWorkspace[]> => {
      if (!isTauri()) {
        return []
      }

      try {
        logger.debug('Fetching ClickUp workspaces')
        const workspaces = await invoke<ClickUpWorkspace[]>(
          'clickup_list_workspaces'
        )
        logger.info('ClickUp workspaces loaded', { count: workspaces.length })
        return workspaces
      } catch (error) {
        logger.error('Failed to load ClickUp workspaces', { error })
        throw error
      }
    },
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })
}

/**
 * Hook to list spaces in a workspace
 */
export function useClickUpSpaces(
  workspaceId: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: clickupQueryKeys.spaces(workspaceId ?? ''),
    queryFn: async (): Promise<ClickUpSpace[]> => {
      if (!isTauri() || !workspaceId) {
        return []
      }

      try {
        logger.debug('Fetching ClickUp spaces', { workspaceId })
        const spaces = await invoke<ClickUpSpace[]>('clickup_list_spaces', {
          workspaceId,
        })
        logger.info('ClickUp spaces loaded', { count: spaces.length })
        return spaces
      } catch (error) {
        logger.error('Failed to load ClickUp spaces', { error })
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })
}

/**
 * Hook to get a space's hierarchy (folders + folderless lists)
 */
export function useClickUpSpaceHierarchy(
  spaceId: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: clickupQueryKeys.spaceHierarchy(spaceId ?? ''),
    queryFn: async (): Promise<ClickUpSpaceHierarchy> => {
      if (!isTauri() || !spaceId) {
        throw new Error('Missing required parameters')
      }

      try {
        logger.debug('Fetching ClickUp space hierarchy', { spaceId })
        const hierarchy = await invoke<ClickUpSpaceHierarchy>(
          'clickup_get_space_hierarchy',
          { spaceId }
        )
        logger.info('ClickUp space hierarchy loaded', {
          spaceId,
          folders: hierarchy.folders.length,
          folderlessLists: hierarchy.folderlessLists.length,
        })
        return hierarchy
      } catch (error) {
        logger.error('Failed to load ClickUp space hierarchy', {
          error,
          spaceId,
        })
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && !!spaceId,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })
}

/**
 * Hook to get the shared hierarchy (tasks, lists, folders shared with the user)
 */
export function useClickUpSharedHierarchy(
  workspaceId: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: clickupQueryKeys.sharedHierarchy(workspaceId ?? ''),
    queryFn: async (): Promise<ClickUpSharedHierarchy> => {
      if (!isTauri() || !workspaceId) {
        return { tasks: [], lists: [], folders: [] }
      }

      logger.debug('Fetching ClickUp shared hierarchy', { workspaceId })
      const shared = await invoke<ClickUpSharedHierarchy>(
        'clickup_get_shared_hierarchy',
        { workspaceId }
      )
      logger.info('ClickUp shared hierarchy loaded', {
        tasks: shared.tasks.length,
        lists: shared.lists.length,
        folders: shared.folders.length,
      })
      return shared
    },
    enabled: (options?.enabled ?? true) && !!workspaceId,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })
}

/**
 * Hook to list tasks in a specific ClickUp list
 */
export function useClickUpListTasks(
  listId: string | null,
  includeClosed = false,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: clickupQueryKeys.listTasks(listId ?? '', includeClosed),
    queryFn: async (): Promise<ClickUpTaskListResult> => {
      if (!isTauri() || !listId) {
        return { tasks: [], lastPage: true }
      }

      try {
        logger.debug('Fetching ClickUp list tasks', { listId, includeClosed })
        const result = await invoke<ClickUpTaskListResult>(
          'clickup_list_tasks_in_list',
          { listId, includeClosed, page: 0, subtasks: true }
        )
        logger.info('ClickUp list tasks loaded', {
          listId,
          count: result.tasks.length,
          lastPage: result.lastPage,
        })
        return result
      } catch (error) {
        logger.error('Failed to load ClickUp list tasks', { error, listId })
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && !!listId,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })
}

/**
 * Hook to list ClickUp tasks for a workspace/space
 *
 * Fetches the first page (100 tasks). Pagination can be added later if needed.
 */
export function useClickUpTasks(
  workspaceId: string | null,
  spaceId: string | null,
  includeClosed = false,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: clickupQueryKeys.tasks(
      workspaceId ?? '',
      spaceId ?? '',
      includeClosed
    ),
    queryFn: async (): Promise<ClickUpTaskListResult> => {
      if (!isTauri() || !workspaceId || !spaceId) {
        return { tasks: [], lastPage: true }
      }

      try {
        logger.debug('Fetching ClickUp tasks', {
          workspaceId,
          spaceId,
          includeClosed,
        })
        const result = await invoke<ClickUpTaskListResult>(
          'clickup_list_tasks',
          {
            workspaceId,
            spaceIds: [spaceId],
            includeClosed,
            page: 0,
          }
        )
        logger.info('ClickUp tasks loaded', {
          count: result.tasks.length,
          lastPage: result.lastPage,
        })
        return result
      } catch (error) {
        logger.error('Failed to load ClickUp tasks', { error })
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && !!workspaceId && !!spaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })
}

/**
 * Hook to get a single ClickUp task detail with comments
 */
export function useClickUpTask(taskId: string | null) {
  return useQuery({
    queryKey: clickupQueryKeys.task(taskId ?? ''),
    queryFn: async (): Promise<ClickUpTaskDetail> => {
      if (!isTauri() || !taskId) {
        throw new Error('Missing required parameters')
      }

      try {
        logger.debug('Fetching ClickUp task detail', { taskId })
        const task = await invoke<ClickUpTaskDetail>('clickup_get_task', {
          taskId,
        })
        logger.info('ClickUp task loaded', { id: task.id, name: task.name })
        return task
      } catch (error) {
        logger.error('Failed to load ClickUp task', { error, taskId })
        throw error
      }
    },
    enabled: !!taskId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15,
  })
}

/** Check if a query looks like it could be a ClickUp task ID (alphanumeric, 5-15 chars, no spaces) */
function looksLikeTaskId(query: string): boolean {
  const trimmed = query.trim()
  return /^[a-zA-Z0-9_-]{5,20}$/.test(trimmed)
}

/**
 * Hook to look up a ClickUp task directly by internal ID or custom ID.
 * Enabled only when the query looks like a task ID.
 */
export function useClickUpTaskLookup(
  query: string,
  workspaceId: string | null
) {
  const trimmedQuery = query.trim()
  const enabled =
    !!workspaceId && !!trimmedQuery && looksLikeTaskId(trimmedQuery)

  return useQuery({
    queryKey: clickupQueryKeys.taskLookup(trimmedQuery, workspaceId ?? ''),
    queryFn: async (): Promise<ClickUpTask | null> => {
      if (!isTauri() || !workspaceId || !trimmedQuery) {
        return null
      }

      try {
        logger.debug('Looking up ClickUp task by ID', {
          query: trimmedQuery,
          workspaceId,
        })
        const task = await invoke<ClickUpTask | null>(
          'clickup_search_task_by_id',
          { query: trimmedQuery, workspaceId }
        )
        logger.info('ClickUp task lookup result', {
          query: trimmedQuery,
          found: !!task,
        })
        return task
      } catch (error) {
        logger.error('Failed to look up ClickUp task by ID', {
          error,
          query: trimmedQuery,
        })
        return null
      }
    },
    enabled,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5,
    retry: 0,
  })
}

/**
 * Hook to list loaded ClickUp task contexts for a session
 */
export function useLoadedClickUpTaskContexts(
  sessionId: string | null,
  worktreeId?: string | null
) {
  return useQuery({
    queryKey: clickupQueryKeys.loadedContexts(sessionId ?? ''),
    queryFn: async (): Promise<LoadedClickUpTaskContext[]> => {
      if (!isTauri() || !sessionId) {
        return []
      }

      try {
        logger.debug('Fetching loaded ClickUp task contexts', { sessionId })
        const contexts = await invoke<LoadedClickUpTaskContext[]>(
          'list_loaded_clickup_task_contexts',
          {
            sessionId,
            worktreeId: worktreeId ?? undefined,
          }
        )
        logger.info('Loaded ClickUp task contexts fetched', {
          count: contexts.length,
        })
        return contexts
      } catch (error) {
        logger.error('Failed to load ClickUp task contexts', {
          error,
          sessionId,
        })
        throw error
      }
    },
    enabled: !!sessionId,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5,
  })
}

/**
 * Load ClickUp task context for a session (fetch from API and save)
 */
export async function loadClickUpTaskContext(
  sessionId: string,
  taskId: string,
  workspaceId: string
): Promise<LoadedClickUpTaskContext> {
  return invoke<LoadedClickUpTaskContext>('load_clickup_task_context', {
    sessionId,
    taskId,
    workspaceId,
  })
}

/**
 * Remove a loaded ClickUp task context from a session
 */
export async function removeClickUpTaskContext(
  sessionId: string,
  taskId: string
): Promise<void> {
  return invoke('remove_clickup_task_context', {
    sessionId,
    taskId,
  })
}

const NEW_TASK_CUTOFF_MS = 24 * 60 * 60 * 1000

/** Check if a task was created within the last 24 hours */
export function isNewTask(dateCreated: string): boolean {
  // ClickUp returns dateCreated as Unix milliseconds string
  return Date.now() - parseInt(dateCreated, 10) < NEW_TASK_CUTOFF_MS
}

/**
 * Filter tasks by search query (name and custom ID)
 *
 * Used for client-side filtering since ClickUp has no search API
 */
export function filterClickUpTasks(
  tasks: ClickUpTask[],
  query: string
): ClickUpTask[] {
  if (!query.trim()) {
    return tasks
  }

  const lowerQuery = query.toLowerCase().trim()

  return tasks.filter(task => {
    // Match by internal task ID
    if (task.id.toLowerCase().includes(lowerQuery)) {
      return true
    }

    // Match by custom ID (e.g., "PROJ-42")
    if (task.customId?.toLowerCase().includes(lowerQuery)) {
      return true
    }

    // Match by task name
    if (task.name.toLowerCase().includes(lowerQuery)) {
      return true
    }

    return false
  })
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import {
  clickupQueryKeys,
  useClickUpUser,
  useClickUpMyTasks,
  useClickUpListTasks,
  useClickUpSharedHierarchy,
  filterClickUpTasks,
} from './clickup'
import type { ClickUpTask } from '@/types/clickup'

const mockInvoke = vi.fn()

vi.mock('@/lib/transport', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('./projects', () => ({
  isTauri: vi.fn(() => true),
}))

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

function createWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  Wrapper.displayName = 'TestQueryWrapper'
  return Wrapper
}

describe('clickupQueryKeys', () => {
  it('creates correct user query key', () => {
    expect(clickupQueryKeys.user()).toEqual(['clickup', 'user'])
  })

  it('creates correct myTasks query key', () => {
    expect(clickupQueryKeys.myTasks('ws123', false)).toEqual([
      'clickup',
      'myTasks',
      'ws123',
      false,
    ])
  })

  it('creates correct myTasks query key with includeClosed', () => {
    expect(clickupQueryKeys.myTasks('ws456', true)).toEqual([
      'clickup',
      'myTasks',
      'ws456',
      true,
    ])
  })

  it('creates correct sharedHierarchy query key', () => {
    expect(clickupQueryKeys.sharedHierarchy('ws123')).toEqual([
      'clickup',
      'shared-hierarchy',
      'ws123',
    ])
  })
})

describe('useClickUpUser', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockInvoke.mockReset()
  })

  it('fetches user when enabled', async () => {
    const mockUser = {
      id: 123,
      username: 'testuser',
      email: 'test@example.com',
      color: null,
      profilePicture: null,
      initials: 'TU',
    }
    mockInvoke.mockResolvedValueOnce(mockUser)

    const { result } = renderHook(() => useClickUpUser(), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockUser)
    expect(mockInvoke).toHaveBeenCalledWith('clickup_get_user')
  })

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(
      () => useClickUpUser({ enabled: false }),
      { wrapper: createWrapper(queryClient) }
    )

    // Give it a tick to ensure no fetch is triggered
    await new Promise(r => setTimeout(r, 50))
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})

describe('useClickUpMyTasks', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockInvoke.mockReset()
  })

  it('fetches my tasks when workspaceId is provided', async () => {
    const mockResult = { tasks: [], lastPage: true }
    mockInvoke.mockResolvedValueOnce(mockResult)

    const { result } = renderHook(
      () => useClickUpMyTasks('ws123', false),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockResult)
    expect(mockInvoke).toHaveBeenCalledWith('clickup_get_my_tasks', {
      workspaceId: 'ws123',
      includeClosed: false,
    })
  })

  it('does not fetch when workspaceId is null', async () => {
    const { result } = renderHook(
      () => useClickUpMyTasks(null, false),
      { wrapper: createWrapper(queryClient) }
    )

    await new Promise(r => setTimeout(r, 50))
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('does not fetch when explicitly disabled', async () => {
    const { result } = renderHook(
      () => useClickUpMyTasks('ws123', false, { enabled: false }),
      { wrapper: createWrapper(queryClient) }
    )

    await new Promise(r => setTimeout(r, 50))
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('passes includeClosed parameter correctly', async () => {
    mockInvoke.mockResolvedValueOnce({ tasks: [], lastPage: true })

    const { result } = renderHook(
      () => useClickUpMyTasks('ws123', true),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockInvoke).toHaveBeenCalledWith('clickup_get_my_tasks', {
      workspaceId: 'ws123',
      includeClosed: true,
    })
  })
})

describe('useClickUpListTasks', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockInvoke.mockReset()
  })

  it('passes subtasks: true to the command', async () => {
    mockInvoke.mockResolvedValueOnce({ tasks: [], lastPage: true })

    const { result } = renderHook(
      () => useClickUpListTasks('list123', false),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockInvoke).toHaveBeenCalledWith('clickup_list_tasks_in_list', {
      listId: 'list123',
      includeClosed: false,
      page: 0,
      subtasks: true,
    })
  })
})

describe('useClickUpSharedHierarchy', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockInvoke.mockReset()
  })

  it('fetches shared hierarchy when workspaceId is provided', async () => {
    const mockResult = { tasks: [], lists: [], folders: [] }
    mockInvoke.mockResolvedValueOnce(mockResult)

    const { result } = renderHook(
      () => useClickUpSharedHierarchy('ws123'),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockResult)
    expect(mockInvoke).toHaveBeenCalledWith(
      'clickup_get_shared_hierarchy',
      { workspaceId: 'ws123' }
    )
  })

  it('does not fetch when workspaceId is null', async () => {
    const { result } = renderHook(
      () => useClickUpSharedHierarchy(null),
      { wrapper: createWrapper(queryClient) }
    )

    await new Promise(r => setTimeout(r, 50))
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})

describe('filterClickUpTasks', () => {
  const makeMockTask = (overrides: Partial<ClickUpTask>): ClickUpTask => ({
    id: 'task1',
    customId: null,
    name: 'Test task',
    status: { status: 'open', color: '#d3d3d3', type: 'open' },
    dateCreated: '1700000000000',
    url: 'https://app.clickup.com/t/task1',
    parent: null,
    assignees: [],
    ...overrides,
  })

  it('returns all tasks for empty query', () => {
    const tasks = [makeMockTask({ id: '1' }), makeMockTask({ id: '2' })]
    expect(filterClickUpTasks(tasks, '')).toEqual(tasks)
    expect(filterClickUpTasks(tasks, '  ')).toEqual(tasks)
  })

  it('filters by task name', () => {
    const tasks = [
      makeMockTask({ id: '1', name: 'Fix login bug' }),
      makeMockTask({ id: '2', name: 'Add dark mode' }),
    ]
    const result = filterClickUpTasks(tasks, 'login')
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Fix login bug')
  })

  it('filters by custom ID', () => {
    const tasks = [
      makeMockTask({ id: '1', customId: 'PROJ-42' }),
      makeMockTask({ id: '2', customId: 'PROJ-99' }),
    ]
    const result = filterClickUpTasks(tasks, 'PROJ-42')
    expect(result).toHaveLength(1)
    expect(result[0]?.customId).toBe('PROJ-42')
  })

  it('filters by internal ID', () => {
    const tasks = [
      makeMockTask({ id: 'abc123' }),
      makeMockTask({ id: 'xyz789' }),
    ]
    const result = filterClickUpTasks(tasks, 'abc')
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('abc123')
  })

  it('is case-insensitive', () => {
    const tasks = [makeMockTask({ name: 'Fix Login Bug' })]
    expect(filterClickUpTasks(tasks, 'fix login')).toHaveLength(1)
    expect(filterClickUpTasks(tasks, 'FIX LOGIN')).toHaveLength(1)
  })
})

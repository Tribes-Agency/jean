import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, RefreshCw, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { invoke } from '@/lib/transport'
import { usePreferences } from '@/services/preferences'
import {
  filterClickUpTasks,
  clickupQueryKeys,
  useClickUpTaskLookup,
} from '@/services/clickup'
import { isTauri } from '@/services/projects'
import type { ClickUpTask, ClickUpTaskListResult } from '@/types/clickup'
import { ClickUpTaskItem } from './ClickUpTaskItem'
import { CollapsibleTreeView } from './CollapsibleTreeView'
import { MyTasksSection } from './MyTasksSection'

interface ClickUpTasksPanelProps {
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
  searchInputRef: React.RefObject<HTMLInputElement | null>
  searchQuery: string
  setSearchQuery: (query: string) => void
  includeClosed: boolean
  setIncludeClosed: (include: boolean) => void
}

export function ClickUpTasksPanel({
  selectedIndex,
  setSelectedIndex,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  includeClosed,
  setIncludeClosed,
}: ClickUpTasksPanelProps) {
  const queryClient = useQueryClient()
  const { data: preferences } = usePreferences()

  const workspaceId = preferences?.clickup_workspace_id ?? null

  // Flat search mode: fetch all tasks workspace-wide (no space filter)
  const isSearching = searchQuery.trim().length > 0

  const {
    data: taskResult,
    isLoading: isLoadingTasks,
    isFetching: isRefetching,
    error: tasksError,
    refetch,
  } = useQuery({
    queryKey: [
      ...clickupQueryKeys.all,
      'workspace-tasks',
      workspaceId,
      includeClosed,
    ],
    queryFn: async (): Promise<ClickUpTaskListResult> => {
      if (!isTauri() || !workspaceId) {
        return { tasks: [], lastPage: true }
      }
      return invoke<ClickUpTaskListResult>('clickup_list_tasks', {
        workspaceId,
        spaceIds: [],
        includeClosed,
        page: 0,
      })
    },
    enabled: isSearching && !!workspaceId,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  })

  // Direct task lookup by ID (runs in parallel with workspace search)
  const { data: directLookupTask, isLoading: isLookingUp } =
    useClickUpTaskLookup(searchQuery, workspaceId)

  const tasks = useMemo(() => {
    const filtered = filterClickUpTasks(taskResult?.tasks ?? [], searchQuery)

    // If direct lookup found a task, prepend it (deduplicated)
    if (directLookupTask) {
      const isDuplicate = filtered.some(t => t.id === directLookupTask.id)
      if (!isDuplicate) {
        return [directLookupTask, ...filtered]
      }
    }

    return filtered
  }, [taskResult?.tasks, searchQuery, directLookupTask])

  const handleRefresh = () => {
    // Invalidate all clickup queries to refresh everything
    queryClient.invalidateQueries({ queryKey: clickupQueryKeys.all })
    if (isSearching) {
      refetch()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search, filters */}
      <div className="p-3 space-y-2 border-b border-border">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search tasks by ID or name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleRefresh}
                disabled={isRefetching}
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-md border border-border',
                  'hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                  'transition-colors',
                  isRefetching && 'opacity-50 cursor-not-allowed'
                )}
              >
                <RefreshCw
                  className={cn(
                    'h-4 w-4 text-muted-foreground',
                    isRefetching && 'animate-spin'
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-closed-tasks"
            checked={includeClosed}
            onCheckedChange={checked => setIncludeClosed(checked === true)}
          />
          <label
            htmlFor="include-closed-tasks"
            className="text-xs text-muted-foreground cursor-pointer"
          >
            Include closed tasks
          </label>
        </div>
      </div>

      {/* Content area */}
      {workspaceId ? (
        isSearching ? (
          /* Flat search mode — workspace-wide search results */
          <ScrollArea className="flex-1">
            {(isLoadingTasks || (isLookingUp && tasks.length === 0)) && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading tasks...
                </span>
              </div>
            )}

            {tasksError && (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <AlertCircle className="h-5 w-5 text-destructive mb-2" />
                <span className="text-sm text-muted-foreground">
                  {tasksError.message || 'Failed to load tasks'}
                </span>
              </div>
            )}

            {!isLoadingTasks &&
              !isLookingUp &&
              !tasksError &&
              tasks.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <span className="text-sm text-muted-foreground">
                    No tasks match your search
                  </span>
                </div>
              )}

            {!(isLoadingTasks || (isLookingUp && tasks.length === 0)) &&
              !tasksError &&
              tasks.length > 0 && (
                <div className="py-1">
                  {tasks.map((task, index) => (
                    <ClickUpTaskItem
                      key={task.id}
                      task={task}
                      index={index}
                      isSelected={index === selectedIndex}
                      isCreating={creatingFromTaskId === task.id}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={bg => onSelectTask(task, bg)}
                      onInvestigate={bg => onInvestigateTask(task, bg)}
                      onPreview={() => onPreviewTask(task)}
                    />
                  ))}
                </div>
              )}
          </ScrollArea>
        ) : (
          /* Browse mode — My Tasks + Collapsible Tree */
          <ScrollArea className="flex-1">
            <MyTasksSection
              workspaceId={workspaceId}
              includeClosed={includeClosed}
              onSelectTask={onSelectTask}
              onInvestigateTask={onInvestigateTask}
              onPreviewTask={onPreviewTask}
              creatingFromTaskId={creatingFromTaskId}
            />
            <CollapsibleTreeView
              workspaceId={workspaceId}
              includeClosed={includeClosed}
              onSelectTask={onSelectTask}
              onInvestigateTask={onInvestigateTask}
              onPreviewTask={onPreviewTask}
              creatingFromTaskId={creatingFromTaskId}
            />
          </ScrollArea>
        )
      ) : (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">
            No workspace configured
          </span>
        </div>
      )}
    </div>
  )
}

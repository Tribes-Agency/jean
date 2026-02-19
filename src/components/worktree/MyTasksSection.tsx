import { useState, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  User,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useClickUpMyTasks, filterClickUpTasks } from '@/services/clickup'
import type { ClickUpTask } from '@/types/clickup'
import { ClickUpTaskItem } from './ClickUpTaskItem'
import { cn } from '@/lib/utils'

interface MyTasksSectionProps {
  workspaceId: string
  includeClosed: boolean
  searchQuery?: string
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}

export function MyTasksSection({
  workspaceId,
  includeClosed,
  searchQuery,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: MyTasksSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const {
    data: taskResult,
    isLoading,
    error,
    refetch,
  } = useClickUpMyTasks(workspaceId, includeClosed)

  // Filter and group tasks
  const { parentTasks, subtasksByParent } = useMemo(() => {
    if (!taskResult?.tasks) {
      return { parentTasks: [], subtasksByParent: new Map<string, ClickUpTask[]>() }
    }

    const filtered = searchQuery?.trim()
      ? filterClickUpTasks(taskResult.tasks, searchQuery)
      : taskResult.tasks

    const parents: ClickUpTask[] = []
    const subs = new Map<string, ClickUpTask[]>()

    for (const task of filtered) {
      if (task.parent) {
        const existing = subs.get(task.parent)
        if (existing) {
          existing.push(task)
        } else {
          subs.set(task.parent, [task])
        }
      } else {
        parents.push(task)
      }
    }

    return { parentTasks: parents, subtasksByParent: subs }
  }, [taskResult?.tasks, searchQuery])

  const totalVisible = parentTasks.length + Array.from(subtasksByParent.values()).reduce((sum, arr) => sum + arr.length, 0)

  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div className="border-b border-border">
      {/* Section header */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-accent transition-colors text-left"
      >
        <Chevron className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          My Tasks
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto flex-shrink-0" />
        )}
        {!isLoading && taskResult && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums ml-auto flex-shrink-0">
            {totalVisible}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pb-1">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">
                Loading your tasks...
              </span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center justify-center py-4 px-4 text-center">
              <AlertCircle className="h-4 w-4 text-destructive mb-1" />
              <span className="text-xs text-muted-foreground mb-2">
                {error.message || 'Failed to load tasks'}
              </span>
              <button
                onClick={() => refetch()}
                className="text-xs text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && totalVisible === 0 && (
            <div className="flex items-center justify-center py-4">
              <span className="text-xs text-muted-foreground">
                No tasks assigned to you
              </span>
            </div>
          )}

          {/* Task list */}
          {!isLoading && !error && totalVisible > 0 && (
            <div>
              {parentTasks.map((task, index) => (
                <div key={task.id}>
                  <ClickUpTaskItem
                    task={task}
                    index={index}
                    isSelected={false}
                    isCreating={creatingFromTaskId === task.id}
                    onMouseEnter={() => undefined}
                    onClick={bg => onSelectTask(task, bg)}
                    onInvestigate={bg => onInvestigateTask(task, bg)}
                    onPreview={() => onPreviewTask(task)}
                  />
                  {/* Subtasks under this parent */}
                  {subtasksByParent.get(task.id)?.map((subtask, subIndex) => (
                    <div
                      key={subtask.id}
                      className={cn(
                        'pl-6 border-l-2 border-muted ml-4'
                      )}
                    >
                      <ClickUpTaskItem
                        task={subtask}
                        index={parentTasks.length + subIndex}
                        isSelected={false}
                        isCreating={creatingFromTaskId === subtask.id}
                        onMouseEnter={() => undefined}
                        onClick={bg => onSelectTask(subtask, bg)}
                        onInvestigate={bg => onInvestigateTask(subtask, bg)}
                        onPreview={() => onPreviewTask(subtask)}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {/* Orphan subtasks */}
              {Array.from(subtasksByParent.entries())
                .filter(([parentId]) => !parentTasks.some(p => p.id === parentId))
                .flatMap(([, subs]) => subs)
                .map((subtask, index) => (
                  <ClickUpTaskItem
                    key={subtask.id}
                    task={subtask}
                    index={parentTasks.length + index}
                    isSelected={false}
                    isCreating={creatingFromTaskId === subtask.id}
                    onMouseEnter={() => undefined}
                    onClick={bg => onSelectTask(subtask, bg)}
                    onInvestigate={bg => onInvestigateTask(subtask, bg)}
                    onPreview={() => onPreviewTask(subtask)}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

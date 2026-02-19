import { Loader2, Eye, Wand2 } from 'lucide-react'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { isNewTask } from '@/services/clickup'
import type { ClickUpTask } from '@/types/clickup'

interface ClickUpTaskItemProps {
  task: ClickUpTask
  index: number
  isSelected: boolean
  isCreating: boolean
  onMouseEnter: () => void
  onClick: (background: boolean) => void
  onInvestigate: (background: boolean) => void
  onPreview: () => void
}

export function ClickUpTaskItem({
  task,
  index,
  isSelected,
  isCreating,
  onMouseEnter,
  onClick,
  onInvestigate,
  onPreview,
}: ClickUpTaskItemProps) {
  return (
    <div
      data-item-index={index}
      onMouseEnter={onMouseEnter}
      className={cn(
        'group w-full flex items-start gap-3 px-3 py-2.5 sm:py-2 text-left transition-colors',
        'hover:bg-accent',
        isSelected && 'bg-accent',
        isCreating && 'opacity-50'
      )}
    >
      {isCreating ? (
        <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-muted-foreground flex-shrink-0" />
      ) : (
        <span
          className="mt-1 h-3 w-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: task.status.color || '#94a3b8' }}
          title={task.status.status}
        />
      )}
      <button
        onClick={e => onClick(e.metaKey)}
        disabled={isCreating}
        className="flex-1 min-w-0 text-left focus:outline-none disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-2">
          {task.customId && (
            <span className="text-xs text-muted-foreground font-mono">
              {task.customId}
            </span>
          )}
          <span className="text-sm font-medium truncate">{task.name}</span>
          {isNewTask(task.dateCreated) && (
            <span className="shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 border border-green-500/20">
              New
            </span>
          )}
        </div>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={e => {
              e.stopPropagation()
              onPreview()
            }}
            className="shrink-0 p-1 rounded text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Preview task</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={e => {
              e.stopPropagation()
              onInvestigate(e.metaKey)
            }}
            disabled={isCreating}
            className="shrink-0 inline-flex items-center gap-0.5 rounded bg-black px-1 py-0.5 text-[10px] text-white transition-colors hover:bg-black/80 dark:bg-yellow-500/20 dark:text-yellow-400 dark:hover:bg-yellow-500/30 dark:hover:text-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Wand2 className="h-3 w-3" />
            <span>M</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Create worktree and investigate task</TooltipContent>
      </Tooltip>
    </div>
  )
}

import { cn } from '@/lib/utils'
import type { IssueSource } from '@/types/clickup'

interface IssueSourceSelectorProps {
  value: IssueSource
  onChange: (source: IssueSource) => void
}

export function IssueSourceSelector({
  value,
  onChange,
}: IssueSourceSelectorProps) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted/50 p-0.5">
      <button
        type="button"
        onClick={() => onChange('github')}
        className={cn(
          'px-2.5 py-1 text-xs font-medium rounded transition-colors',
          value === 'github'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        GitHub
      </button>
      <button
        type="button"
        onClick={() => onChange('clickup')}
        className={cn(
          'px-2.5 py-1 text-xs font-medium rounded transition-colors',
          value === 'clickup'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        ClickUp
      </button>
    </div>
  )
}

import { Loader2, MessageSquare, ExternalLink, AlertCircle } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Markdown } from '@/components/ui/markdown'
import { useClickUpTask } from '@/services/clickup'
import type { ClickUpTaskDetail, ClickUpComment } from '@/types/clickup'

interface ClickUpTaskPreviewProps {
  taskId: string
}

function formatDate(unixMs: string): string {
  const date = new Date(parseInt(unixMs, 10))
  if (isNaN(date.getTime())) return unixMs
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function CommentItem({ comment }: { comment: ClickUpComment }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
        <span className="text-sm font-medium">{comment.user.username}</span>
        <span className="text-xs text-muted-foreground">
          commented on {formatDate(comment.date)}
        </span>
      </div>
      <div className="px-4 py-3">
        {comment.commentText ? (
          <Markdown className="text-sm">{comment.commentText}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No comment text.
          </p>
        )}
      </div>
    </div>
  )
}

function TaskContent({ detail }: { detail: ClickUpTaskDetail }) {
  const description = detail.markdownDescription || detail.description

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 h-4 w-4 rounded-full flex-shrink-0"
          style={{ backgroundColor: detail.status.color || '#94a3b8' }}
          title={detail.status.status}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug">
            {detail.name}{' '}
            {detail.customId && (
              <span className="text-muted-foreground font-normal font-mono text-base">
                {detail.customId}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: `${detail.status.color}20`,
                color: detail.status.color,
              }}
            >
              {detail.status.status}
            </span>
            <span>created {formatDate(detail.dateCreated)}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
          <span className="text-sm font-medium">Description</span>
        </div>
        <div className="px-4 py-3">
          {description ? (
            <Markdown className="text-sm">{description}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No description provided.
            </p>
          )}
        </div>
      </div>

      {/* Comments */}
      {detail.comments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            <span>
              {detail.comments.length} comment
              {detail.comments.length !== 1 && 's'}
            </span>
          </div>
          {detail.comments.map((comment, i) => (
            <CommentItem key={i} comment={comment} />
          ))}
        </div>
      )}
    </>
  )
}

export function ClickUpTaskPreview({ taskId }: ClickUpTaskPreviewProps) {
  const { data: task, isLoading, error } = useClickUpTask(taskId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <p>Failed to load task details.</p>
        <p className="text-xs">{String(error)}</p>
      </div>
    )
  }

  if (!task) return null

  return <TaskContent detail={task} />
}

export function ClickUpTaskPreviewHeader({
  taskId,
  customId,
  url,
}: {
  taskId: string
  customId?: string | null
  url?: string
}) {
  const displayId = customId || taskId.slice(0, 8)
  return (
    <span className="text-lg flex items-center gap-2">
      Task {displayId}
      {url && (
        <button
          onClick={() => openUrl(url)}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="Open in ClickUp"
        >
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </span>
  )
}

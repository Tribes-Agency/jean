import { useMemo, useState, useCallback } from 'react'
import {
  CircleDot,
  GitPullRequest,
  GitMerge,
  GitBranch,
  Loader2,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  ArrowLeft,
  Wand2,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'
import { useGitHubIssue, useGitHubPR } from '@/services/github'
import { useClickUpTask } from '@/services/clickup'
import {
  ClickUpTaskPreview,
  ClickUpTaskPreviewHeader,
} from './ClickUpTaskPreview'
import type {
  GitHubIssueDetail,
  GitHubPullRequestDetail,
  GitHubComment,
  GitHubReview,
  GitHubLabel,
} from '@/types/github'
import type { ClickUpTask, ClickUpTaskDetail } from '@/types/clickup'

type IssuePreviewModalProps =
  | {
      open: boolean
      onOpenChange: (open: boolean) => void
      projectPath: string
      type: 'issue' | 'pr'
      number: number
    }
  | {
      open: boolean
      onOpenChange: (open: boolean) => void
      type: 'clickup-task'
      taskId: string
      onSelectTask?: (task: ClickUpTask, background?: boolean) => void
      onInvestigateTask?: (task: ClickUpTask, background?: boolean) => void
    }

function taskAsClickUpTask(detail: ClickUpTaskDetail): ClickUpTask {
  return {
    id: detail.id,
    customId: detail.customId,
    name: detail.name,
    status: detail.status,
    dateCreated: detail.dateCreated,
    url: detail.url,
    parent: null,
    assignees: [],
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Detail endpoints use serde rename_all = "camelCase", so created_at becomes createdAt at runtime
function getCreatedAt(obj: { created_at: string }): string {
  return (
    obj.created_at || (obj as unknown as { createdAt: string }).createdAt || ''
  )
}

function Labels({ labels }: { labels: GitHubLabel[] }) {
  if (labels.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map(label => (
        <span
          key={label.name}
          className="px-2 py-0.5 text-xs rounded-full font-medium"
          style={{
            backgroundColor: `#${label.color}20`,
            color: `#${label.color}`,
            border: `1px solid #${label.color}40`,
          }}
        >
          {label.name}
        </span>
      ))}
    </div>
  )
}

function CommentItem({ comment }: { comment: GitHubComment }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
        <span className="text-sm font-medium">{comment.author.login}</span>
        <span className="text-xs text-muted-foreground">
          commented on {formatDate(getCreatedAt(comment))}
        </span>
      </div>
      <div className="px-4 py-3">
        {comment.body ? (
          <Markdown className="text-sm">{comment.body}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description provided.
          </p>
        )}
      </div>
    </div>
  )
}

function ReviewItem({ review }: { review: GitHubReview }) {
  const defaultConfig = {
    icon: MessageSquare,
    color: 'text-muted-foreground',
    label: 'Reviewed',
  }
  const stateConfig: Record<
    string,
    { icon: typeof CheckCircle2; color: string; label: string }
  > = {
    APPROVED: {
      icon: CheckCircle2,
      color: 'text-green-500',
      label: 'Approved',
    },
    CHANGES_REQUESTED: {
      icon: XCircle,
      color: 'text-red-500',
      label: 'Changes requested',
    },
    COMMENTED: defaultConfig,
    DISMISSED: {
      icon: AlertCircle,
      color: 'text-yellow-500',
      label: 'Dismissed',
    },
    PENDING: { icon: Clock, color: 'text-yellow-500', label: 'Pending' },
  }

  const config = stateConfig[review.state] ?? defaultConfig
  const Icon = config.icon

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
        <Icon className={cn('h-4 w-4', config.color)} />
        <span className="text-sm font-medium">{review.author.login}</span>
        <span className={cn('text-xs font-medium', config.color)}>
          {config.label}
        </span>
        {review.submittedAt && (
          <span className="text-xs text-muted-foreground">
            on {formatDate(review.submittedAt)}
          </span>
        )}
      </div>
      {review.body && (
        <div className="px-4 py-3">
          <Markdown className="text-sm">{review.body}</Markdown>
        </div>
      )}
    </div>
  )
}

function IssueContent({ detail }: { detail: GitHubIssueDetail }) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <CircleDot
          className={cn(
            'h-5 w-5 mt-0.5 flex-shrink-0',
            detail.state === 'OPEN' ? 'text-green-500' : 'text-purple-500'
          )}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug">
            {detail.title}{' '}
            <span className="text-muted-foreground font-normal">
              #{detail.number}
            </span>
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{detail.author.login}</span>
            <span>opened on {formatDate(getCreatedAt(detail))}</span>
          </div>
        </div>
      </div>

      <Labels labels={detail.labels} />

      {/* Body */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
          <span className="text-sm font-medium">{detail.author.login}</span>
          <span className="text-xs text-muted-foreground">
            opened this issue on {formatDate(getCreatedAt(detail))}
          </span>
        </div>
        <div className="px-4 py-3">
          {detail.body ? (
            <Markdown className="text-sm">{detail.body}</Markdown>
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

function PRContent({ detail }: { detail: GitHubPullRequestDetail }) {
  const stateIcon = useMemo(() => {
    if (detail.state === 'MERGED')
      return (
        <GitMerge className="h-5 w-5 mt-0.5 flex-shrink-0 text-purple-500" />
      )
    if (detail.state === 'CLOSED')
      return (
        <GitPullRequest className="h-5 w-5 mt-0.5 flex-shrink-0 text-red-500" />
      )
    return (
      <GitPullRequest className="h-5 w-5 mt-0.5 flex-shrink-0 text-green-500" />
    )
  }, [detail.state])

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        {stateIcon}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug">
            {detail.title}{' '}
            <span className="text-muted-foreground font-normal">
              #{detail.number}
            </span>
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <span>{detail.author.login}</span>
            <span>opened on {formatDate(getCreatedAt(detail))}</span>
            {detail.isDraft && (
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs">
                Draft
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
              {detail.headRefName}
            </code>
            <span className="text-muted-foreground">→</span>
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
              {detail.baseRefName}
            </code>
          </div>
        </div>
      </div>

      <Labels labels={detail.labels} />

      {/* Body */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
          <span className="text-sm font-medium">{detail.author.login}</span>
          <span className="text-xs text-muted-foreground">
            opened this pull request on {formatDate(getCreatedAt(detail))}
          </span>
        </div>
        <div className="px-4 py-3">
          {detail.body ? (
            <Markdown className="text-sm">{detail.body}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No description provided.
            </p>
          )}
        </div>
      </div>

      {/* Reviews */}
      {detail.reviews.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {detail.reviews.length} review{detail.reviews.length !== 1 && 's'}
            </span>
          </div>
          {detail.reviews.map((review, i) => (
            <ReviewItem key={i} review={review} />
          ))}
        </div>
      )}

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

export function IssuePreviewModal(props: IssuePreviewModalProps) {
  const { open, onOpenChange, type } = props

  if (type === 'clickup-task') {
    return (
      <ClickUpPreviewModalContent
        open={open}
        onOpenChange={onOpenChange}
        taskId={props.taskId}
        onSelectTask={props.onSelectTask}
        onInvestigateTask={props.onInvestigateTask}
      />
    )
  }

  return (
    <GitHubPreviewModalContent
      open={open}
      onOpenChange={onOpenChange}
      projectPath={props.projectPath}
      type={type}
      number={props.number}
    />
  )
}

function ClickUpPreviewModalContent({
  open,
  onOpenChange,
  taskId: initialTaskId,
  onSelectTask,
  onInvestigateTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  onSelectTask?: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask?: (task: ClickUpTask, background?: boolean) => void
}) {
  const [taskStack, setTaskStack] = useState<string[]>([initialTaskId])
  const currentTaskId = taskStack[taskStack.length - 1] ?? initialTaskId
  const canGoBack = taskStack.length > 1

  const { data: task } = useClickUpTask(currentTaskId)

  const handleNavigateToTask = useCallback((id: string) => {
    setTaskStack(prev => [...prev, id])
  }, [])

  const handleGoBack = useCallback(() => {
    setTaskStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }, [])

  const handleSelect = useCallback(
    (t: ClickUpTask, background?: boolean) => {
      onOpenChange(false)
      onSelectTask?.(t, background)
    },
    [onOpenChange, onSelectTask]
  )

  const handleInvestigate = useCallback(
    (t: ClickUpTask, background?: boolean) => {
      onOpenChange(false)
      onInvestigateTask?.(t, background)
    },
    [onOpenChange, onInvestigateTask]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-screen !max-w-screen sm:!w-[90vw] sm:!max-w-4xl sm:!h-[85vh] sm:!max-h-[85vh] sm:!rounded-lg flex flex-col overflow-hidden z-[80] [&>[data-slot=dialog-close]]:top-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            <span className="flex items-center gap-2">
              {canGoBack && (
                <button
                  onClick={handleGoBack}
                  className="p-1 rounded hover:bg-accent transition-colors"
                  title="Back to parent task"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <ClickUpTaskPreviewHeader
                taskId={currentTaskId}
                customId={task?.customId}
                url={task?.url}
              />
            </span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="select-text space-y-4 pr-4 pb-4">
            <ClickUpTaskPreview
              taskId={currentTaskId}
              onNavigateToTask={handleNavigateToTask}
              onSelectTask={handleSelect}
              onInvestigateTask={handleInvestigate}
            />
          </div>
        </ScrollArea>

        {task && onSelectTask && (
          <div className="flex-shrink-0 border-t border-border px-4 py-3 flex items-center gap-2">
            <button
              onClick={e => handleSelect(taskAsClickUpTask(task), e.metaKey)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Create worktree
            </button>
            <button
              onClick={e =>
                handleInvestigate(taskAsClickUpTask(task), e.metaKey)
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black/80 dark:bg-yellow-500/20 dark:text-yellow-400 dark:hover:bg-yellow-500/30 dark:hover:text-yellow-300"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Investigate
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function GitHubPreviewModalContent({
  open,
  onOpenChange,
  projectPath,
  type,
  number,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPath: string
  type: 'issue' | 'pr'
  number: number
}) {
  const issueQuery = useGitHubIssue(
    projectPath,
    type === 'issue' ? number : null
  )
  const prQuery = useGitHubPR(projectPath, type === 'pr' ? number : null)

  const isLoading = type === 'issue' ? issueQuery.isLoading : prQuery.isLoading
  const error = type === 'issue' ? issueQuery.error : prQuery.error
  const githubUrl = type === 'issue' ? issueQuery.data?.url : prQuery.data?.url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-screen !max-w-screen sm:!w-[90vw] sm:!max-w-4xl sm:!h-[85vh] sm:!max-h-[85vh] sm:!rounded-lg flex flex-col overflow-hidden z-[80] [&>[data-slot=dialog-close]]:top-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg flex items-center gap-2">
            {type === 'issue' ? 'Issue' : 'Pull Request'} #{number}
            {githubUrl && (
              <button
                onClick={() => openUrl(githubUrl)}
                className="p-1 rounded hover:bg-accent transition-colors"
                title="Open on GitHub"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="select-text space-y-4 pr-4 pb-4">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                <AlertCircle className="h-6 w-6" />
                <p>
                  Failed to load {type === 'issue' ? 'issue' : 'pull request'}{' '}
                  details.
                </p>
                <p className="text-xs">{String(error)}</p>
              </div>
            )}

            {!isLoading && !error && type === 'issue' && issueQuery.data && (
              <IssueContent detail={issueQuery.data} />
            )}

            {!isLoading && !error && type === 'pr' && prQuery.data && (
              <PRContent detail={prQuery.data} />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

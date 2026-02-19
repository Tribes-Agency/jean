import { useState, useCallback, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Share2,
  Folder,
  List,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  useClickUpSharedHierarchy,
  useClickUpListTasks,
  filterClickUpTasks,
} from '@/services/clickup'
import type {
  ClickUpFolder,
  ClickUpList,
  ClickUpTask,
} from '@/types/clickup'
import { ClickUpTaskItem } from './ClickUpTaskItem'
import { cn } from '@/lib/utils'

interface SharedSectionProps {
  workspaceId: string
  includeClosed: boolean
  searchQuery?: string
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}

export function SharedSection({
  workspaceId,
  includeClosed,
  searchQuery,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: SharedSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const {
    data: shared,
    isLoading,
    error,
    refetch,
  } = useClickUpSharedHierarchy(workspaceId)

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  // Filter directly shared tasks
  const filteredTasks = useMemo(() => {
    if (!shared?.tasks) return []
    return searchQuery?.trim()
      ? filterClickUpTasks(shared.tasks, searchQuery)
      : shared.tasks
  }, [shared?.tasks, searchQuery])

  const hasContent =
    (shared?.tasks?.length ?? 0) > 0 ||
    (shared?.lists?.length ?? 0) > 0 ||
    (shared?.folders?.length ?? 0) > 0

  // Don't render the section until we know there's content
  // (avoids a flash of "Shared with me" header during loading when nothing is shared)
  if (!hasContent && !error) {
    return null
  }

  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div className="border-b border-border">
      {/* Section header */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-accent transition-colors text-left"
      >
        <Chevron className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <Share2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Shared with me
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="pb-1">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">
                Loading shared items...
              </span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center justify-center py-4 px-4 text-center">
              <AlertCircle className="h-4 w-4 text-destructive mb-1" />
              <span className="text-xs text-muted-foreground mb-2">
                {error.message || 'Failed to load shared items'}
              </span>
              <button
                onClick={() => refetch()}
                className="text-xs text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Shared folders */}
          {!isLoading &&
            !error &&
            shared?.folders
              .filter(f => !searchQuery?.trim() || f.lists.some(l => !l.archived))
              .map(folder => (
                <SharedFolderNode
                  key={folder.id}
                  folder={folder}
                  includeClosed={includeClosed}
                  searchQuery={searchQuery}
                  expanded={expandedNodes.has(`folder-${folder.id}`)}
                  onToggle={() => toggleNode(`folder-${folder.id}`)}
                  expandedNodes={expandedNodes}
                  onToggleNode={toggleNode}
                  onSelectTask={onSelectTask}
                  onInvestigateTask={onInvestigateTask}
                  onPreviewTask={onPreviewTask}
                  creatingFromTaskId={creatingFromTaskId}
                />
              ))}

          {/* Shared lists (not in folders) */}
          {!isLoading &&
            !error &&
            shared?.lists
              .filter(l => !l.archived)
              .map(list => (
                <SharedListNode
                  key={list.id}
                  list={list}
                  depth={1}
                  includeClosed={includeClosed}
                  searchQuery={searchQuery}
                  expanded={expandedNodes.has(`list-${list.id}`)}
                  onToggle={() => toggleNode(`list-${list.id}`)}
                  onSelectTask={onSelectTask}
                  onInvestigateTask={onInvestigateTask}
                  onPreviewTask={onPreviewTask}
                  creatingFromTaskId={creatingFromTaskId}
                />
              ))}

          {/* Directly shared tasks */}
          {!isLoading && !error && filteredTasks.length > 0 && (
            <div>
              {filteredTasks.map((task, index) => (
                <ClickUpTaskItem
                  key={task.id}
                  task={task}
                  index={index}
                  isSelected={false}
                  isCreating={creatingFromTaskId === task.id}
                  onMouseEnter={() => undefined}
                  onClick={bg => onSelectTask(task, bg)}
                  onInvestigate={bg => onInvestigateTask(task, bg)}
                  onPreview={() => onPreviewTask(task)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SharedFolderNode({
  folder,
  includeClosed,
  searchQuery,
  expanded,
  onToggle,
  expandedNodes,
  onToggleNode,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: {
  folder: ClickUpFolder
  includeClosed: boolean
  searchQuery?: string
  expanded: boolean
  onToggle: () => void
  expandedNodes: Set<string>
  onToggleNode: (nodeId: string) => void
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}) {
  const activeLists = folder.lists.filter(l => !l.archived)
  if (activeLists.length === 0) return null

  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 py-1 hover:bg-accent transition-colors text-left"
        style={{ paddingLeft: 20 }}
      >
        <Chevron className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
        <Folder className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground/80 truncate">
          {folder.name}
        </span>
        {folder.taskCount && (
          <span className="text-[10px] text-muted-foreground/40 tabular-nums ml-auto flex-shrink-0 pr-3">
            {folder.taskCount}
          </span>
        )}
      </button>

      {expanded &&
        activeLists.map(list => (
          <SharedListNode
            key={list.id}
            list={list}
            depth={2}
            includeClosed={includeClosed}
            searchQuery={searchQuery}
            expanded={expandedNodes.has(`list-${list.id}`)}
            onToggle={() => onToggleNode(`list-${list.id}`)}
            onSelectTask={onSelectTask}
            onInvestigateTask={onInvestigateTask}
            onPreviewTask={onPreviewTask}
            creatingFromTaskId={creatingFromTaskId}
          />
        ))}
    </div>
  )
}

function SharedListNode({
  list,
  depth,
  includeClosed,
  searchQuery,
  expanded,
  onToggle,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: {
  list: ClickUpList
  depth: number
  includeClosed: boolean
  searchQuery?: string
  expanded: boolean
  onToggle: () => void
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}) {
  const {
    data: taskResult,
    isLoading,
    error,
  } = useClickUpListTasks(list.id, includeClosed, { enabled: expanded })

  const Chevron = expanded ? ChevronDown : ChevronRight
  const indent = depth * 20

  const { parentTasks, subtasksByParent } = useMemo(() => {
    if (!taskResult?.tasks)
      return {
        parentTasks: [],
        subtasksByParent: new Map<string, ClickUpTask[]>(),
      }

    const parents: ClickUpTask[] = []
    const subs = new Map<string, ClickUpTask[]>()

    for (const task of taskResult.tasks) {
      if (searchQuery?.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesName = task.name.toLowerCase().includes(q)
        const matchesId = task.id.toLowerCase().includes(q)
        const matchesCustomId = task.customId?.toLowerCase().includes(q)
        if (!matchesName && !matchesId && !matchesCustomId) continue
      }

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

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 py-1 hover:bg-accent transition-colors text-left"
        style={{ paddingLeft: indent }}
      >
        <Chevron className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <List className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-[11px] text-muted-foreground/70 truncate">
          {list.name}
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40 flex-shrink-0 ml-auto" />
        )}
        {!isLoading && (
          <span className="text-[10px] text-muted-foreground/40 tabular-nums ml-auto flex-shrink-0 pr-3">
            {expanded && taskResult
              ? taskResult.tasks.length
              : list.taskCount ?? ''}
          </span>
        )}
      </button>

      {expanded && error && (
        <div
          className="flex items-center gap-1.5 py-1"
          style={{ paddingLeft: indent + 20 }}
        >
          <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground">
            {String(error.message || error)}
          </span>
        </div>
      )}

      {expanded && taskResult && (
        <div>
          {parentTasks.map((task, index) => (
            <div key={task.id}>
              <div style={{ paddingLeft: indent + 12 }}>
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
              </div>
              {subtasksByParent.get(task.id)?.map((subtask, subIndex) => (
                <div
                  key={subtask.id}
                  style={{ paddingLeft: indent + 32 }}
                  className={cn(
                    'border-l-2 border-muted ml-4',
                    'relative'
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
          {Array.from(subtasksByParent.entries())
            .filter(
              ([parentId]) => !parentTasks.some(p => p.id === parentId)
            )
            .flatMap(([, subs]) => subs)
            .map((subtask, index) => (
              <div
                key={subtask.id}
                style={{ paddingLeft: indent + 12 }}
              >
                <ClickUpTaskItem
                  task={subtask}
                  index={parentTasks.length + index}
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
      )}
    </div>
  )
}

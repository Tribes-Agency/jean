import { useState, useCallback, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  List,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  useClickUpSpaces,
  useClickUpSpaceHierarchy,
  useClickUpListTasks,
} from '@/services/clickup'
import type {
  ClickUpSpace,
  ClickUpFolder,
  ClickUpList,
  ClickUpTask,
} from '@/types/clickup'
import { ClickUpTaskItem } from './ClickUpTaskItem'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface CollapsibleTreeViewProps {
  workspaceId: string
  includeClosed: boolean
  searchQuery?: string
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}

export function CollapsibleTreeView({
  workspaceId,
  includeClosed,
  searchQuery,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: CollapsibleTreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const { data: spaces, isLoading, error } = useClickUpSpaces(workspaceId)

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading spaces...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <AlertCircle className="h-5 w-5 text-destructive mb-2" />
        <span className="text-sm text-muted-foreground">
          {error.message || 'Failed to load spaces'}
        </span>
      </div>
    )
  }

  if (!spaces || spaces.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-sm text-muted-foreground">No spaces found</span>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="py-1">
        {spaces.map(space => (
          <SpaceNode
            key={space.id}
            space={space}
            includeClosed={includeClosed}
            searchQuery={searchQuery}
            expanded={expandedNodes.has(`space-${space.id}`)}
            onToggle={() => toggleNode(`space-${space.id}`)}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            onSelectTask={onSelectTask}
            onInvestigateTask={onInvestigateTask}
            onPreviewTask={onPreviewTask}
            creatingFromTaskId={creatingFromTaskId}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

function SpaceNode({
  space,
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
  space: ClickUpSpace
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
  // Only fetch hierarchy when expanded
  const {
    data: hierarchy,
    isLoading,
    error,
  } = useClickUpSpaceHierarchy(space.id, { enabled: expanded })

  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-accent transition-colors text-left"
      >
        <Chevron className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {space.name}
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto flex-shrink-0" />
        )}
      </button>

      {expanded && error && (
        <div className="flex items-center gap-2 px-3 py-2 pl-8">
          <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
          <span className="text-xs text-muted-foreground">
            {String(error.message || error)}
          </span>
        </div>
      )}

      {expanded && hierarchy && (
        <>
          {hierarchy.folders.map(folder => (
            <FolderNode
              key={folder.id}
              folder={folder}
              includeClosed={includeClosed}
              searchQuery={searchQuery}
              expanded={expandedNodes.has(`folder-${folder.id}`)}
              onToggle={() => onToggleNode(`folder-${folder.id}`)}
              expandedNodes={expandedNodes}
              onToggleNode={onToggleNode}
              onSelectTask={onSelectTask}
              onInvestigateTask={onInvestigateTask}
              onPreviewTask={onPreviewTask}
              creatingFromTaskId={creatingFromTaskId}
            />
          ))}
          {hierarchy.folderlessLists
            .filter(l => !l.archived)
            .map(list => (
              <ListNode
                key={list.id}
                list={list}
                depth={1}
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
        </>
      )}
    </div>
  )
}

function FolderNode({
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
          <ListNode
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

function ListNode({
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
  // Only fetch tasks when expanded
  const {
    data: taskResult,
    isLoading,
    error,
  } = useClickUpListTasks(list.id, includeClosed, { enabled: expanded })

  const Chevron = expanded ? ChevronDown : ChevronRight
  const indent = depth * 20

  // Group tasks: parents first, subtasks under their parent
  const { parentTasks, subtasksByParent } = useMemo(() => {
    if (!taskResult?.tasks) return { parentTasks: [], subtasksByParent: new Map<string, ClickUpTask[]>() }

    const parents: ClickUpTask[] = []
    const subs = new Map<string, ClickUpTask[]>()

    for (const task of taskResult.tasks) {
      // Apply search filter if present
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
              {/* Subtasks under this parent */}
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
          {/* Orphan subtasks (parent not in this list) */}
          {Array.from(subtasksByParent.entries())
            .filter(([parentId]) => !parentTasks.some(p => p.id === parentId))
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

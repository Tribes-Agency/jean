import { Folder, List, Loader2, AlertCircle } from 'lucide-react'
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

interface ClickUpTreeViewProps {
  workspaceId: string
  includeClosed: boolean
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}

export function ClickUpTreeView({
  workspaceId,
  includeClosed,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: ClickUpTreeViewProps) {
  const { data: spaces, isLoading, error } = useClickUpSpaces(workspaceId)

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
          <SpaceSection
            key={space.id}
            space={space}
            includeClosed={includeClosed}
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

/** Always-expanded space section that auto-loads its hierarchy */
function SpaceSection({
  space,
  includeClosed,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: {
  space: ClickUpSpace
  includeClosed: boolean
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}) {
  const {
    data: hierarchy,
    isLoading,
    error,
  } = useClickUpSpaceHierarchy(space.id)

  const hasContent =
    hierarchy &&
    (hierarchy.folders.length > 0 ||
      hierarchy.folderlessLists.filter(l => !l.archived).length > 0)

  return (
    <div>
      {/* Space header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {space.name}
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
          <span className="text-xs text-muted-foreground">
            {String(error.message || error)}
          </span>
        </div>
      )}

      {hierarchy && !hasContent && (
        <div className="px-3 py-2">
          <span className="text-xs text-muted-foreground">
            No lists in this space
          </span>
        </div>
      )}

      {hierarchy && hasContent && (
        <>
          {hierarchy.folders.map(folder => (
            <FolderSection
              key={folder.id}
              folder={folder}
              includeClosed={includeClosed}
              onSelectTask={onSelectTask}
              onInvestigateTask={onInvestigateTask}
              onPreviewTask={onPreviewTask}
              creatingFromTaskId={creatingFromTaskId}
            />
          ))}
          {hierarchy.folderlessLists
            .filter(l => !l.archived)
            .map(list => (
              <ListSection
                key={list.id}
                list={list}
                depth={0}
                includeClosed={includeClosed}
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

/** Always-expanded folder grouping */
function FolderSection({
  folder,
  includeClosed,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: {
  folder: ClickUpFolder
  includeClosed: boolean
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}) {
  const activeLists = folder.lists.filter(l => !l.archived)
  if (activeLists.length === 0) return null

  return (
    <div>
      {/* Folder header */}
      <div className="flex items-center gap-1.5 px-3 py-1 mt-1">
        <Folder className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground/60 truncate">
          {folder.name}
        </span>
      </div>

      {activeLists.map(list => (
        <ListSection
          key={list.id}
          list={list}
          depth={1}
          includeClosed={includeClosed}
          onSelectTask={onSelectTask}
          onInvestigateTask={onInvestigateTask}
          onPreviewTask={onPreviewTask}
          creatingFromTaskId={creatingFromTaskId}
        />
      ))}
    </div>
  )
}

/** Always-expanded list section that auto-loads its tasks */
function ListSection({
  list,
  depth,
  includeClosed,
  onSelectTask,
  onInvestigateTask,
  onPreviewTask,
  creatingFromTaskId,
}: {
  list: ClickUpList
  depth: number
  includeClosed: boolean
  onSelectTask: (task: ClickUpTask, background?: boolean) => void
  onInvestigateTask: (task: ClickUpTask, background?: boolean) => void
  onPreviewTask: (task: ClickUpTask) => void
  creatingFromTaskId: string | null
}) {
  const {
    data: taskResult,
    isLoading,
    error,
  } = useClickUpListTasks(list.id, includeClosed)

  return (
    <div>
      {/* List header */}
      <div
        className="flex items-center gap-1.5 py-1"
        style={{ paddingLeft: depth === 1 ? 24 : 12 }}
      >
        <List className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-[11px] text-muted-foreground/50 truncate">
          {list.name}
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40 flex-shrink-0" />
        )}
        {taskResult && (
          <span className="text-[10px] text-muted-foreground/40 tabular-nums flex-shrink-0">
            {taskResult.tasks.length}
          </span>
        )}
      </div>

      {error && (
        <div
          className="flex items-center gap-1.5 py-1"
          style={{ paddingLeft: depth === 1 ? 24 : 12 }}
        >
          <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground">
            {String(error.message || error)}
          </span>
        </div>
      )}

      {/* Tasks */}
      {taskResult &&
        taskResult.tasks.map((task, index) => (
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
  )
}

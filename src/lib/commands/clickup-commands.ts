import { CheckSquare } from 'lucide-react'
import type { AppCommand } from './types'
import { useUIStore } from '@/store/ui-store'

export const clickupCommands: AppCommand[] = [
  {
    id: 'open-clickup-tasks',
    label: 'Open ClickUp Tasks',
    description: 'View ClickUp tasks for current project',
    icon: CheckSquare,
    group: 'clickup',
    keywords: ['clickup', 'tasks', 'issues', 'tickets', 'workspace'],

    execute: () => {
      const {
        setIssueSource,
        setNewWorktreeModalDefaultTab,
        setNewWorktreeModalOpen,
      } = useUIStore.getState()
      setIssueSource('clickup')
      setNewWorktreeModalDefaultTab('issues')
      setNewWorktreeModalOpen(true)
    },
    isAvailable: context => context.hasSelectedProject(),
  },
]

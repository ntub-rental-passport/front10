import type { OverviewTask } from '@/src/services/landlordWorkspaceApi'

export type BellTab = 'inbox' | 'tasks'
export type DueFilter = 'all' | 'overdue' | 'today'

export function urgentTaskCount(tasks: readonly OverviewTask[]): number {
  return tasks.filter((task) => task.bucket === 'overdue' || task.bucket === 'today').length
}

export function bellBadgeCount(unreadCount: number, tasks: readonly OverviewTask[]): number {
  return unreadCount + urgentTaskCount(tasks)
}

export function defaultBellTab(unreadCount: number, tasks: readonly OverviewTask[]): BellTab {
  return unreadCount === 0 && urgentTaskCount(tasks) > 0 ? 'tasks' : 'inbox'
}

export function filterOverviewTasks(
  tasks: readonly OverviewTask[],
  dueFilter: DueFilter,
): OverviewTask[] {
  return tasks.filter((task) => dueFilter === 'all' || task.bucket === dueFilter)
}

export function groupOverviewTasks(tasks: readonly OverviewTask[], dueFilter: DueFilter = 'all') {
  const visibleTasks = filterOverviewTasks(tasks, dueFilter)
  return (['overdue', 'today', 'upcoming'] as OverviewTask['bucket'][])
    .map((bucket) => ({
      bucket,
      tasks: visibleTasks.filter((task) => task.bucket === bucket),
    }))
    .filter((group) => group.tasks.length)
}

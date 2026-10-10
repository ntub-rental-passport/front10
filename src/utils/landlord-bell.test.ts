import { describe, expect, it } from 'vitest'
import type { OverviewTask } from '@/src/services/landlordWorkspaceApi'
import {
  bellBadgeCount,
  defaultBellTab,
  filterOverviewTasks,
  groupOverviewTasks,
  urgentTaskCount,
} from './landlord-bell'

function task(id: string, bucket: OverviewTask['bucket']): OverviewTask {
  return {
    id,
    kind: 'rent',
    bucket,
    date: '2026-10-10',
    title: '待收租金',
    meta: '幸福公寓 101',
    timing: '今天到期',
    route: '/landlord/finance',
  }
}

const overdue = task('overdue', 'overdue')
const today = task('today', 'today')
const upcoming = task('upcoming', 'upcoming')

const cases = [
  { label: '只有未讀', unread: 3, tasks: [], urgent: 0, badge: 3, tab: 'inbox' },
  { label: '只有急件', unread: 0, tasks: [overdue, today], urgent: 2, badge: 2, tab: 'tasks' },
  { label: '只有 upcoming 待辦', unread: 0, tasks: [upcoming], urgent: 0, badge: 0, tab: 'inbox' },
  {
    label: '未讀與急件都有',
    unread: 3,
    tasks: [overdue, today, upcoming],
    urgent: 2,
    badge: 5,
    tab: 'inbox',
  },
  { label: '都沒有', unread: 0, tasks: [], urgent: 0, badge: 0, tab: 'inbox' },
  {
    label: '未讀與 upcoming 待辦',
    unread: 3,
    tasks: [upcoming],
    urgent: 0,
    badge: 3,
    tab: 'inbox',
  },
  { label: '只有逾期', unread: 0, tasks: [overdue], urgent: 1, badge: 1, tab: 'tasks' },
  { label: '只有今天', unread: 0, tasks: [today], urgent: 1, badge: 1, tab: 'tasks' },
]

describe('房東鈴鐺數量與預設分頁', () => {
  it.each(cases)('$label：急件只包含逾期與今天', ({ tasks, urgent }) => {
    expect(urgentTaskCount(tasks)).toBe(urgent)
  })

  it.each(cases)('$label：徽章加總未讀與急件', ({ unread, tasks, badge }) => {
    expect(bellBadgeCount(unread, tasks)).toBe(badge)
  })

  it.each(cases)('$label：依未讀與急件決定預設分頁', ({ unread, tasks, tab }) => {
    expect(defaultBellTab(unread, tasks)).toBe(tab)
  })
})

describe('房東待辦到期篩選與分組', () => {
  const secondOverdue = { ...task('second-overdue', 'overdue'), kind: 'maintenance' as const }
  const tasks = [upcoming, overdue, today, secondOverdue]

  it('全部保留原始順序與所有業務類型', () => {
    expect(filterOverviewTasks(tasks, 'all')).toEqual(tasks)
  })

  it('逾期與今天只保留對應到期類別', () => {
    expect(filterOverviewTasks(tasks, 'overdue')).toEqual([overdue, secondOverdue])
    expect(filterOverviewTasks(tasks, 'today')).toEqual([today])
  })

  it('依逾期、今天、接下來 7 天分組，同組維持原始順序', () => {
    expect(groupOverviewTasks(tasks)).toEqual([
      { bucket: 'overdue', tasks: [overdue, secondOverdue] },
      { bucket: 'today', tasks: [today] },
      { bucket: 'upcoming', tasks: [upcoming] },
    ])
    expect(tasks).toEqual([upcoming, overdue, today, secondOverdue])
  })

  it('先依到期篩選再分組，不回傳空群組', () => {
    expect(groupOverviewTasks(tasks, 'overdue')).toEqual([
      { bucket: 'overdue', tasks: [overdue, secondOverdue] },
    ])
    expect(groupOverviewTasks(tasks, 'today')).toEqual([{ bucket: 'today', tasks: [today] }])
    expect(groupOverviewTasks([upcoming], 'overdue')).toEqual([])
    expect(groupOverviewTasks([upcoming])).toEqual([{ bucket: 'upcoming', tasks: [upcoming] }])
  })

  it('空待辦在所有到期篩選下都沒有群組', () => {
    for (const filter of ['all', 'overdue', 'today'] as const) {
      expect(filterOverviewTasks([], filter)).toEqual([])
      expect(groupOverviewTasks([], filter)).toEqual([])
    }
  })
})

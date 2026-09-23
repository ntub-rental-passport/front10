import { describe, expect, it } from 'vitest'

import type { AdminNotification } from '@/src/mocks/admin/admin-notifications'
import {
  groupNotificationsByDay,
  matchesNotifFilter,
  NOTIF_SOURCE_ACCENT_CLASS,
  NOTIF_SOURCE_BADGE_CLASS,
} from './admin-notification-center'

const NOW = new Date(2026, 8, 23, 14, 0)

function item(over: Partial<AdminNotification> = {}): AdminNotification {
  return {
    id: 'an-x',
    source: 'alert',
    title: 't',
    body: 'b',
    createdAt: NOW.toISOString(),
    read: false,
    ...over,
  }
}

describe('NOTIF_SOURCE_BADGE_CLASS', () => {
  it('三種來源都有樣式', () => {
    expect(Object.keys(NOTIF_SOURCE_BADGE_CLASS).sort()).toEqual([
      'admin-note',
      'alert',
      'user-message',
    ])
  })

  it('不使用色票外的寫死顏色', () => {
    // 原本是 red-50 / blue-50 / violet-50 —— 藍與紫羅蘭不在這個專案的色票裡，
    // 而且沒有 dark: 變體，深色模式下是三塊發亮的近白方塊。
    const all = Object.values(NOTIF_SOURCE_BADGE_CLASS).join(' ')
    expect(all).not.toMatch(/\b(red|blue|violet|green|amber|slate|gray)-\d{2,3}\b/)
  })

  it('內部備註不用 muted 配 muted', () => {
    // text-muted-foreground 踩在 bg-muted 上實測只有 4.21 —— 兩個 muted
    // 本來就沒有足夠的明度差（導覽膠囊也踩過同一個坑）
    const cls = NOTIF_SOURCE_BADGE_CLASS['admin-note']
    expect(cls).toContain('bg-muted')
    expect(cls).not.toContain('text-muted-foreground')
  })

  it('accent 與 destructive 都不拿來當文字色', () => {
    // 它們太亮，當文字在淺色底上分別只有 1.90 與 2.86（見 status-dot.ts）。
    // 告警第一版用紅底＋紅字，實測 4.34 —— 紅底把紅字又壓低一截。
    const all = Object.values(NOTIF_SOURCE_BADGE_CLASS).join(' ')
    expect(all).not.toContain('text-accent')
    expect(all).not.toContain('text-destructive')
  })

  it('三個徽章都用同一種處理：底色帶語意、文字保持可讀', () => {
    // 容器帶語意、文字可讀 —— 與錯誤訊息方框同一條原則
    for (const cls of Object.values(NOTIF_SOURCE_BADGE_CLASS)) {
      expect(cls).toMatch(/\bbg-/)
      expect(cls).toMatch(/\btext-foreground/)
    }
  })

  it('左側色條與徽章涵蓋同樣三種來源', () => {
    expect(Object.keys(NOTIF_SOURCE_ACCENT_CLASS).sort()).toEqual(
      Object.keys(NOTIF_SOURCE_BADGE_CLASS).sort(),
    )
  })

  it('色條用 destructive-surface 當填色，不是把 destructive 當填色', () => {
    expect(NOTIF_SOURCE_ACCENT_CLASS.alert).toContain('destructive-surface')
  })
})

describe('matchesNotifFilter', () => {
  it('全部一律通過', () => {
    expect(matchesNotifFilter(item({ read: true }), 'all')).toBe(true)
  })

  it('未讀只留沒讀過的', () => {
    expect(matchesNotifFilter(item({ read: false }), 'unread')).toBe(true)
    expect(matchesNotifFilter(item({ read: true }), 'unread')).toBe(false)
  })

  it('來源篩選只留該來源', () => {
    expect(matchesNotifFilter(item({ source: 'alert' }), 'alert')).toBe(true)
    expect(matchesNotifFilter(item({ source: 'admin-note' }), 'alert')).toBe(false)
  })

  it('來源篩選不管讀過沒有', () => {
    expect(matchesNotifFilter(item({ source: 'alert', read: true }), 'alert')).toBe(true)
  })
})

describe('groupNotificationsByDay', () => {
  const at = (d: number, h = 10) => new Date(2026, 8, d, h).toISOString()

  it('分成今天／昨天／更早', () => {
    const groups = groupNotificationsByDay(
      [
        item({ id: 'a', createdAt: at(23) }),
        item({ id: 'b', createdAt: at(22) }),
        item({ id: 'c', createdAt: at(10) }),
      ],
      NOW,
    )
    expect(groups.map((g) => g.label)).toEqual(['今天', '昨天', '更早'])
  })

  it('凌晨一點算今天，不是昨天', () => {
    // 用日界線比較而不是「距今 24 小時」：使用者對日期的直覺是看日曆
    const groups = groupNotificationsByDay([item({ createdAt: at(23, 1) })], NOW)
    expect(groups[0]!.label).toBe('今天')
  })

  it('空的分組不出現', () => {
    const groups = groupNotificationsByDay([item({ createdAt: at(23) })], NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.label).toBe('今天')
  })

  it('沒有資料時回空陣列', () => {
    expect(groupNotificationsByDay([], NOW)).toEqual([])
  })

  it('時間解析不了的放進更早，不要讓 NaN 決定它落在哪', () => {
    const groups = groupNotificationsByDay([item({ createdAt: '不是日期' })], NOW)
    expect(groups.map((g) => g.label)).toEqual(['更早'])
  })

  it('每一筆都會被分到某一組，不會憑空消失', () => {
    const input = [at(23), at(22), at(1), '壞掉'].map((d, i) => item({ id: String(i), createdAt: d }))
    const total = groupNotificationsByDay(input, NOW).reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(input.length)
  })
})

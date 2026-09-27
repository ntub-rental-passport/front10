import { describe, expect, it } from 'vitest'

import type { Subscription } from '@/src/mocks/admin/subscription'
import {
  expiringPreview,
  overduePreview,
  quotaPreview,
  responsePreview,
  retentionPreview,
} from './settings-impact'

const NOW = new Date(2026, 8, 27, 12, 0)
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
const daysLater = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

describe('retentionPreview', () => {
  it('用日期講：稽核頁會顯示哪天之後的紀錄', () => {
    expect(retentionPreview(90, NOW)).toBe('照這個值：稽核頁會顯示 2026/6/29 之後的紀錄')
  })

  it('0 或負數代表不限制', () => {
    expect(retentionPreview(0, NOW)).toBe('照這個值：不限制，所有紀錄都會顯示')
  })
})

describe('overduePreview', () => {
  const tickets = [
    { status: 'notified' as const, notifiedAt: daysAgo(10) },
    { status: 'notified' as const, notifiedAt: daysAgo(3) },
    { status: 'overdue' as const, notifiedAt: daysAgo(20) },
    { status: 'completed' as const, notifiedAt: daysAgo(30) },
  ]

  it('算出會被標成逾期的張數，並附上目前已經逾期的', () => {
    expect(overduePreview(tickets, 7, NOW)).toEqual({
      count: 1,
      text: '照這個值：1 張已通報房東的工單會被標成「逾期未回應」（目前已有 1 張逾期）',
    })
    expect(overduePreview(tickets, 2, NOW).count).toBe(2)
  })

  it('調大門檻不會讓已經逾期的變回去，所以只說「不會再有」', () => {
    expect(overduePreview(tickets, 30, NOW).text).toBe('照這個值：不會再有工單被標成逾期（目前已有 1 張逾期）')
  })
})

describe('expiringPreview', () => {
  const subscription = (expiresAt: string, active = true) => ({ active, expiresAt }) as Subscription

  it('只數還在期限內、而且沒停用的', () => {
    const subscriptions = [
      subscription(daysLater(3)),
      subscription(daysLater(20)),
      subscription(daysLater(3), false),
      subscription(daysAgo(1)),
    ]
    expect(expiringPreview(subscriptions, 14, NOW)).toEqual({ count: 1, text: '照這個值：1 人會被標示「訂閱即將到期」' })
    expect(expiringPreview(subscriptions, 30, NOW).count).toBe(2)
  })
})

describe('responsePreview', () => {
  it('用草稿的門檻判定目前的回應時間', () => {
    expect(responsePreview(44.4, 300, 1000)).toBe('目前後端回應 44 ms，照這個值判定為「正常」')
    expect(responsePreview(44.4, 30, 1000)).toBe('目前後端回應 44 ms，照這個值判定為「緩慢」')
    expect(responsePreview(null, 300, 1000)).toBe('目前量不到後端的回應時間')
  })
})

describe('quotaPreview', () => {
  it('每個供應商一段；沒設額度就直說', () => {
    expect(
      quotaPreview([
        { label: 'Gemini API', percent: 40, levelLabel: '正常', unset: false },
        { label: 'Google Cloud Vision', percent: 0, levelLabel: '正常', unset: true },
      ]),
    ).toBe('照這個值：Gemini API 40%（正常）、Google Cloud Vision 未設定額度')
  })
})

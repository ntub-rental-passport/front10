import { describe, expect, it } from 'vitest'

import {
  buildQueue,
  depositMatchDistribution,
  monthlyUserGrowth,
  queueTotal,
  weeklyTicketTrend,
} from './admin-overview'
import type { AdminUser } from '@/src/mocks/admin/users'
import type { MaintenanceTicket } from '@/src/mocks/admin/maintenance'
import type { DepositRecord } from '@/src/mocks/admin/deposit'
import { joinUserDirectory, type UserDirectorySources } from './admin-user-directory'
import type { Subscription, SubscriptionPlan } from '@/src/mocks/admin/subscription'

const NOW = new Date('2026-08-14T12:00:00.000Z')

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 86400000).toISOString()
}

function ticket(id: string, createdAt: string): MaintenanceTicket {
  return {
    id,
    address: '測試路 1 號',
    tenantUserId: 'u-tenant',
    landlordUserId: 'u-landlord',
    category: 'leak',
    description: '測試',
    status: 'submitted',
    createdAt,
    notifiedAt: null,
    firstResponseAt: null,
    completedAt: null,
    timeline: [],
    adminNote: '',
  }
}

function user(id: string, registeredAt: string, over: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    email: `${id}@example.com`,
    nickname: null,
    role: 'user',
    adminRole: null,
    status: 'active',
    emailVerified: true,
    registeredAt,
    ...over,
  }
}

function deposit(id: string, landlordDeclared: number, tenantDeclared: number | null): DepositRecord {
  return {
    id,
    address: '測試路 1 號',
    landlordUserId: 'u-landlord',
    tenantUserId: 'u-tenant',
    monthlyRent: 10000,
    landlordDeclared,
    tenantDeclared,
  }
}

describe('weeklyTicketTrend', () => {
  it('回傳指定週數的格子，由舊到新', () => {
    const points = weeklyTicketTrend([], 12, NOW)
    expect(points).toHaveLength(12)
    expect(points.every((point) => point.value === 0)).toBe(true)
  })

  it('把工單放進正確的週', () => {
    const tickets = [
      ticket('a', daysBefore(0)), // 本週
      ticket('b', daysBefore(3)), // 本週
      ticket('c', daysBefore(8)), // 上週
    ]
    const points = weeklyTicketTrend(tickets, 3, NOW)
    expect(points.at(-1)?.value).toBe(2)
    expect(points.at(-2)?.value).toBe(1)
    expect(points.at(-3)?.value).toBe(0)
  })

  it('超出範圍的舊工單不計入', () => {
    const points = weeklyTicketTrend([ticket('old', daysBefore(200))], 4, NOW)
    expect(points.reduce((sum, point) => sum + point.value, 0)).toBe(0)
  })

  it('今天建立的工單算在最後一格，不會被漏掉', () => {
    const points = weeklyTicketTrend([ticket('today', NOW.toISOString())], 2, NOW)
    expect(points.at(-1)?.value).toBe(1)
  })
})

describe('monthlyUserGrowth', () => {
  it('回傳累計數且單調不遞減', () => {
    const users = [
      user('a', '2026-01-05T00:00:00.000Z'),
      user('b', '2026-03-05T00:00:00.000Z'),
      user('c', '2026-07-05T00:00:00.000Z'),
    ]
    const points = monthlyUserGrowth(users, 12, NOW)
    expect(points).toHaveLength(12)
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].value).toBeGreaterThanOrEqual(points[i - 1].value)
    }
  })

  it('最後一格是目前的總人數', () => {
    const users = [user('a', '2026-01-05T00:00:00.000Z'), user('b', '2026-08-01T00:00:00.000Z')]
    expect(monthlyUserGrowth(users, 12, NOW).at(-1)?.value).toBe(2)
  })

  it('比區間更早註冊的人也算進累計，不會憑空消失', () => {
    const users = [user('old', '2020-01-01T00:00:00.000Z')]
    const points = monthlyUserGrowth(users, 6, NOW)
    expect(points[0].value).toBe(1)
  })
})

describe('depositMatchDistribution', () => {
  it('三種結果都回傳且順序固定', () => {
    const result = depositMatchDistribution([
      deposit('a', 20000, 20000),
      deposit('b', 20000, 10000),
      deposit('c', 20000, null),
      deposit('d', 30000, 30000),
    ])
    expect(result).toEqual([
      { match: 'matched', value: 2 },
      { match: 'mismatched', value: 1 },
      { match: 'pending', value: 1 },
    ])
  })

  it('沒有資料時仍回傳三段，值為 0', () => {
    expect(depositMatchDistribution([])).toEqual([
      { match: 'matched', value: 0 },
      { match: 'mismatched', value: 0 },
      { match: 'pending', value: 0 },
    ])
  })
})

describe('buildQueue', () => {
  const plans: SubscriptionPlan[] = [
    { id: 'free', name: '免費方案', priceLabel: 'NT$0', aiQuota: 3, storageMb: 200 },
  ]

  function subscription(over: Partial<Subscription> = {}): Subscription {
    return {
      id: 'sub-1',
      userId: 'u-1',
      planId: 'free',
      expiresAt: '2026-12-31T00:00:00.000Z',
      aiUsed: 0,
      storageUsedMb: 0,
      active: true,
      ...over,
    }
  }

  function rowsFrom(over: Partial<UserDirectorySources>) {
    return joinUserDirectory(
      {
        users: [user('u-1', '2026-01-01T00:00:00.000Z', { nickname: '小艾' })],
        tickets: [],
        deposits: [],
        subscriptions: [],
        plans,
        ...over,
      },
      NOW,
    )
  }

  it('沒有警示時是空佇列', () => {
    expect(buildQueue(rowsFrom({}))).toEqual([])
  })

  it('逾期工單產生一筆，連結帶到工單頁並預選該使用者', () => {
    const rows = rowsFrom({
      tickets: [{ ...ticket('t1', daysBefore(20)), tenantUserId: 'u-1', status: 'overdue' }],
    })
    const queue = buildQueue(rows)
    expect(queue).toHaveLength(1)
    expect(queue[0].kind).toBe('ticket-overdue')
    expect(queue[0].label).toContain('小艾')
    expect(queue[0].to).toBe('/admin/maintenance-tickets?user=u-1')
  })

  it('押金不符連到該使用者的詳情頁', () => {
    const rows = rowsFrom({
      deposits: [{ ...deposit('d1', 20000, 10000), tenantUserId: 'u-1' }],
    })
    expect(buildQueue(rows)[0].to).toBe('/admin/users/u-1')
  })

  it('逾期排在其他警示之前', () => {
    const rows = rowsFrom({
      tickets: [{ ...ticket('t1', daysBefore(20)), tenantUserId: 'u-1', status: 'overdue' }],
      deposits: [{ ...deposit('d1', 20000, 10000), tenantUserId: 'u-1' }],
      subscriptions: [subscription({ expiresAt: '2026-08-20T00:00:00.000Z' })],
    })
    expect(buildQueue(rows).map((item) => item.kind)).toEqual([
      'ticket-overdue',
      'deposit-mismatch',
      'subscription-expiring',
    ])
  })

  it('同一類很多筆時輪替，不會把整張卡塞滿同一種', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      user(`t-${i}`, '2026-01-01T00:00:00.000Z'),
    )
    const rows = joinUserDirectory(
      {
        users: [...many, user('d-1', '2026-01-01T00:00:00.000Z')],
        tickets: many.map((u, i) => ({
          ...ticket(`t${i}`, daysBefore(20)),
          tenantUserId: u.id,
          status: 'overdue' as const,
        })),
        deposits: [{ ...deposit('d1', 20000, 10000), tenantUserId: 'd-1' }],
        subscriptions: [],
        plans,
      },
      NOW,
    )

    const kinds = buildQueue(rows, 4).map((item) => item.kind)
    expect(kinds[0]).toBe('ticket-overdue')
    // 押金只有一筆，但必須在前幾筆就出現，不能被 5 筆逾期擠掉
    expect(kinds).toContain('deposit-mismatch')
  })

  it('超過上限時截斷', () => {
    const rows = rowsFrom({
      tickets: [{ ...ticket('t1', daysBefore(20)), tenantUserId: 'u-1', status: 'overdue' }],
      deposits: [{ ...deposit('d1', 20000, 10000), tenantUserId: 'u-1' }],
    })
    expect(buildQueue(rows, 1)).toHaveLength(1)
  })

  it('queueTotal 不受顯示上限影響', () => {
    const rows = rowsFrom({
      tickets: [{ ...ticket('t1', daysBefore(20)), tenantUserId: 'u-1', status: 'overdue' }],
      deposits: [{ ...deposit('d1', 20000, 10000), tenantUserId: 'u-1' }],
    })
    expect(buildQueue(rows, 1)).toHaveLength(1)
    expect(queueTotal(rows)).toBe(2)
  })
})

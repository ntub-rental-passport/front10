import { describe, expect, it } from 'vitest'

import {
  buildQueueGroups,
  depositMatchDistribution,
  monthlyUserGrowth,
  queueTotal,
  weeklyTicketTrend,
  type QueueTicket,
} from './admin-overview'
import type { AdminUser } from '@/src/mocks/admin/users'
import type { MaintenanceTicket } from '@/src/mocks/admin/maintenance'
import type { DepositRecord } from '@/src/mocks/admin/deposit'

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

describe('buildQueueGroups', () => {
  function qt(id: string, status: QueueTicket['status'], tenantName = '小艾'): QueueTicket {
    return { id, address: `測試路 ${id} 號`, tenantName, status }
  }

  it('沒有待辦時回傳空陣列', () => {
    expect(buildQueueGroups([], [])).toEqual([])
  })

  it('只收管理員做得了事的三種工單狀態', () => {
    const groups = buildQueueGroups(
      [
        qt('a', 'submitted'),
        qt('b', 'disputed'),
        qt('c', 'overdue'),
        // 以下都在等別人，不是管理員的待辦
        qt('d', 'notified'),
        qt('e', 'in_progress'),
        qt('f', 'completed'),
        qt('g', 'closed'),
      ],
      [],
    )
    expect(groups.map((group) => group.kind)).toEqual([
      'ticket-disputed',
      'ticket-pending',
      'ticket-overdue',
    ])
    expect(queueTotal(groups)).toBe(3)
  })

  it('依急迫度排序，爭議排最前面', () => {
    const groups = buildQueueGroups([qt('a', 'overdue'), qt('b', 'disputed')], [])
    expect(groups[0].kind).toBe('ticket-disputed')
  })

  it('沒有件數的種類整組不出現', () => {
    const groups = buildQueueGroups([qt('a', 'disputed')], [])
    expect(groups).toHaveLength(1)
    expect(groups.map((group) => group.kind)).not.toContain('ticket-overdue')
  })

  it('count 是真實總數，不受預覽筆數影響', () => {
    const tickets = Array.from({ length: 8 }, (_, i) => qt(`t${i}`, 'disputed'))
    const groups = buildQueueGroups(tickets, [], 3)
    expect(groups[0].count).toBe(8)
    expect(groups[0].items).toHaveLength(3)
  })

  it('每筆明細連到該工單，查看全部連到對應分頁', () => {
    const groups = buildQueueGroups([qt('mt-9', 'overdue')], [])
    expect(groups[0].items[0].to).toBe('/admin/maintenance-tickets?ticket=mt-9')
    expect(groups[0].to).toBe('/admin/maintenance-tickets?tab=overdue')
  })

  it('明細同時顯示地址與租客，方便一眼認出是哪一件', () => {
    const groups = buildQueueGroups([qt('a', 'disputed', '阿賓')], [])
    expect(groups[0].items[0].label).toContain('阿賓')
    expect(groups[0].items[0].label).toContain('測試路')
  })

  it('AI 額度告急獨立成一組，排在工單之後', () => {
    const groups = buildQueueGroups(
      [qt('a', 'disputed')],
      [{ id: 'gemini', label: 'Gemini API 額度告急' }],
    )
    expect(groups.map((group) => group.kind)).toEqual(['ticket-disputed', 'quota-alert'])
    expect(groups[1].to).toBe('/admin/ai-usage')
    expect(queueTotal(groups)).toBe(2)
  })

  it('每一組都帶下一步動作的提示', () => {
    const groups = buildQueueGroups([qt('a', 'submitted')], [])
    expect(groups[0].hint).toContain('通報房東')
  })
})

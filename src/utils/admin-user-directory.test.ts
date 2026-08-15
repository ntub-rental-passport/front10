import { describe, expect, it } from 'vitest'

import {
  adminRoleCounts,
  emptyUserDirectoryFilter,
  filterUserDirectory,
  isFilterActive,
  isQuotaExhausted,
  isSubscriptionExpiring,
  isTicketOpen,
  joinUserDirectory,
  planDistribution,
  type UserDirectoryFilter,
  type UserDirectorySources,
} from './admin-user-directory'
import type { AdminUser } from '@/src/mocks/admin/users'
import type { MaintenanceTicket } from '@/src/mocks/admin/maintenance'
import type { DepositRecord } from '@/src/mocks/admin/deposit'
import type { Subscription, SubscriptionPlan } from '@/src/mocks/admin/subscription'
import type { PlanFeatureRule, PlanFeatures } from './admin-entitlements'

function user(id: string, over: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    email: `${id}@example.com`,
    nickname: null,
    role: 'user',
    adminRole: null,
    status: 'active',
    emailVerified: true,
    registeredAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function ticket(id: string, over: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return {
    id,
    address: '台北市大安區測試路 1 號',
    tenantUserId: 'u-tenant',
    landlordUserId: 'u-landlord',
    category: 'leak',
    description: '測試',
    status: 'submitted',
    createdAt: '2026-01-01T00:00:00.000Z',
    notifiedAt: null,
    firstResponseAt: null,
    completedAt: null,
    timeline: [],
    adminNote: '',
    ...over,
  }
}

function deposit(id: string, over: Partial<DepositRecord> = {}): DepositRecord {
  return {
    id,
    address: '台北市大安區測試路 1 號',
    landlordUserId: 'u-landlord',
    tenantUserId: 'u-tenant',
    monthlyRent: 10000,
    landlordDeclared: 20000,
    tenantDeclared: 20000,
    ...over,
  }
}

/** 測試只在意契約分析的額度，其餘功能一律開啟無上限 */
function planFeatures(analysisLimit: number | null): PlanFeatures {
  const open: PlanFeatureRule = { enabled: true, limit: null }
  return {
    'contract-analysis': { enabled: true, limit: analysisLimit },
    handover: open,
    subsidy: open,
    garbage: open,
    outage: open,
    notes: open,
  }
}

const plans: SubscriptionPlan[] = [
  { id: 'free', name: '免費方案', priceLabel: 'NT$0', storageMb: 200, features: planFeatures(3) },
  {
    id: 'plus',
    name: '進階方案',
    priceLabel: 'NT$99／月',
    storageMb: 2048,
    features: planFeatures(20),
  },
]

function subscription(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    userId: 'u-tenant',
    planId: 'plus',
    expiresAt: '2026-12-31T00:00:00.000Z',
    aiUsed: 1,
    storageUsedMb: 10,
    active: true,
    trialEndsAt: null,
    extraCredits: {},
    ...over,
  }
}

function sources(over: Partial<UserDirectorySources> = {}): UserDirectorySources {
  return {
    users: [user('u-tenant'), user('u-landlord', { role: 'landlord' })],
    tickets: [],
    deposits: [],
    subscriptions: [],
    plans,
    ...over,
  }
}

describe('isTicketOpen', () => {
  it('完成與關閉不算待處理', () => {
    expect(isTicketOpen('completed')).toBe(false)
    expect(isTicketOpen('closed')).toBe(false)
  })

  it('其餘狀態都算待處理', () => {
    expect(isTicketOpen('submitted')).toBe(true)
    expect(isTicketOpen('notified')).toBe(true)
    expect(isTicketOpen('in_progress')).toBe(true)
    expect(isTicketOpen('overdue')).toBe(true)
    expect(isTicketOpen('disputed')).toBe(true)
  })
})

describe('joinUserDirectory', () => {
  it('同一筆案件同時掛在房東與租客兩邊，且各自標記身分', () => {
    const rows = joinUserDirectory(sources({ deposits: [deposit('dr-1')] }))

    const tenantRow = rows.find((row) => row.user.id === 'u-tenant')!
    const landlordRow = rows.find((row) => row.user.id === 'u-landlord')!

    expect(tenantRow.deposits).toHaveLength(1)
    expect(tenantRow.deposits[0].side).toBe('tenant')
    expect(landlordRow.deposits).toHaveLength(1)
    expect(landlordRow.deposits[0].side).toBe('landlord')
  })

  it('工單同樣兩邊都掛，並標記是否待處理', () => {
    const rows = joinUserDirectory(
      sources({ tickets: [ticket('mt-1', { status: 'in_progress' }), ticket('mt-2', { status: 'closed' })] }),
    )

    const tenantRow = rows.find((row) => row.user.id === 'u-tenant')!
    expect(tenantRow.tickets).toHaveLength(2)
    expect(tenantRow.openTicketCount).toBe(1)
  })

  it('逾期工單另外計數', () => {
    const rows = joinUserDirectory(
      sources({ tickets: [ticket('mt-1', { status: 'overdue' }), ticket('mt-2', { status: 'overdue' })] }),
    )

    expect(rows.find((row) => row.user.id === 'u-tenant')!.overdueTicketCount).toBe(2)
  })

  it('只計金額不符的押金，租客未聲明不算', () => {
    const rows = joinUserDirectory(
      sources({
        deposits: [
          deposit('dr-1', { landlordDeclared: 30000, tenantDeclared: 20000 }),
          deposit('dr-2', { landlordDeclared: 30000, tenantDeclared: null }),
          deposit('dr-3'),
        ],
      }),
    )

    const tenantRow = rows.find((row) => row.user.id === 'u-tenant')!
    expect(tenantRow.mismatchedDepositCount).toBe(1)
    expect(tenantRow.deposits.find((item) => item.id === 'dr-1')!.gap).toBe(10000)
    expect(tenantRow.deposits.find((item) => item.id === 'dr-2')!.match).toBe('pending')
  })

  it('沒有訂閱記錄時 subscription 與 plan 都是 null', () => {
    const rows = joinUserDirectory(sources())
    expect(rows[0].subscription).toBeNull()
    expect(rows[0].plan).toBeNull()
  })

  it('有訂閱時接上對應方案', () => {
    const rows = joinUserDirectory(sources({ subscriptions: [subscription()] }))
    const tenantRow = rows.find((row) => row.user.id === 'u-tenant')!
    expect(tenantRow.plan?.name).toBe('進階方案')
  })

  it('與自己無關的案件不會掛上來', () => {
    const rows = joinUserDirectory(
      sources({
        users: [user('u-other')],
        deposits: [deposit('dr-1')],
        tickets: [ticket('mt-1')],
      }),
    )

    expect(rows[0].deposits).toHaveLength(0)
    expect(rows[0].tickets).toHaveLength(0)
  })
})

describe('filterUserDirectory', () => {
  // 固定 now，否則「即將到期」的判定會隨執行日期改變
  const NOW = new Date('2026-08-14T00:00:00.000Z')

  const rows = joinUserDirectory(
    sources({
      users: [
        user('u-tenant', { nickname: '小艾', role: 'user' }),
        user('u-landlord', { nickname: '陳房東', role: 'landlord', status: 'suspended' }),
      ],
      deposits: [deposit('dr-1', { landlordDeclared: 30000, tenantDeclared: 20000 })],
      tickets: [ticket('mt-1', { status: 'overdue' })],
      subscriptions: [subscription()],
    }),
    NOW,
  )

  function run(over: Partial<UserDirectoryFilter>) {
    return filterUserDirectory(rows, { ...emptyUserDirectoryFilter, ...over })
  }

  it('沒有任何條件時全部回傳', () => {
    expect(run({})).toHaveLength(2)
  })

  it('關鍵字比對 email 與暱稱', () => {
    expect(run({ keyword: '小艾' })).toHaveLength(1)
    expect(run({ keyword: 'u-landlord@' })).toHaveLength(1)
    expect(run({ keyword: '不存在' })).toHaveLength(0)
  })

  it('關鍵字忽略大小寫與前後空白', () => {
    expect(run({ keyword: '  U-TENANT@EXAMPLE.COM  ' })).toHaveLength(1)
  })

  it('依身分與帳號狀態篩選', () => {
    expect(run({ role: 'landlord' })).toHaveLength(1)
    expect(run({ status: 'suspended' })[0].user.id).toBe('u-landlord')
  })

  it('方案篩選支援「未訂閱」', () => {
    expect(run({ plan: 'plus' })[0].user.id).toBe('u-tenant')
    expect(run({ plan: 'none' })[0].user.id).toBe('u-landlord')
  })

  it('案件警示分別篩出押金不符與工單逾期', () => {
    expect(run({ alert: 'deposit-mismatch' })).toHaveLength(2)
    expect(run({ alert: 'ticket-overdue' })).toHaveLength(2)
  })

  it('多條件是 AND 疊加', () => {
    expect(run({ alert: 'deposit-mismatch', role: 'landlord' })).toHaveLength(1)
    expect(run({ alert: 'deposit-mismatch', role: 'landlord', status: 'active' })).toHaveLength(0)
  })

  it('沒有人符合的警示會篩出空結果', () => {
    // 這批資料的訂閱到 2026-12-31 才到期、用量也遠低於上限
    expect(run({ alert: 'subscription-expiring' })).toHaveLength(0)
    expect(run({ alert: 'quota-exhausted' })).toHaveLength(0)
  })

  it('訂閱即將到期與額度已用滿各自篩得出人', () => {
    const alertRows = joinUserDirectory(
      sources({
        users: [user('u-expiring'), user('u-full'), user('u-fine')],
        subscriptions: [
          subscription({ id: 's1', userId: 'u-expiring', expiresAt: '2026-08-20T00:00:00.000Z' }),
          subscription({ id: 's2', userId: 'u-full', aiUsed: 20 }),
          subscription({ id: 's3', userId: 'u-fine' }),
        ],
      }),
      NOW,
    )

    const pick = (alert: UserDirectoryFilter['alert']) =>
      filterUserDirectory(alertRows, { ...emptyUserDirectoryFilter, alert }).map((r) => r.user.id)

    expect(pick('subscription-expiring')).toEqual(['u-expiring'])
    expect(pick('quota-exhausted')).toEqual(['u-full'])
  })
})

describe('isSubscriptionExpiring', () => {
  const now = new Date('2026-08-14T00:00:00.000Z')
  const at = (iso: string, over: Partial<Subscription> = {}) =>
    subscription({ expiresAt: iso, ...over })

  it('14 天內到期算即將到期', () => {
    expect(isSubscriptionExpiring(at('2026-08-20T00:00:00.000Z'), now)).toBe(true)
  })

  it('恰好 14 天仍算，第 15 天不算', () => {
    expect(isSubscriptionExpiring(at('2026-08-28T00:00:00.000Z'), now)).toBe(true)
    expect(isSubscriptionExpiring(at('2026-08-29T00:00:00.000Z'), now)).toBe(false)
  })

  it('已經過期不算即將到期', () => {
    expect(isSubscriptionExpiring(at('2026-08-01T00:00:00.000Z'), now)).toBe(false)
  })

  it('已停用的訂閱一律不算，即使日期落在區間內', () => {
    expect(isSubscriptionExpiring(at('2026-08-20T00:00:00.000Z', { active: false }), now)).toBe(
      false,
    )
  })

  it('沒有訂閱時為 false', () => {
    expect(isSubscriptionExpiring(null, now)).toBe(false)
  })
})

describe('isQuotaExhausted', () => {
  const plusPlan = plans[1]

  it('AI 次數用滿即成立', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 20 }), plusPlan)).toBe(true)
  })

  it('儲存空間用滿也成立', () => {
    expect(isQuotaExhausted(subscription({ storageUsedMb: 2048 }), plusPlan)).toBe(true)
  })

  it('超用同樣成立', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 25 }), plusPlan)).toBe(true)
  })

  it('快用完但沒用滿不算 —— 門檻是用滿，不是 90%', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 19, storageUsedMb: 2047 }), plusPlan)).toBe(
      false,
    )
  })

  it('已停用的訂閱不算，與到期判定一致', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 20, active: false }), plusPlan)).toBe(false)
  })

  it('沒有訂閱或方案時為 false', () => {
    expect(isQuotaExhausted(null, plusPlan)).toBe(false)
    expect(isQuotaExhausted(subscription({ aiUsed: 20 }), null)).toBe(false)
  })
})

describe('planDistribution', () => {
  it('依方案計數，並補上「尚未訂閱」一段', () => {
    const rows = joinUserDirectory(
      sources({
        users: [user('a'), user('b'), user('c')],
        subscriptions: [
          subscription({ id: 's1', userId: 'a', planId: 'plus' }),
          subscription({ id: 's2', userId: 'b', planId: 'free' }),
        ],
      }),
    )

    expect(planDistribution(rows, plans)).toEqual([
      { planId: 'free', label: '免費方案', value: 1 },
      { planId: 'plus', label: '進階方案', value: 1 },
      { planId: 'none', label: '尚未訂閱', value: 1 },
    ])
  })

  it('沒有人訂閱時每個方案都是 0，不會少掉分段', () => {
    const rows = joinUserDirectory(sources({ users: [user('a')] }))
    const segments = planDistribution(rows, plans)
    expect(segments).toHaveLength(3)
    expect(segments.find((s) => s.planId === 'none')?.value).toBe(1)
  })
})

describe('adminRoleCounts', () => {
  it('只計管理員，租客與房東不算', () => {
    const rows = joinUserDirectory(
      sources({
        users: [
          user('a', { role: 'admin', adminRole: 'super' }),
          user('b', { role: 'admin', adminRole: 'admin' }),
          user('c', { role: 'landlord' }),
          user('d'),
        ],
      }),
    )

    expect(adminRoleCounts(rows)).toEqual({ super: 1, admin: 1 })
  })

  it('adminRole 為 null 的管理員視為超級管理員', () => {
    const rows = joinUserDirectory(
      sources({ users: [user('a', { role: 'admin', adminRole: null })] }),
    )
    expect(adminRoleCounts(rows)).toEqual({ super: 1, admin: 0 })
  })

  it('沒有管理員時兩者皆為 0', () => {
    const rows = joinUserDirectory(sources({ users: [user('a')] }))
    expect(adminRoleCounts(rows)).toEqual({ super: 0, admin: 0 })
  })
})

describe('isFilterActive', () => {
  it('全空時為 false', () => {
    expect(isFilterActive(emptyUserDirectoryFilter)).toBe(false)
  })

  it('只有空白字元的關鍵字不算有作用', () => {
    expect(isFilterActive({ ...emptyUserDirectoryFilter, keyword: '   ' })).toBe(false)
  })

  it('任一軸有值就為 true', () => {
    expect(isFilterActive({ ...emptyUserDirectoryFilter, alert: 'ticket-overdue' })).toBe(true)
    expect(isFilterActive({ ...emptyUserDirectoryFilter, plan: 'none' })).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import {
  adminCount,
  emptyUserDirectoryFilter,
  filterUserDirectory,
  isFilterActive,
  isQuotaExhausted,
  isSubscriptionExpiring,
  isTicketOpen,
  joinUserDirectory,
  planDistribution,
  realAccountToRow,
  type UserDirectoryFilter,
  type UserDirectorySources,
} from './admin-user-directory'
import type { AdminUser } from '@/src/mocks/admin/users'
import type { MaintenanceTicket } from '@/src/types/admin-maintenance'
import type { DepositRecord } from '@/src/mocks/admin/deposit'
import type { TenantSubscription } from '@/src/mocks/admin/subscription'
import { userPlan, usageMonth } from './admin-plans'

function user(id: string, over: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    email: `${id}@example.com`,
    nickname: null,
    role: 'user',
    status: 'active',
    emailVerified: true,
    registeredAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
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
    interventionRequested: false,
    manuallyQueued: false,
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

function subscription(over: Partial<TenantSubscription> = {}): TenantSubscription {
  return {
    id: 'sub-1',
    userId: 'u-tenant',
    role: 'tenant',
    planKey: 'plus',
    billingCycle: 'monthly',
    aiUsageMonth: usageMonth(),
    freeAiUsed: 0,
    startedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-12-31T00:00:00.000Z',
    aiUsed: 1,
    storageUsedMb: 10,
    active: true,
    trialEndsAt: null,
    checkPacks: [],
    ...over,
  }
}

function sources(over: Partial<UserDirectorySources> = {}): UserDirectorySources {
  return {
    users: [user('u-tenant'), user('u-landlord', { role: 'landlord' })],
    tickets: [],
    deposits: [],
    subscriptions: [],
    ...over,
  }
}

// 沿用種子預設值。這個常數只在測試內部使用，不代表 production 還留著寫死的門檻。
const EXPIRING_SOON_DAYS = 14

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
    const rows = joinUserDirectory(sources({ deposits: [deposit('dr-1')] }), EXPIRING_SOON_DAYS)

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
      EXPIRING_SOON_DAYS,
    )

    const tenantRow = rows.find((row) => row.user.id === 'u-tenant')!
    expect(tenantRow.tickets).toHaveLength(2)
    expect(tenantRow.openTicketCount).toBe(1)
  })

  it('逾期工單另外計數', () => {
    const rows = joinUserDirectory(
      sources({ tickets: [ticket('mt-1', { status: 'overdue' }), ticket('mt-2', { status: 'overdue' })] }),
      EXPIRING_SOON_DAYS,
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
      EXPIRING_SOON_DAYS,
    )

    const tenantRow = rows.find((row) => row.user.id === 'u-tenant')!
    expect(tenantRow.mismatchedDepositCount).toBe(1)
    expect(tenantRow.deposits.find((item) => item.id === 'dr-1')!.gap).toBe(10000)
    expect(tenantRow.deposits.find((item) => item.id === 'dr-2')!.match).toBe('pending')
  })

  it('沒有訂閱記錄時仍適用租客 Free', () => {
    const rows = joinUserDirectory(sources(), EXPIRING_SOON_DAYS)
    expect(rows[0].subscription).toBeNull()
    expect(userPlan(rows[0].user, rows[0].subscription)?.name).toBe('Free 租屋入門')
  })

  it('有訂閱時接上對應方案', () => {
    const rows = joinUserDirectory(sources({ subscriptions: [subscription()] }), EXPIRING_SOON_DAYS)
    const tenantRow = rows.find((row) => row.user.id === 'u-tenant')!
    expect(userPlan(tenantRow.user, tenantRow.subscription)?.name).toBe('Plus 安心租住')
  })

  it('固定展示計數保留，試用結束或降級後重新判斷超出', () => {
    const landlord = user('u-landlord', { role: 'landlord', status: 'suspended' })
    const usageByUserId = { [landlord.id]: { landlord: { properties: 5, rooms: 30, seats: 1 }, tenant: null } }
    const data = sources({
      users: [landlord], usageByUserId,
      subscriptions: [{
        id: 'sub-landlord', userId: landlord.id, role: 'landlord', planKey: 'free',
        billingCycle: null, active: true, trialEndsAt: '2026-08-20T00:00:00.000Z', startedAt: '', expiresAt: '',
      }],
    })
    const before = joinUserDirectory(data, 14, new Date('2026-08-14T00:00:00.000Z'))[0]
    const after = joinUserDirectory(data, 14, new Date('2026-08-21T00:00:00.000Z'))[0]
    expect(before.usage).toEqual(after.usage)
    expect(before.overLimit).toBe(false)
    expect(after.overLimit).toBe(true)
  })

  it('與自己無關的案件不會掛上來', () => {
    const rows = joinUserDirectory(
      sources({
        users: [user('u-other')],
        deposits: [deposit('dr-1')],
        tickets: [ticket('mt-1')],
      }),
      EXPIRING_SOON_DAYS,
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
    EXPIRING_SOON_DAYS,
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

  it('方案篩選依角色，沒有訂閱仍屬 Free', () => {
    expect(run({ plan: 'tenant-plus' })[0].user.id).toBe('u-tenant')
    expect(run({ plan: 'landlord-free' })[0].user.id).toBe('u-landlord')
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
          subscription({ id: 's2', userId: 'u-full', aiUsed: 2, aiUsageMonth: usageMonth(NOW) }),
          subscription({ id: 's3', userId: 'u-fine' }),
        ],
      }),
      EXPIRING_SOON_DAYS,
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
  const at = (iso: string, over: Partial<TenantSubscription> = {}) =>
    subscription({ expiresAt: iso, ...over })

  it('14 天內到期算即將到期', () => {
    expect(isSubscriptionExpiring(at('2026-08-20T00:00:00.000Z'), EXPIRING_SOON_DAYS, now)).toBe(true)
  })

  it('恰好 14 天仍算，第 15 天不算', () => {
    expect(isSubscriptionExpiring(at('2026-08-28T00:00:00.000Z'), EXPIRING_SOON_DAYS, now)).toBe(true)
    expect(isSubscriptionExpiring(at('2026-08-29T00:00:00.000Z'), EXPIRING_SOON_DAYS, now)).toBe(false)
  })

  it('已經過期不算即將到期', () => {
    expect(isSubscriptionExpiring(at('2026-08-01T00:00:00.000Z'), EXPIRING_SOON_DAYS, now)).toBe(false)
  })

  it('已停用的訂閱一律不算，即使日期落在區間內', () => {
    expect(
      isSubscriptionExpiring(at('2026-08-20T00:00:00.000Z', { active: false }), EXPIRING_SOON_DAYS, now),
    ).toBe(false)
  })

  it('沒有訂閱時為 false', () => {
    expect(isSubscriptionExpiring(null, EXPIRING_SOON_DAYS, now)).toBe(false)
  })

  it('門檻可調整：門檻拉大後，原本超出範圍的到期日也算即將到期', () => {
    // 距今 20 天到期，14 天的預設門檻擋不到，拉大到 30 天後就算即將到期
    expect(isSubscriptionExpiring(at('2026-09-03T00:00:00.000Z'), 14, now)).toBe(false)
    expect(isSubscriptionExpiring(at('2026-09-03T00:00:00.000Z'), 30, now)).toBe(true)
  })
})

describe('isQuotaExhausted', () => {

  it('AI 次數用滿即成立', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 2 }), true)).toBe(true)
  })

  it('儲存空間用滿也成立', () => {
    expect(isQuotaExhausted(subscription({ storageUsedMb: 1024 }), true)).toBe(true)
  })

  it('超用同樣成立', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 3 }), true)).toBe(true)
  })

  it('快用完但沒用滿不算 —— 門檻是用滿，不是 90%', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 1, storageUsedMb: 1023 }), true)).toBe(
      false,
    )
  })

  it('已停用的訂閱不算，與到期判定一致', () => {
    expect(isQuotaExhausted(subscription({ aiUsed: 2, active: false }), true)).toBe(false)
  })

  it('沒有訂閱或角色為房東時為 false', () => {
    expect(isQuotaExhausted(null, true)).toBe(false)
    expect(isQuotaExhausted({ id: 'l', userId: 'l', role: 'landlord', planKey: 'plus', active: true, billingCycle: 'monthly', startedAt: '', expiresAt: '', trialEndsAt: null }, true)).toBe(false)
  })
})

describe('planDistribution', () => {
  it('依角色方案計數，沒有訂閱的人計入 Free', () => {
    const rows = joinUserDirectory(
      sources({
        users: [user('a'), user('b'), user('c')],
        subscriptions: [
          subscription({ id: 's1', userId: 'a', planKey: 'plus' }),
          subscription({ id: 's2', userId: 'b', planKey: 'free' }),
        ],
      }),
      EXPIRING_SOON_DAYS,
    )

    expect(planDistribution(rows, 'tenant')).toEqual([
      { planKey: 'free', label: 'Free 租屋入門', value: 2, trialCount: 0 },
      { planKey: 'plus', label: 'Plus 安心租住', value: 1, trialCount: 0 },
      { planKey: 'pro', label: 'Pro 合租進階', value: 0, trialCount: 0 },
    ])
  })

  it('沒有人付費時所有人計入 Free，保留三個分段', () => {
    const rows = joinUserDirectory(sources({ users: [user('a')] }), EXPIRING_SOON_DAYS)
    const segments = planDistribution(rows, 'tenant')
    expect(segments).toHaveLength(3)
    expect(segments.find((s) => s.planKey === 'free')?.value).toBe(1)
  })
})

describe('角色方案分布與篩選', () => {
  const now = new Date('2026-08-14T00:00:00.000Z')
  const rows = joinUserDirectory(sources({
    users: [user('trial'), user('inactive'), user('real'), user('landlord', { role: 'landlord' }), user('admin', { role: 'admin' })],
    subscriptions: [
      subscription({ userId: 'trial', planKey: 'free', trialEndsAt: '2026-08-20T00:00:00.000Z' }),
      subscription({ userId: 'inactive', planKey: 'pro', active: false }),
      { id: 'l', userId: 'landlord', role: 'landlord', planKey: 'free', billingCycle: null, active: true, trialEndsAt: '2026-08-20T00:00:00.000Z', startedAt: '', expiresAt: '' },
    ],
  }), 14, now)

  it('試用算自己角色的 Plus，管理員不計入任一分布', () => {
    expect(planDistribution(rows, 'tenant', now)).toEqual([
      { planKey: 'free', label: 'Free 租屋入門', value: 2, trialCount: 0 },
      { planKey: 'plus', label: 'Plus 安心租住', value: 1, trialCount: 1 },
      { planKey: 'pro', label: 'Pro 合租進階', value: 0, trialCount: 0 },
    ])
    expect(planDistribution(rows, 'landlord', now).map((s) => [s.planKey, s.value, s.trialCount])).toEqual([
      ['free', 0, 0], ['plus', 1, 1], ['pro', 0, 0],
    ])
    expect(planDistribution([], 'landlord', now).map((s) => s.value)).toEqual([0, 0, 0])
  })
  it('租客 Free 包含無紀錄與停用訂閱，試用可用 Plus 篩到', () => {
    const pick = (plan: UserDirectoryFilter['plan']) => filterUserDirectory(rows, { ...emptyUserDirectoryFilter, plan }, now).map((r) => r.user.id)
    expect(pick('tenant-free')).toEqual(['inactive', 'real'])
    expect(pick('tenant-plus')).toEqual(['trial'])
    expect(pick('landlord-plus')).toEqual(['landlord'])
  })
  it('Free 即使有到期日也沒有訂閱到期警示', () => {
    expect(isSubscriptionExpiring(subscription({ planKey: 'free', expiresAt: '2026-08-20T00:00:00.000Z' }), 14, now)).toBe(false)
  })
  it('加購包算入 AI 警示，試用容量用 Plus，停用與房東不算', () => {
    const sub = subscription({ planKey: 'plus', aiUsed: 2, aiUsageMonth: usageMonth(now) })
    expect(isQuotaExhausted(sub, true, now)).toBe(true)
    expect(isQuotaExhausted({ ...sub, checkPacks: [{ id: 'p', source: 'admin', quantity: 1, createdAt: now.toISOString(), usedAt: [] }] }, true, now)).toBe(false)
    expect(isQuotaExhausted(subscription({ planKey: 'free', storageUsedMb: 300, trialEndsAt: '2026-08-20T00:00:00.000Z' }), true, now)).toBe(false)
    expect(isQuotaExhausted(subscription({ planKey: 'free' }), false, now)).toBe(true)
  })
})

describe('adminCount', () => {
  it('空名冊回傳 0', () => {
    expect(adminCount([])).toBe(0)
  })

  it('只計管理員，租客與房東不算', () => {
    const rows = joinUserDirectory(
      sources({
        users: [
          user('a', { role: 'admin' }),
          user('b', { role: 'admin' }),
          user('c', { role: 'landlord' }),
          user('d'),
        ],
      }),
      EXPIRING_SOON_DAYS,
    )

    expect(adminCount(rows)).toBe(2)
  })

  it('只有一位管理員時回傳 1', () => {
    const rows = joinUserDirectory(
      sources({ users: [user('a', { role: 'admin' })] }),
      EXPIRING_SOON_DAYS,
    )
    expect(adminCount(rows)).toBe(1)
  })

  it('沒有管理員時回傳 0', () => {
    const rows = joinUserDirectory(sources({ users: [user('a')] }), EXPIRING_SOON_DAYS)
    expect(adminCount(rows)).toBe(0)
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
    expect(isFilterActive({ ...emptyUserDirectoryFilter, plan: 'landlord-free' })).toBe(true)
  })
})

describe('realAccountToRow', () => {
  const base = {
    id: 7,
    email: 'teammate@ntub.edu.tw',
    displayName: '組員',
    roles: ['tenant'],
    status: 'active',
    emailVerified: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    lastLoginAt: '2026-09-13T00:00:00.000Z',
  }

  it('帶 admin 角色的就是管理員', () => {
    // 後台刻意不做「網頁上新增管理員」，資料庫裡帶 admin 的人
    // 都是由能登入伺服器的人用 manage_admin.py 授予的
    const row = realAccountToRow({ ...base, roles: ['tenant', 'admin'] })
    expect(row.user.role).toBe('admin')
  })

  it('房東與租客不是管理員', () => {
    expect(realAccountToRow({ ...base, roles: ['landlord'] }).user.role).toBe('landlord')
    expect(realAccountToRow({ ...base, roles: ['tenant'] }).user.role).toBe('user')
  })

  it('API 用量原樣接入，以 Free 上限判斷，停用帳號照樣判斷', () => {
    const usage = { landlord: { properties: 2, rooms: 5, seats: 1 }, tenant: null }
    const row = realAccountToRow({ ...base, roles: ['landlord'], status: 'suspended', usage })
    expect(row.usage).toEqual(usage)
    expect(row.overLimit).toBe(true)
    expect(realAccountToRow({ ...base, roles: ['admin', 'landlord'], usage }).overLimit).toBe(false)
    expect(filterUserDirectory([row, realAccountToRow(base)], {
      ...emptyUserDirectoryFilter, alert: 'over-limit',
    })).toEqual([row])
  })

  it('舊後端缺 usage 與明確 null 都保留未知，不當作零用量', () => {
    for (const row of [realAccountToRow(base), realAccountToRow({ ...base, usage: null })]) {
      expect(row.usage).toBeNull()
      expect(row.overLimit).toBe(false)
    }
  })

  it('id 加前綴，不與展示資料相撞', () => {
    expect(realAccountToRow(base).user.id).toBe('real-7')
    expect(realAccountToRow(base).realAccountId).toBe(7)
  })

  it('realAccountId 有值，才代表這一列的停用會真的生效', () => {
    // 畫面靠這個欄位決定要不要顯示停用按鈕；展示資料沒有這個欄位
    expect(realAccountToRow(base).realAccountId).toBeDefined()
  })

  it('不編造關聯資料', () => {
    // 真實帳號沒有訂閱／押金／工單 —— 那些只存在於展示資料集。
    // 給 0 或空陣列讓畫面顯示「—」，不要生一個看起來很合理的數字。
    const row = realAccountToRow(base)
    expect(row.subscription).toBeNull()
    expect(userPlan(row.user, row.subscription)?.key).toBe('free')
    expect(row.deposits).toEqual([])
    expect(row.tickets).toEqual([])
    expect(row.openTicketCount).toBe(0)
    expect(row.mismatchedDepositCount).toBe(0)
    expect(row.subscriptionExpiring).toBe(false)
    expect(row.quotaExhausted).toBe(false)
  })

  it('認不得的 status 一律當成正常', () => {
    // 後端只會回 active / suspended；真的收到別的值時，
    // 寧可顯示「正常」也不要把一個好好的帳號標成停用
    expect(realAccountToRow({ ...base, status: 'suspended' }).user.status).toBe('suspended')
    expect(realAccountToRow({ ...base, status: '???' }).user.status).toBe('active')
  })

  it('沒有註冊時間也不會壞', () => {
    expect(realAccountToRow({ ...base, createdAt: null }).user.registeredAt).toBe('')
    expect(realAccountToRow({ ...base, lastLoginAt: null }).user.lastLoginAt).toBeNull()
  })
})

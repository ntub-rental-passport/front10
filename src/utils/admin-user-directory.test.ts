import { describe, expect, it } from 'vitest'

import {
  emptyUserDirectoryFilter,
  filterUserDirectory,
  isFilterActive,
  isTicketOpen,
  joinUserDirectory,
  type UserDirectoryFilter,
  type UserDirectorySources,
} from './admin-user-directory'
import type { AdminUser } from '@/src/mocks/admin/users'
import type { MaintenanceTicket } from '@/src/mocks/admin/maintenance'
import type { DepositRecord } from '@/src/mocks/admin/deposit'
import type { Subscription, SubscriptionPlan } from '@/src/mocks/admin/subscription'

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

const plans: SubscriptionPlan[] = [
  { id: 'free', name: '免費方案', priceLabel: 'NT$0', aiQuota: 3, storageMb: 200 },
  { id: 'plus', name: '進階方案', priceLabel: 'NT$99／月', aiQuota: 20, storageMb: 2048 },
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

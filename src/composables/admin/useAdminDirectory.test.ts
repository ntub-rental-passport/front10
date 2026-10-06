import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { AdminAccount } from '@/src/services/adminUsersApi'
import type { AdminRepairRecord } from '@/src/services/adminRepairApi'
import { joinUserDirectory } from '@/src/utils/admin-user-directory'
import { userPlan } from '@/src/utils/admin-plans'

const api = vi.hoisted(() => ({
  fetchAdminAccounts: vi.fn(), updateAccountStatus: vi.fn(),
  fetchAdminDeposits: vi.fn(), fetchAdminRepairs: vi.fn(), patchAdminRepair: vi.fn(),
}))
vi.mock('@/src/services/adminUsersApi', () => api)
vi.mock('@/src/services/adminUserRecordsApi', () => api)
vi.mock('@/src/services/adminRepairApi', () => api)
vi.mock('@/src/mocks/admin/usage', async (original) => {
  const actual = await original<typeof import('@/src/mocks/admin/usage')>()
  return { ...actual, seedAccountUsage: vi.fn(actual.seedAccountUsage) }
})
vi.mock('@/src/composables/useAuth', () => ({
  getAuthSession: () => ({ role: 'admin', userId: '1', accessToken: 'token' }),
}))
vi.mock('../useNow', () => ({ useNow: () => ref(new Date('2026-10-10T00:00:00+08:00')) }))

const account = (id: number): AdminAccount => ({
  id, email: `real${id}@example.com`, displayName: `真實帳號${id}`, avatarUrl: null,
  roles: [id === 2 ? 'landlord' : 'user'], status: 'active', emailVerified: true,
  hasPassword: true, providers: [], createdAt: null, lastLoginAt: null,
})
const repair = (id: string, status: AdminRepairRecord['status'] = 'pending'): AdminRepairRecord => ({
  id, ticketNo: `R-${id}`, code: `R-${id}`, status,
  tenantUserId: '1', landlordUserId: '2', tenant: '租客甲', landlord: '房東甲',
  address: '臺北市測試路', property: '測試公寓', room: '301', location: '浴室', equipment: '水電',
  description: '水管漏水', urgency: 'normal', landlordRead: false, responsibility: 'pending',
  adminNote: '', interventionRequested: false, manuallyQueued: false,
  createdAt: '2020-01-01T00:00:00+08:00', updatedAt: '2020-01-01T00:00:00+08:00',
  timeline: [], photos: [],
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  api.fetchAdminAccounts.mockResolvedValue([account(1), account(2), account(3)])
  api.fetchAdminDeposits.mockResolvedValue({ deposits: [
    { id: 'lease-1', address: '測試路', monthlyRent: 10000, landlordDeclared: 20000, tenantDeclared: 15000, landlordId: 2, tenantId: 1 },
    { id: 'lease-2', address: '無租客帳號', monthlyRent: 10000, landlordDeclared: 20000, tenantDeclared: null, landlordId: 2, tenantId: null },
  ] })
  api.fetchAdminRepairs.mockResolvedValue({ items: [repair('1'), repair('2', 'completed'), repair('3', 'canceled')] })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function loaded() {
  const module = await import('./useAdminDirectory')
  const directory = module.useAdminDirectory()
  await Promise.all([directory.reloadRealAccounts(), directory.reloadDeposits(), directory.reloadTickets()])
  return directory
}

describe('useAdminDirectory 真實案件關聯', () => {
  it('正式站只有真實列，不計算展示用量，真實帳號仍適用 Free', async () => {
    vi.stubEnv('DEV', false)
    const directory = await loaded()
    const { seedAccountUsage } = await import('@/src/mocks/admin/usage')
    expect(directory.rows.value.map((row) => row.user.id)).toEqual(['real-1', 'real-2', 'real-3'])
    expect(seedAccountUsage).not.toHaveBeenCalled()
    for (const row of directory.rows.value) {
      expect(row.subscription).toBeNull()
      expect(userPlan(row.user, row.subscription)?.key).toBe('free')
    }
    const { adminSubscriptionCollection } = await import('./useAdminSubscription')
    expect(adminSubscriptionCollection.value).toEqual([])
  })

  it('真實帳號拿到自己的押金與工單，展示帳號的資料維持原樣', async () => {
    const directory = await loaded()
    const tenant = directory.rowOf('real-1')!
    const landlord = directory.rowOf('real-2')!
    const other = directory.rowOf('real-3')!
    expect(tenant.deposits.map((item) => [item.id, item.side, item.match, item.gap])).toEqual([
      ['lease-1', 'tenant', 'mismatched', 5000],
    ])
    expect(landlord.deposits.map((item) => [item.id, item.side, item.match])).toEqual([
      ['lease-1', 'landlord', 'mismatched'], ['lease-2', 'landlord', 'pending'],
    ])
    for (const row of [tenant, landlord]) {
      expect(row.mismatchedDepositCount).toBe(1)
      expect(row.tickets.map((item) => item.id)).toEqual(['R-1', 'R-2', 'R-3'])
      expect(row.openTicketCount).toBe(1)
      expect(row.overdueTicketCount).toBe(1)
    }
    expect(tenant.tickets.every((item) => item.side === 'tenant')).toBe(true)
    expect(landlord.tickets.every((item) => item.side === 'landlord')).toBe(true)
    expect(other.deposits).toEqual([])
    expect(other.tickets).toEqual([])
    expect(other.mismatchedDepositCount).toBe(0)
    expect(other.overdueTicketCount).toBe(0)
    const { adminUsersCollection } = await import('./useAdminUsers')
    const { adminDepositCollection } = await import('./useAdminDeposits')
    const { adminSubscriptionCollection } = await import('./useAdminSubscription')
    const expectedDemo = joinUserDirectory({
      users: adminUsersCollection.value, deposits: adminDepositCollection.value,
      tickets: [], subscriptions: adminSubscriptionCollection.value,
    }, 14)
    const demoRows = directory.rows.value.filter((row) => row.realAccountId === undefined)
    expect(demoRows.length).toBeGreaterThan(0)
    for (const row of demoRows) {
      const expected = expectedDemo.find((item) => item.user.id === row.user.id)!
      expect(row.deposits).toEqual(expected.deposits)
      expect(row.mismatchedDepositCount).toBe(expected.mismatchedDepositCount)
      expect(row.tickets).toEqual([])
    }
  })

  it('關聯隨 API 重讀與帳號狀態更新，不會退回空工單', async () => {
    const directory = await loaded()
    api.fetchAdminRepairs.mockResolvedValue({ items: [repair('1', 'completed')] })
    await directory.reloadTickets()
    expect(directory.rowOf('real-1')!.openTicketCount).toBe(0)
    expect(directory.rowOf('real-1')!.overdueTicketCount).toBe(0)
    api.updateAccountStatus.mockResolvedValue({ ...account(1), status: 'suspended' })
    await directory.setRealAccountStatus(directory.rowOf('real-1')!, 'suspended')
    expect(directory.rowOf('real-1')!.user.status).toBe('suspended')
    expect(directory.rowOf('real-1')!.deposits).toHaveLength(1)
    expect(directory.rowOf('real-1')!.tickets).toHaveLength(1)
  })
})

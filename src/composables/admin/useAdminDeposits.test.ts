import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminDepositRecord } from '@/src/services/adminUserRecordsApi'

const api = vi.hoisted(() => ({ fetchAdminDeposits: vi.fn() }))
const auth = vi.hoisted(() => ({ getAuthSession: vi.fn() }))
vi.mock('@/src/services/adminUserRecordsApi', () => api)
vi.mock('@/src/composables/useAuth', () => auth)

const deposit: AdminDepositRecord = {
  id: 'lease-1', address: '臺北市測試路', startDate: '2026-01-01', endDate: '2026-12-31',
  monthlyRent: 10000, landlordDeclared: 20000, tenantDeclared: 15000, landlordId: 3, tenantId: 7,
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  auth.getAuthSession.mockReturnValue({ role: 'admin', userId: '1', accessToken: 'token-1' })
  api.fetchAdminDeposits.mockResolvedValue({ deposits: [deposit] })
})

describe('useAdminDeposits', () => {
  it('同時讀取只送一次，成功後保留分開來源並合併統計', async () => {
    const module = await import('./useAdminDeposits')
    const deposits = module.useAdminDeposits()
    module.useAdminDeposits()
    expect(deposits.loadState.value).toBe('loading')
    expect(deposits.stats.value).toBeNull()
    await module.loadAdminDeposits()
    expect(api.fetchAdminDeposits).toHaveBeenCalledTimes(1)
    expect(deposits.loadState.value).toBe('ready')
    expect(deposits.realRecords.value).toHaveLength(1)
    expect(deposits.demoRecords.value.every((item) => item.landlordUserId.startsWith('u-'))).toBe(true)
    expect(deposits.records.value).toHaveLength(deposits.demoRecords.value.length + 1)
    const demo = deposits.demoRecords.value
    expect(deposits.stats.value).toEqual({
      declaredTotal: demo.reduce((total, item) => total + item.landlordDeclared, 20000),
      mismatchedCount: demo.filter((item) => item.tenantDeclared !== null && item.landlordDeclared !== item.tenantDeclared).length + 1,
      pendingCount: demo.filter((item) => item.tenantDeclared === null).length,
    })
    module.useAdminDeposits()
    expect(api.fetchAdminDeposits).toHaveBeenCalledTimes(1)
  })

  it('真實押金讀不到時統計為 null，展示資料仍可分開取用；重試可恢復', async () => {
    api.fetchAdminDeposits.mockResolvedValueOnce(null)
    const module = await import('./useAdminDeposits')
    const deposits = module.useAdminDeposits()
    await module.loadAdminDeposits()
    expect(deposits.loadState.value).toBe('error')
    expect(deposits.stats.value).toBeNull()
    expect(deposits.demoRecords.value.length).toBeGreaterThan(0)
    await deposits.reload()
    expect(deposits.loadState.value).toBe('ready')
    expect(deposits.stats.value).not.toBeNull()
  })

  it('成功後重讀失敗也不可繼續把舊數字當成全站統計', async () => {
    const module = await import('./useAdminDeposits')
    const deposits = module.useAdminDeposits()
    await module.loadAdminDeposits()
    api.fetchAdminDeposits.mockResolvedValueOnce(null)
    await deposits.reload()
    expect(deposits.loadState.value).toBe('error')
    expect(deposits.realRecords.value).toEqual([])
    expect(deposits.stats.value).toBeNull()
  })

  it('成功讀到空清單才可以顯示純展示統計', async () => {
    api.fetchAdminDeposits.mockResolvedValueOnce({ deposits: [] })
    const module = await import('./useAdminDeposits')
    const deposits = module.useAdminDeposits()
    await module.loadAdminDeposits()
    expect(deposits.loadState.value).toBe('ready')
    expect(deposits.realRecords.value).toEqual([])
    expect(deposits.stats.value).not.toBeNull()
  })

  it('換帳號時清掉舊資料，舊請求晚回來也不會覆蓋新帳號', async () => {
    let resolveOld!: (value: { deposits: AdminDepositRecord[] }) => void
    api.fetchAdminDeposits.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
    const module = await import('./useAdminDeposits')
    const deposits = module.useAdminDeposits()
    const oldRequest = module.loadAdminDeposits()
    auth.getAuthSession.mockReturnValue({ role: 'admin', userId: '2', accessToken: 'token-2' })
    api.fetchAdminDeposits.mockResolvedValueOnce({ deposits: [{ ...deposit, id: 'lease-2' }] })
    module.useAdminDeposits()
    expect(deposits.realRecords.value).toEqual([])
    expect(deposits.stats.value).toBeNull()
    await module.loadAdminDeposits()
    resolveOld({ deposits: [deposit] })
    await oldRequest
    expect(deposits.realRecords.value.map((item) => item.id)).toEqual(['lease-2'])
    expect(deposits.loadState.value).toBe('ready')
  })

  it('登入憑證改變也重置，登出後不送請求或顯示舊統計', async () => {
    const module = await import('./useAdminDeposits')
    const deposits = module.useAdminDeposits()
    await module.loadAdminDeposits()
    auth.getAuthSession.mockReturnValue({ role: 'admin', userId: '1', accessToken: 'token-new' })
    module.useAdminDeposits()
    expect(deposits.realRecords.value).toEqual([])
    await module.loadAdminDeposits()
    expect(api.fetchAdminDeposits).toHaveBeenCalledTimes(2)
    auth.getAuthSession.mockReturnValue(null)
    module.useAdminDeposits()
    expect(deposits.realRecords.value).toEqual([])
    expect(deposits.stats.value).toBeNull()
    expect(deposits.loadState.value).toBe('error')
    expect(api.fetchAdminDeposits).toHaveBeenCalledTimes(2)
  })
})

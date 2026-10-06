import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAdminDeposits } from './adminUserRecordsApi'

const http = vi.hoisted(() => ({ adminRequest: vi.fn() }))
vi.mock('./adminHttp', () => http)
beforeEach(() => vi.clearAllMocks())

describe('fetchAdminDeposits', () => {
  it('向管理員全站押金端點讀取，保留後端回傳', async () => {
    const result = { deposits: [] }
    http.adminRequest.mockResolvedValueOnce(result)
    expect(await fetchAdminDeposits()).toBe(result)
    expect(http.adminRequest).toHaveBeenCalledWith('/admin/deposits')
  })

  it('讀取失敗回 null，不冒充空清單', async () => {
    http.adminRequest.mockRejectedValueOnce(new Error('無法連線'))
    expect(await fetchAdminDeposits()).toBeNull()
  })
})

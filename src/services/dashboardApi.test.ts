import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBillPaymentProof, recordBillPayment } from './dashboardApi'

const auth = vi.hoisted(() => ({ getAuthSession: vi.fn() }))
vi.mock('@/src/composables/useAuth', () => auth)

beforeEach(() => auth.getAuthSession.mockReturnValue({ accessToken: 'tenant-token' }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('自記帳單繳費憑證 API', () => {
  it('送出原始檔名與 data URL', async () => {
    const payload = {
      paid_at: '2026-10-16', payment_method: 'bank-transfer' as const,
      payment_note: '', payment_proof_name: '憑證.pdf',
      proof: { name: '憑證.pdf', data: 'data:application/pdf;base64,JVBERi0=' },
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ paymentProofStored: true })))
    vi.stubGlobal('fetch', fetchMock)
    await expect(recordBillPayment('12', payload)).resolves.toEqual({ paymentProofStored: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/bills/12/payment', {
      method: 'PUT', credentials: 'include',
      headers: { Authorization: 'Bearer tenant-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })

  it('帶登入資訊下載，解碼中文原始檔名並釋放 blob URL', async () => {
    vi.useFakeTimers()
    const filename = '轉帳憑證 #1.png'
    const fetchMock = vi.fn().mockResolvedValue(new Response('JPEG', {
      headers: { 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename) },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const link = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(link) })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:proof')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    await downloadBillPaymentProof('12')
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/bills/12/payment-proof', {
      credentials: 'include', headers: { Authorization: 'Bearer tenant-token' },
    })
    expect(await (create.mock.calls[0]![0] as Blob).text()).toBe('JPEG')
    expect(link.download).toBe(filename)
    expect(link.href).toBe('blob:proof')
    expect(link.click).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:proof')
  })

  it('下載失敗保留伺服器的中文錯誤', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: '這筆繳費沒有上傳憑證檔案。',
    }), { status: 404 })))
    await expect(downloadBillPaymentProof('12')).rejects.toThrow('這筆繳費沒有上傳憑證檔案。')
  })

  it('未登入不送出下載請求', async () => {
    auth.getAuthSession.mockReturnValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(downloadBillPaymentProof('12')).rejects.toThrow('請先登入後再下載憑證。')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

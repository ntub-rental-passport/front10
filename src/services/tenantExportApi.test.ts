import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadAccountData } from './tenantExportApi'
import { downloadPaymentRecords } from './dashboardApi'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe.each([
  ['個人資料', '/api/account/export', downloadAccountData],
  ['繳費紀錄', '/api/dashboard/payments/export', downloadPaymentRecords],
] as const)('%s 匯出下載', (title, path, download) => {
  it('攜帶登入 Cookie、解碼中文檔名並釋放下載網址', async () => {
    vi.useFakeTimers()
    const filename = `RentMate-${title}-2026-10-16.zip`
    const fetchMock = vi.fn().mockResolvedValue(new Response('壓縮檔內容', {
      headers: { 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename) },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const link = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(link) })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    await download()
    expect(fetchMock).toHaveBeenCalledWith(path, { credentials: 'include' })
    expect(await (create.mock.calls[0]![0] as Blob).text()).toBe('壓縮檔內容')
    expect(link.download).toBe(filename)
    expect(link.href).toBe('blob:export')
    expect(link.click).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:export')
  })

  it.each([401, 503])('失敗時保留後端中文 detail（%s）', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: '目前無法匯出資料。',
    }), { status })))
    await expect(download()).rejects.toThrow('目前無法匯出資料。')
  })

  it('非 JSON 錯誤顯示中文備援訊息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('服務錯誤', { status: 500 })))
    await expect(download()).rejects.toThrow('資料匯出失敗，請稍後重試。')
  })
})

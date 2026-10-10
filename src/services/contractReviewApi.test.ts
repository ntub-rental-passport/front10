import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteReviewFile, getReview, reviewFileUrl, saveRecords, uploadEvidence, uploadReport, type ReviewFile } from './contractReviewApi'

const reviewId = '12345678-1234-1234-1234-123456789abc'
const base = `/api/contract/reviews/${reviewId}`
const file: ReviewFile = {
  id: 7, kind: 'evidence', recordKey: 'record-1', name: '照片.jpg', contentType: 'image/jpeg',
  size: 123, reportId: null, createdAt: '2026-10-08T00:00:00Z', url: `${base}/files/7`,
}
const review = { id: reviewId, records: [], files: [file], rentalId: null, updatedAt: file.createdAt }
const fetchMock = vi.fn()
const respond = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status })

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('審閱 API', () => {
  it('GET 使用 cookie 驗證並保留紀錄和檔案', async () => {
    fetchMock.mockResolvedValue(respond(200, review))
    await expect(getReview(reviewId)).resolves.toEqual(review)
    expect(fetchMock).toHaveBeenCalledWith(base, { credentials: 'include' })
  })

  it('只有 GET 404 回 null', async () => {
    fetchMock.mockImplementation(async () => respond(404, { detail: '找不到這筆審閱紀錄。' }))
    await expect(getReview(reviewId)).resolves.toBeNull()
    await expect(saveRecords(reviewId, [])).rejects.toThrow('找不到這筆審閱紀錄。')
    await expect(deleteReviewFile(reviewId, 7)).rejects.toThrow('找不到這筆審閱紀錄。')
  })

  it.each([401, 409, 503])('原樣傳遞 %i 的中文 detail', async status => {
    fetchMock.mockResolvedValue(respond(status, { detail: '伺服器的錯誤訊息。' }))
    await expect(getReview(reviewId)).rejects.toThrow('伺服器的錯誤訊息。')
  })

  it('連線失敗與非 JSON 錯誤都拋出錯誤', async () => {
    fetchMock.mockRejectedValueOnce(new Error('無法連線')).mockResolvedValueOnce(new Response('oops', { status: 500 }))
    await expect(getReview(reviewId)).rejects.toThrow('無法連線')
    await expect(getReview(reviewId)).rejects.toThrow('審閱紀錄請求失敗（500）')
  })

  it('PUT 僅送出 records JSON', async () => {
    fetchMock.mockResolvedValue(respond(200, review))
    const records = [{ id: 'record-1', note: '已確認' }]
    await expect(saveRecords(reviewId, records)).resolves.toEqual(review)
    expect(fetchMock).toHaveBeenCalledWith(base, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    })
  })

  it('佐證用 record_key 與重複的 files 欄位上傳', async () => {
    fetchMock.mockResolvedValue(respond(201, { files: [file] }))
    const images = [new File(['first'], '一.png', { type: 'image/png' }), new File(['second'], '二.webp', { type: 'image/webp' })]
    await expect(uploadEvidence(reviewId, 'record-1', images)).resolves.toEqual([file])
    const [url, init] = fetchMock.mock.calls[0] as [string, NonNullable<Parameters<typeof fetch>[1]>]
    expect(url).toBe(`${base}/evidence`)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(init.headers).toBeUndefined()
    const body = init.body as FormData
    expect([...body.keys()]).toEqual(['record_key', 'files', 'files'])
    expect(body.get('record_key')).toBe('record-1')
    expect(body.getAll('files')).toEqual(images)
  })

  it.each(['bytes', 'blob'])('報告支援 %s，用 file 與 report_id 欄位上傳', async source => {
    const report = { ...file, kind: 'report', reportId: 'RM-123', recordKey: null, contentType: 'application/pdf' }
    fetchMock.mockResolvedValue(respond(201, report))
    const bytes = new TextEncoder().encode('%PDF-報告')
    await expect(uploadReport(reviewId, source === 'blob' ? new Blob([bytes], { type: 'application/pdf' }) : bytes, '診斷.pdf', 'RM-123')).resolves.toEqual(report)
    const [url, init] = fetchMock.mock.calls[0] as [string, NonNullable<Parameters<typeof fetch>[1]>]
    expect(url).toBe(`${base}/reports`)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(init.headers).toBeUndefined()
    const body = init.body as FormData
    expect([...body.keys()]).toEqual(['file', 'report_id'])
    expect(body.get('report_id')).toBe('RM-123')
    const uploaded = body.get('file') as File
    expect(uploaded.name).toBe('診斷.pdf')
    expect(uploaded.type).toBe('application/pdf')
    expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(bytes)
  })

  it('DELETE 使用 cookie 驗證，204 不讀取 JSON', async () => {
    fetchMock.mockResolvedValue(respond(204))
    await expect(deleteReviewFile(reviewId, 7)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(`${base}/files/7`, { method: 'DELETE', credentials: 'include' })
  })

  it('開發環境一律用 /api，檔案 URL 不重複 /api', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example/api/')
    const api = await import('./contractReviewApi')
    fetchMock.mockResolvedValue(respond(200, review))
    await api.getReview(reviewId)
    expect(fetchMock.mock.calls[0][0]).toBe(base)
    expect(api.reviewFileUrl(file)).toBe(file.url)
    expect(reviewFileUrl(file)).toBe(file.url)
  })

  it('正式環境使用設定的 API 位址並去掉尾端斜線', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example/api/')
    const api = await import('./contractReviewApi')
    fetchMock.mockResolvedValue(respond(200, review))
    await api.getReview(reviewId)
    expect(fetchMock.mock.calls[0][0]).toBe(`https://backend.example${base}`)
    expect(api.reviewFileUrl(file)).toBe(`https://backend.example${file.url}`)
  })

  it('正式環境沒有設定 API 位址時仍使用 /api', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_BASE_URL', '')
    const api = await import('./contractReviewApi')
    expect(api.reviewFileUrl(file)).toBe(file.url)
  })
})

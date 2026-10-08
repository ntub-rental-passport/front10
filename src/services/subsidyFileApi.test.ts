import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteSubsidyFile,
  fetchSubsidyFileBlob,
  listSubsidyFiles,
  uploadSubsidyFile,
  type SubsidyFile,
} from './subsidyFileApi'

const auth = vi.hoisted(() => ({ getAuthSession: vi.fn() }))
vi.mock('@/src/composables/useAuth', () => auth)
const file: SubsidyFile = {
  id: 12,
  docType: 'lease_copy',
  name: '租約.pdf',
  contentType: 'application/pdf',
  size: 8,
  rentalId: null,
  createdAt: '2026-10-08T00:00:00Z',
  expiresAt: '2027-04-06T00:00:00Z',
  url: '/api/subsidy/files/12',
}
const respond = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status })
beforeEach(() => auth.getAuthSession.mockReturnValue({ accessToken: 'tenant-token' }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('補助文件 API', () => {
  it('Bearer 讀取清單，保留 files、count、limit 並停用快取', async () => {
    const result = { files: [file], count: 1, limit: 20 }
    const fetchMock = vi.fn().mockResolvedValue(respond(200, result))
    vi.stubGlobal('fetch', fetchMock)
    await expect(listSubsidyFiles()).resolves.toEqual(result)
    expect(fetchMock).toHaveBeenCalledWith('/api/subsidy/files', {
      headers: { Authorization: 'Bearer tenant-token' },
      cache: 'no-store',
    })
  })

  it.each([undefined, 42])('multipart 上傳，只有指定時帶 rental_id=%s', async (rentalId) => {
    const upload = new File(['%PDF-'], '租約.pdf', { type: 'application/pdf' })
    const fetchMock = vi.fn().mockResolvedValue(respond(201, file))
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadSubsidyFile(upload, 'lease_copy', rentalId)).resolves.toEqual(file)
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: object; body: FormData },
    ]
    expect(url).toBe('/api/subsidy/files')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer tenant-token' })
    const body = init.body as FormData
    expect(body.get('doc_type')).toBe('lease_copy')
    expect(body.get('file')).toEqual(upload)
    expect(body.get('rental_id')).toBe(rentalId === undefined ? null : '42')
    expect([...body.keys()]).toEqual(
      rentalId === undefined ? ['doc_type', 'file'] : ['doc_type', 'file', 'rental_id'],
    )
  })

  it('Bearer 取得檔案原始 blob', async () => {
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchSubsidyFileBlob(file)
    expect(await result.text()).toBe('%PDF-')
    expect(result.type).toBe('application/pdf')
    expect(fetchMock).toHaveBeenCalledWith('/api/subsidy/files/12', {
      headers: { Authorization: 'Bearer tenant-token' },
      cache: 'no-store',
    })
  })

  it('Bearer DELETE，204 不讀 JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(204))
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteSubsidyFile(12)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/subsidy/files/12', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer tenant-token' },
      cache: 'no-store',
    })
  })

  it.each([401, 403])('保留 %i 狀態和 detail', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond(status, { detail: '請登入租客帳號。' })),
    )
    await expect(listSubsidyFiles()).rejects.toMatchObject({ status, message: '請登入租客帳號。' })
  })

  it('未登入回帶有 401 的 Error，不發出請求', async () => {
    auth.getAuthSession.mockReturnValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(listSubsidyFiles()).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [400, '只收 PDF、JPG、PNG 檔案。'],
    [409, '最多可存 20 份文件，請先刪除不需要的文件。'],
    [503, '檔案加密金鑰尚未設定，暫時無法存放或讀取檔案。'],
  ])('上傳 %i 中文 detail 原樣丟出', async (status, detail) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(status, { detail })))
    await expect(uploadSubsidyFile(new File(['data'], 'test.pdf'), 'other')).rejects.toThrow(detail)
  })

  it('下載 503 和刪除 404 的中文 detail 原樣丟出', async () => {
    const detail = '檔案加密金鑰尚未設定，暫時無法存放或讀取檔案。'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(respond(503, { detail }))
        .mockResolvedValueOnce(respond(404, { detail: '找不到這份文件。' })),
    )
    await expect(fetchSubsidyFileBlob(file)).rejects.toThrow(detail)
    await expect(deleteSubsidyFile(12)).rejects.toThrow('找不到這份文件。')
  })

  it('非 JSON 錯誤仍丟出 Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })))
    await expect(listSubsidyFiles()).rejects.toThrow('無法讀取或儲存文件，請稍後再試。')
  })

  it('正式環境使用 API_BASE 並移除結尾斜線', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_BASE_URL', 'https://rentmate.example/api/')
    vi.resetModules()
    const api = await import('./subsidyFileApi')
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { files: [], count: 0, limit: 20 }))
    vi.stubGlobal('fetch', fetchMock)
    await api.listSubsidyFiles()
    expect(fetchMock.mock.calls[0]![0]).toBe('https://rentmate.example/api/subsidy/files')
  })
})

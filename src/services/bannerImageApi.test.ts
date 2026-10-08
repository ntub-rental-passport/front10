import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteBannerImage, fetchBannerImages, uploadBannerImage } from './bannerImageApi'

vi.mock('@/src/composables/useAuth', () => ({
  getAuthSession: () => ({ accessToken: 'token-123' }),
}))

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchBannerImages', () => {
  it('帶管理員驗證讀取並保留 items、count 與 limit', async () => {
    const result = { items: [], count: 0, limit: 30 }
    const fetchMock = vi.fn(async () => respond(200, result))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchBannerImages()).resolves.toEqual(result)
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/banner-images', {
      headers: { Authorization: 'Bearer token-123' },
      cache: 'no-store',
    })
  })

  it('HTTP 錯誤與連線失敗都回 null', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(500)).mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchBannerImages()).resolves.toBeNull()
    await expect(fetchBannerImages()).resolves.toBeNull()
  })
})

describe('uploadBannerImage', () => {
  it('用 multipart file 上傳並保留引用、刪除狀態與尺寸', async () => {
    const file = new File(['image'], 'spring.webp', { type: 'image/webp' })
    const image = {
      name: 'spring.webp', url: '/api/content/banner-images/spring.webp', size: 5,
      uploadedAt: 1791437579, width: 2400, height: 800, usedBy: [], deletable: true,
    }
    const fetchMock = vi.fn(async () => respond(201, image))
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadBannerImage(file)).resolves.toEqual(image)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: object; body: FormData }]
    expect(url).toBe('/api/admin/banner-images')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123' })
    expect(init.body.get('file')).toEqual(file)
  })

  it('圖庫滿額的中文理由原樣丟出', async () => {
    const detail = '圖庫已滿（30 張），請先刪除未使用的圖片。'
    vi.stubGlobal('fetch', vi.fn(async () => respond(409, { detail })))
    await expect(uploadBannerImage(new File(['image'], 'spring.webp'))).rejects.toThrow(detail)
  })
})

describe('deleteBannerImage', () => {
  it('編碼檔名、帶 Bearer token，204 不解析 JSON', async () => {
    const fetchMock = vi.fn(async () => respond(204))
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteBannerImage('spring /圖.webp')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/banner-images/spring%20%2F%E5%9C%96.webp', {
      method: 'DELETE', headers: { Authorization: 'Bearer token-123' },
    })
  })

  it.each([
    [404, '找不到這張圖片。'],
    [409, '這張圖片還有 2 則輪播在用：「A」、「B」。請先替那些輪播換圖再刪除。'],
  ])('%i 的中文 detail 原樣丟出', async (status, detail) => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(status, { detail })))
    await expect(deleteBannerImage('spring.webp')).rejects.toThrow(detail)
  })

  it.each([401, 403])('%i 提示重新登入', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(status)))
    await expect(deleteBannerImage('spring.webp')).rejects.toThrow('沒有權限或登入已失效，請重新登入。')
  })

  it('沒有 detail 時使用不限定上傳的錯誤文字', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    await expect(deleteBannerImage('spring.webp')).rejects.toThrow('操作失敗（HTTP 500）。')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminRequest, publicGet } from './adminHttp'

vi.mock('@/src/composables/useAuth', () => ({
  getAuthSession: () => ({ accessToken: 'token-123' }),
}))

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('adminRequest', () => {
  it('帶 Bearer token 送出 JSON，回傳解析後的內容', async () => {
    const fetchMock = vi.fn(async () => respond(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(adminRequest('/admin/x', { method: 'PUT', body: { a: 1 } })).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: object; body: string }]
    expect(url).toBe('/api/admin/x')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"a":1}')
  })

  it('204 回 undefined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(204)))
    await expect(adminRequest('/admin/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('後端給的理由原樣丟出，畫面才能直接顯示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(400, { detail: '預警門檻需小於告急門檻。' })))
    await expect(adminRequest('/admin/x')).rejects.toThrow('預警門檻需小於告急門檻。')
  })

  it('401 一律請對方重新登入', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(401, { detail: '閒置太久，請重新登入。' })))
    await expect(adminRequest('/admin/x')).rejects.toThrow('請重新登入')
  })

  it('沒有理由時至少說出狀態碼', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    await expect(adminRequest('/admin/x')).rejects.toThrow('HTTP 500')
  })

  it('連不上伺服器時講清楚，不要冒出瀏覽器的英文錯誤', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await expect(adminRequest('/admin/x')).rejects.toThrow('連不上伺服器')
  })
})

describe('publicGet', () => {
  it('讀不到回 null，由呼叫端決定退路', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(502)))
    await expect(publicGet('/settings/public')).resolves.toBeNull()
  })

  it('後端卡住時逾時放棄，不讓換頁跟著卡住', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )
    const pending = publicGet('/settings/public', 3000)
    await vi.advanceTimersByTimeAsync(3000)
    await expect(pending).resolves.toBeNull()
  })
})

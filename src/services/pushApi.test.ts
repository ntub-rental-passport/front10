import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getPushStatus, subscribePush, unsubscribePush } from './pushApi'

const status = { supported: true, publicKey: 'AQID', subscribed: true, deviceCount: 2 }
const subscription = {
  endpoint: 'https://push.example/device',
  keys: { p256dh: 'key', auth: 'auth' },
}
const fetchMock = vi.fn()

beforeEach(() => vi.stubGlobal('fetch', fetchMock.mockReset()))
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['GET', '/status', () => getPushStatus(), undefined],
  ['POST', '/subscribe', () => subscribePush(subscription), subscription],
  [
    'DELETE',
    '/subscribe',
    () => unsubscribePush(subscription.endpoint),
    { endpoint: subscription.endpoint },
  ],
])('%s 使用 cookie 並回傳推播狀態', async (method, path, request, body) => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(status), { status: method === 'POST' ? 201 : 200 }),
  )
  await expect(request()).resolves.toEqual(status)
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/push${path}`,
    expect.objectContaining({
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  )
})

it.each([
  [() => getPushStatus(), 401, '請先登入'],
  [() => subscribePush(subscription), 503, '伺服器尚未啟用推播'],
  [() => subscribePush(subscription), 422, '訂閱欄位不合法'],
  [() => unsubscribePush(subscription.endpoint), 500, '移除訂閱失敗'],
])('保留後端 HTTP 錯誤的中文 detail', async (request, code, detail) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail }), { status: code }))
  await expect(request()).rejects.toThrow(detail)
})

it('驗證錯誤陣列保留欄位與中文原因', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: [{ loc: ['body', 'endpoint'], msg: '網址不合法' }] }), {
      status: 422,
    }),
  )
  await expect(getPushStatus()).rejects.toThrow('endpoint：網址不合法（HTTP 422）')
})

it('非 JSON 錯誤與網路失敗顯示中文', async () => {
  fetchMock.mockResolvedValueOnce(new Response('失敗', { status: 502 }))
  await expect(getPushStatus()).rejects.toThrow('推播服務暫時無法連線（HTTP 502），請稍後再試。')
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await expect(getPushStatus()).rejects.toThrow('推播服務暫時無法連線，請稍後再試。')
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePushSubscription } from './usePushSubscription'
import { getPushStatus, subscribePush, unsubscribePush } from '@/src/services/pushApi'

vi.mock('@/src/services/pushApi', () => ({
  getPushStatus: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}))
const status = { supported: true, publicKey: 'AQID', subscribed: false, deviceCount: 0 }
const payload = { endpoint: 'https://push.example/device', keys: { p256dh: 'key', auth: 'auth' } }
const subscription = {
  endpoint: payload.endpoint,
  options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
  toJSON: () => payload,
  unsubscribe: vi.fn(),
}
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() }
const registration = { pushManager }
const serviceWorker = {
  getRegistration: vi.fn(),
  register: vi.fn(),
  ready: Promise.resolve(registration),
}
const notification = { permission: 'default', requestPermission: vi.fn() }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('navigator', { serviceWorker })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('window', { PushManager: globalThis.PushManager, Notification: notification })
  notification.permission = 'default'
  notification.requestPermission.mockResolvedValue('granted')
  serviceWorker.getRegistration.mockResolvedValue(registration)
  serviceWorker.register.mockResolvedValue(registration)
  pushManager.getSubscription.mockResolvedValue(null)
  pushManager.subscribe.mockResolvedValue(subscription)
  subscription.unsubscribe.mockResolvedValue(true)
  vi.mocked(getPushStatus).mockResolvedValue({ ...status })
  vi.mocked(subscribePush).mockResolvedValue({ ...status, subscribed: true, deviceCount: 1 })
  vi.mocked(unsubscribePush).mockResolvedValue({ ...status })
})
afterEach(() => vi.unstubAllGlobals())

it('查詢尚未完成時顯示載入中', async () => {
  let resolve!: (value: typeof status) => void
  vi.mocked(getPushStatus).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const push = usePushSubscription()
  const pending = push.refresh()
  expect(push.state.value).toBe('loading')
  expect(push.statusText.value).toBe('載入中…')
  expect(push.canToggle.value).toBe(false)
  expect(push.loading.value).toBe(true)
  resolve(status)
  await pending
})

it('伺服器未啟用時顯示 unsupported-server', async () => {
  vi.mocked(getPushStatus).mockResolvedValue({ ...status, supported: false, publicKey: '' })
  const push = usePushSubscription()
  await push.refresh()
  expect(push.state.value).toBe('unsupported-server')
  expect(push.statusText.value).toBe('伺服器尚未啟用推播')
  expect(push.canToggle.value).toBe(false)
  expect(serviceWorker.getRegistration).not.toHaveBeenCalled()
})

it.each(['serviceWorker', 'PushManager', 'Notification'])(
  '缺少 %s 時顯示 unsupported-browser',
  async (feature) => {
    if (feature === 'serviceWorker') vi.stubGlobal('navigator', {})
    else
      vi.stubGlobal(
        'window',
        feature === 'PushManager'
          ? { Notification: notification }
          : { PushManager: globalThis.PushManager },
      )
    const push = usePushSubscription()
    await push.refresh()
    expect(push.state.value).toBe('unsupported-browser')
    expect(push.statusText.value).toBe('此瀏覽器不支援推播')
    expect(push.canToggle.value).toBe(false)
  },
)

it('封鎖通知時顯示 denied', async () => {
  notification.permission = 'denied'
  const push = usePushSubscription()
  await push.refresh()
  expect(push.state.value).toBe('denied')
  expect(push.statusText.value).toBe('你已封鎖本站的通知，請到瀏覽器設定開啟')
  expect(push.canToggle.value).toBe(false)
})

it('目前裝置有訂閱時顯示 on 與帳號裝置數', async () => {
  pushManager.getSubscription.mockResolvedValue(subscription)
  vi.mocked(getPushStatus).mockResolvedValue({ ...status, subscribed: true, deviceCount: 3 })
  const push = usePushSubscription()
  await push.refresh()
  expect(push.state.value).toBe('on')
  expect(push.deviceCount.value).toBe(3)
  expect(push.statusText.value).toBe('已開啟；此帳號共 3 台裝置')
  expect(push.canToggle.value).toBe(true)
})

it('其他裝置已開啟也不會讓本機顯示 on', async () => {
  vi.mocked(getPushStatus).mockResolvedValue({ ...status, subscribed: true, deviceCount: 2 })
  const push = usePushSubscription()
  await push.refresh()
  expect(push.state.value).toBe('off')
  expect(push.statusText.value).toBe('已關閉')
  expect(push.canToggle.value).toBe(true)
})

it('開啟時要求權限、註冊共用 sw 並保存訂閱', async () => {
  const push = usePushSubscription()
  await push.refresh()
  await push.enable()
  expect(notification.requestPermission).toHaveBeenCalledOnce()
  expect(serviceWorker.register).toHaveBeenCalledWith('/rentmate-sw.js')
  expect(pushManager.subscribe).toHaveBeenCalledWith({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array([1, 2, 3]),
  })
  expect(subscribePush).toHaveBeenCalledWith(payload)
  expect(push.state.value).toBe('on')
  expect(push.deviceCount.value).toBe(1)
})

it('後端保存失敗時退訂瀏覽器並保留中文錯誤', async () => {
  vi.mocked(subscribePush).mockRejectedValue(new Error('訂閱保存失敗'))
  const push = usePushSubscription()
  await push.refresh()
  await push.enable()
  expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  expect(push.state.value).toBe('off')
  expect(push.error.value).toBe('訂閱保存失敗')
  expect(push.loading.value).toBe(false)
})

it('相同金鑰沿用訂閱，金鑰改變則先退訂再重訂', async () => {
  pushManager.getSubscription.mockResolvedValue(subscription)
  const push = usePushSubscription()
  await push.refresh()
  await push.enable()
  expect(pushManager.subscribe).not.toHaveBeenCalled()
  expect(subscription.unsubscribe).not.toHaveBeenCalled()
  subscription.options.applicationServerKey = new Uint8Array([4, 5, 6]).buffer
  await push.enable()
  expect(subscription.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
    pushManager.subscribe.mock.invocationCallOrder[0]!,
  )
  subscription.options.applicationServerKey = new Uint8Array([1, 2, 3]).buffer
})

it('拒絕權限時顯示中文錯誤且不訂閱', async () => {
  notification.requestPermission.mockImplementation(async () => {
    notification.permission = 'denied'
    return 'denied'
  })
  const push = usePushSubscription()
  await push.refresh()
  await push.enable()
  expect(push.state.value).toBe('denied')
  expect(push.statusText.value).toBe('你已封鎖本站的通知，請到瀏覽器設定開啟')
  expect(push.canToggle.value).toBe(false)
  expect(push.error.value).toContain('請允許通知權限')
  expect(subscribePush).not.toHaveBeenCalled()
})

it('關閉時等待後端 DELETE 成功才退訂瀏覽器', async () => {
  pushManager.getSubscription.mockResolvedValue(subscription)
  let resolve!: (value: typeof status) => void
  vi.mocked(unsubscribePush).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const push = usePushSubscription()
  await push.refresh()
  const pending = push.disable()
  await vi.waitFor(() => expect(unsubscribePush).toHaveBeenCalledWith(payload.endpoint))
  expect(subscription.unsubscribe).not.toHaveBeenCalled()
  resolve(status)
  await pending
  expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  expect(push.state.value).toBe('off')
})

it('後端 DELETE 失敗不退訂瀏覽器', async () => {
  pushManager.getSubscription.mockResolvedValue(subscription)
  vi.mocked(unsubscribePush).mockRejectedValue(new Error('移除訂閱失敗'))
  const push = usePushSubscription()
  await push.refresh()
  await push.disable()
  expect(subscription.unsubscribe).not.toHaveBeenCalled()
  expect(push.state.value).toBe('on')
  expect(push.error.value).toBe('移除訂閱失敗')
})

it.each(['register', 'subscribe'])('瀏覽器 %s 失敗時保留關閉狀態與中文錯誤', async (step) => {
  if (step === 'register') serviceWorker.register.mockRejectedValue(new Error('SecurityError'))
  else pushManager.subscribe.mockRejectedValue(new Error('AbortError'))
  const push = usePushSubscription()
  await push.refresh()
  await push.enable()
  expect(push.state.value).toBe('off')
  expect(push.error.value).toBe('無法開啟推播，請稍後再試。')
  expect(subscribePush).not.toHaveBeenCalled()
})

it.each(['false', 'reject'])(
  '後端已刪除但瀏覽器退訂回傳 %s 時顯示已關閉與清理失敗說明',
  async (result) => {
    pushManager.getSubscription.mockResolvedValue(subscription)
    if (result === 'false') subscription.unsubscribe.mockResolvedValue(false)
    else subscription.unsubscribe.mockRejectedValue(new TypeError('Unsubscribe failed'))
    const push = usePushSubscription()
    await push.refresh()
    await push.disable()
    expect(push.state.value).toBe('off')
    expect(push.statusText.value).toBe('已關閉')
    expect(push.deviceCount.value).toBe(0)
    expect(push.error.value).toBe('已停止推播，但瀏覽器端的訂閱未能清除。')
    expect(push.canToggle.value).toBe(true)
  },
)

it('查詢失敗顯示錯誤並禁止在未知伺服器狀態下訂閱', async () => {
  vi.mocked(getPushStatus).mockRejectedValue(new Error('請先登入'))
  const push = usePushSubscription()
  await push.refresh()
  await push.enable()
  expect(push.error.value).toBe('請先登入')
  expect(push.canToggle.value).toBe(false)
  expect(subscribePush).not.toHaveBeenCalled()
})

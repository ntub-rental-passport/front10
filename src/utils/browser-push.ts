import { base64UrlToBytes, isSameKey } from '@/src/utils/push-key'

export function supportsBrowserPush(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// 清運提醒與帳號推播共用權限、全站 sw 與 VAPID 換鑰流程。
export async function subscribeBrowserPush(
  publicKey: string,
  messages = {
    unsupported: '此瀏覽器不支援推播',
    permission: '請允許通知權限，才能開啟推播。',
  },
): Promise<PushSubscription> {
  if (!supportsBrowserPush()) throw new Error(messages.unsupported)
  if ((await Notification.requestPermission()) !== 'granted') throw new Error(messages.permission)
  const registration = await navigator.serviceWorker.register('/rentmate-sw.js')
  await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const bytes = base64UrlToBytes(publicKey)
  if (existing) {
    if (isSameKey(existing.options.applicationServerKey, bytes)) return existing
    // 換 VAPID 金鑰後，舊訂閱無法接收新金鑰簽署的推播，必須重新訂閱。
    await existing.unsubscribe()
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
}

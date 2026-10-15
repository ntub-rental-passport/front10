import { computed, ref, shallowRef } from 'vue'
import {
  getPushStatus,
  subscribePush,
  unsubscribePush,
  type PushStatus,
} from '@/src/services/pushApi'
import { subscribeBrowserPush, supportsBrowserPush } from '@/src/utils/browser-push'

export type PushSubscriptionState =
  | 'loading'
  | 'unsupported-server'
  | 'unsupported-browser'
  | 'denied'
  | 'on'
  | 'off'

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && /[\u3400-\u9fff]/.test(cause.message) ? cause.message : fallback
}

export function usePushSubscription() {
  const state = ref<PushSubscriptionState>('loading')
  const loading = ref(false)
  const error = ref('')
  const status = ref<PushStatus | null>(null)
  const subscription = shallowRef<PushSubscription | null>(null)
  const deviceCount = computed(() => status.value?.deviceCount ?? 0)
  const canToggle = computed(
    () => !loading.value && !!status.value?.supported && ['on', 'off'].includes(state.value),
  )
  const statusText = computed(() => {
    switch (state.value) {
      case 'loading':
        return '載入中…'
      case 'unsupported-server':
        return '伺服器尚未啟用推播'
      case 'unsupported-browser':
        return '此瀏覽器不支援推播'
      case 'denied':
        return '你已封鎖本站的通知，請到瀏覽器設定開啟'
      case 'on':
        return `已開啟；此帳號共 ${deviceCount.value} 台裝置`
      default:
        return '已關閉'
    }
  })

  function updateState() {
    if (status.value?.supported === false) state.value = 'unsupported-server'
    else if (!supportsBrowserPush()) state.value = 'unsupported-browser'
    else if (Notification.permission === 'denied') state.value = 'denied'
    else state.value = subscription.value ? 'on' : 'off'
  }

  async function readSubscription() {
    if (!supportsBrowserPush()) return null
    const registration = await navigator.serviceWorker.getRegistration('/')
    return registration ? registration.pushManager.getSubscription() : null
  }

  async function refresh() {
    if (loading.value) return
    loading.value = true
    state.value = 'loading'
    error.value = ''
    try {
      status.value = await getPushStatus()
      subscription.value = status.value.supported ? await readSubscription() : null
    } catch (cause) {
      error.value = errorText(cause, '無法讀取推播設定，請稍後再試。')
    } finally {
      updateState()
      loading.value = false
    }
  }

  async function enable() {
    if (!canToggle.value || !status.value) return
    loading.value = true
    error.value = ''
    let pending: PushSubscription | null = null
    try {
      pending = await subscribeBrowserPush(status.value.publicKey)
      subscription.value = pending
      status.value = await subscribePush(pending.toJSON())
    } catch (cause) {
      error.value = errorText(cause, '無法開啟推播，請稍後再試。')
      if (pending) {
        let rolledBack = false
        try {
          rolledBack = await pending.unsubscribe()
        } catch {
          // 退訂也可能失敗，下方保留實際訂閱狀態並提供重試方式。
        }
        if (rolledBack) subscription.value = null
        else error.value += '；瀏覽器訂閱未能退回，請關閉推播後重試。'
      } else {
        // 換鑰流程可能已退訂舊金鑰，重新讀取以免仍顯示開啟。
        try {
          subscription.value = await readSubscription()
        } catch {
          subscription.value = null
        }
      }
    } finally {
      updateState()
      loading.value = false
    }
  }

  async function disable() {
    if (!canToggle.value) return
    loading.value = true
    error.value = ''
    try {
      subscription.value = await readSubscription()
      if (subscription.value) {
        // 先刪後端，再退訂瀏覽器，避免留下永遠推不到的死訂閱。
        const current = subscription.value
        status.value = await unsubscribePush(current.endpoint)
        subscription.value = null
        let cleaned = false
        try {
          cleaned = await current.unsubscribe()
        } catch {
          // 後端已停止推播，瀏覽器清理失敗不應恢復為開啟。
        }
        if (!cleaned) error.value = '已停止推播，但瀏覽器端的訂閱未能清除。'
      }
    } catch (cause) {
      error.value = errorText(cause, '無法關閉推播，請稍後再試。')
    } finally {
      updateState()
      loading.value = false
    }
  }

  return { state, loading, error, deviceCount, statusText, canToggle, refresh, enable, disable }
}

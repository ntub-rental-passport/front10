const BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export interface PushStatus {
  supported: boolean
  publicKey: string
  subscribed: boolean
  deviceCount: number
}

async function pushRequest(path: string, method: string, payload?: unknown): Promise<PushStatus> {
  let response: Response
  try {
    response = await fetch(`${BASE}/push${path}`, {
      method,
      credentials: 'include',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    })
  } catch {
    throw new Error('推播服務暫時無法連線，請稍後再試。')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (typeof body?.detail === 'string') throw new Error(body.detail)
    if (Array.isArray(body?.detail)) {
      const messages = body.detail.flatMap((error: unknown) => {
        if (!error || typeof error !== 'object') return []
        const { loc, msg } = error as { loc?: unknown; msg?: unknown }
        if (!Array.isArray(loc) || !loc.length || typeof msg !== 'string') return []
        return [`${loc[loc.length - 1]}：${msg}`]
      })
      if (messages.length) throw new Error(`${messages.join('；')}（HTTP ${response.status}）`)
    }
    throw new Error(`推播服務暫時無法連線（HTTP ${response.status}），請稍後再試。`)
  }
  return body as PushStatus
}

export const getPushStatus = () => pushRequest('/status', 'GET')
export const subscribePush = (subscription: ReturnType<PushSubscription['toJSON']>) =>
  pushRequest('/subscribe', 'POST', subscription)
export const unsubscribePush = (endpoint: string) =>
  pushRequest('/subscribe', 'DELETE', { endpoint })

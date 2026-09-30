/**
 * 後台 API 共用的請求寫法。
 *
 * - 管理員的 API 只收 Bearer token（理由見 backend/auth/security.py 的 get_current_admin）。
 * - 後端用 400／404 的 detail 說明為什麼不行（例如「預警門檻需小於告急門檻」），
 *   那是寫給管理員看的，原樣帶到畫面上；吞掉換成「操作失敗」等於要他自己猜。
 * - 401／403 統一講「請重新登入」；閒置登出由 useAdminIdleLogout 帶回登入頁。
 */
import { getAuthSession } from '@/src/composables/useAuth'

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL

async function detailOf(response: Response): Promise<string> {
  try {
    const detail = ((await response.json()) as { detail?: unknown }).detail
    return typeof detail === 'string' ? detail : ''
  } catch {
    return ''
  }
}

async function failureOf(response: Response): Promise<Error> {
  if (response.status === 401 || response.status === 403) {
    return new Error('沒有權限或登入已失效，請重新登入。')
  }
  return new Error((await detailOf(response)) || `操作失敗（HTTP ${response.status}）。`)
}

/** 失敗一律丟出 Error，message 可以直接顯示在畫面上。204 回 undefined。 */
export async function adminRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入狀態已失效，請重新登入後再試。')

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    })
  } catch {
    throw new Error('連不上伺服器，請確認網路後再試一次。')
  }
  if (!response.ok) throw await failureOf(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * 不需登入的讀取。讀不到（後端掛了、逾時）回 null，由呼叫端決定退路。
 * 有逾時：公開設定擋在每次換頁前面，後端卡住不能讓整個網站跟著卡住。
 */
export async function publicGet<T>(path: string, timeoutMs = 5000): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

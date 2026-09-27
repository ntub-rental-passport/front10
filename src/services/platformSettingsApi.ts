import { getAuthSession } from '@/src/composables/useAuth'

/**
 * 後端實際執行的平台設定（backend/platform_settings.py）。
 *
 * 後台「系統設定」頁的其他欄位存在瀏覽器裡、只影響後台畫面；這幾項不一樣，
 * 存在後端、所有管理員看同一份，登入與註冊真的照著做。
 */

/** 讀不到後端時的退路，要跟後端的預設值一致 */
export const DEFAULT_PASSWORD_MIN_LENGTH = 8
export const DEFAULT_PASSWORD_MAX_LENGTH = 128

export interface PublicSettings {
  passwordMinLength: number
  passwordMaxLength: number
}

export interface AdminPlatformSettings {
  passwordMinLength: number
  passwordMinLengthRange: [number, number]
  passwordMaxLength: number
  sessionMinutes: number
  sessionMinuteOptions: number[]
  /** 管理員的登入期限，固定、不受設定影響 */
  adminSessionMinutes: number
  /** 管理員閒置多久自動登出（伺服器判斷） */
  adminIdleMinutes: number
  defaults: { passwordMinLength: number; sessionMinutes: number }
}

export interface PlatformSettingsChanges {
  passwordMinLength?: number
  sessionMinutes?: number
}

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL

function authHeaders(): Record<string, string> | null {
  const token = getAuthSession()?.accessToken
  return token ? { Authorization: `Bearer ${token}` } : null
}

/** 註冊頁用。不需登入；讀不到回 null，由呼叫端用預設值（後端送出時還會再檢查一次） */
export async function fetchPublicSettings(): Promise<PublicSettings | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/settings/public`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as PublicSettings
  } catch {
    return null
  }
}

export async function fetchAdminPlatformSettings(): Promise<AdminPlatformSettings | null> {
  const headers = authHeaders()
  if (!headers) return null
  try {
    const response = await fetch(`${API_BASE_URL}/admin/settings`, { headers, cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as AdminPlatformSettings
  } catch {
    return null
  }
}

/** 失敗時丟出後端給的理由（例如「密碼最短長度必須介於 8 到 64 個字元」），畫面原樣顯示 */
export async function updateAdminPlatformSettings(
  changes: PlatformSettingsChanges,
): Promise<AdminPlatformSettings> {
  const headers = authHeaders()
  if (!headers) throw new Error('尚未登入或登入已過期，請重新登入。')

  const response = await fetch(`${API_BASE_URL}/admin/settings`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  const body = (await response.json().catch(() => null)) as
    | (AdminPlatformSettings & { detail?: string })
    | null
  if (!response.ok) throw new Error(body?.detail || '儲存失敗，請稍後再試。')
  if (!body) throw new Error('後端沒有回傳資料。')
  return body
}

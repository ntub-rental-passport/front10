import { getAuthSession } from '@/src/composables/useAuth'

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL

export type ActivityReport = 'ok' | 'logged-out' | 'unreachable'

/**
 * 回報「管理員真的在操作」，延後伺服器端的閒置登出（backend/routers/auth.py）。
 *
 * 401 代表伺服器已經不認這次登入（閒置太久、在別處登出、改版前的舊憑證），
 * 呼叫端要帶使用者回登入頁；連不上則不算登出 —— 後端暫時掛掉不該把人踢出去。
 */
export async function reportAdminActivity(): Promise<ActivityReport> {
  const token = getAuthSession()?.accessToken
  if (!token) return 'logged-out'
  try {
    const response = await fetch(`${API_BASE_URL}/auth/admin/activity`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (response.status === 401) return 'logged-out'
    return response.ok ? 'ok' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

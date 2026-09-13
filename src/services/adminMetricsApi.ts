import { getAuthSession } from '@/src/composables/useAuth'
import type { DbPoolSnapshot, RequestSnapshot } from '@/src/utils/admin-monitoring'

export interface AdminMetricsResponse {
  dbPool: DbPoolSnapshot
  requests: RequestSnapshot
}

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL

/**
 * 讀取後台監控數據。僅限管理員，後端會驗 Bearer token。
 *
 * 讀不到就回 null（後端掛了、token 過期、權限被撤銷），
 * 由呼叫端決定畫面怎麼呈現 —— 這裡不編數字，也不吞掉錯誤狀態。
 */
export async function fetchAdminMetrics(signal?: AbortSignal): Promise<AdminMetricsResponse | null> {
  const token = getAuthSession()?.accessToken
  if (!token) return null

  try {
    const response = await fetch(`${API_BASE_URL}/admin/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    return (await response.json()) as AdminMetricsResponse
  } catch {
    return null
  }
}

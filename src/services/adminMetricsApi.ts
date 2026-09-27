import { getAuthSession } from '@/src/composables/useAuth'
import type { DbPoolSnapshot, RequestSnapshot, ServiceState } from '@/src/utils/admin-monitoring'
import type {
  ConfigItem,
  MonitorEvent,
  MonitorSummary,
  QueuesSnapshot,
} from '@/src/utils/admin-monitoring-report'

export interface AdminMetricsResponse {
  dbPool: DbPoolSnapshot
  requests: RequestSnapshot
  /*
   * 以下四個是後端背景迴圈的結果（backend/monitoring_service.py）。
   * 標成選填：舊版後端沒有這些欄位，呼叫端要當成「讀不到」，不能當成「沒有異常」。
   */
  services?: ServiceState[]
  queues?: QueuesSnapshot
  config?: ConfigItem[]
  summary?: MonitorSummary
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

/**
 * 監控事件紀錄（最近 30 天，新到舊）。僅限管理員。
 *
 * 讀不到回 null，跟「讀到了、一筆都沒有」（空陣列）分開 —— 後者畫面要說
 * 「這段期間沒有異常」，前者不能這樣說。
 */
export async function fetchMonitorEvents(signal?: AbortSignal): Promise<MonitorEvent[] | null> {
  const token = getAuthSession()?.accessToken
  if (!token) return null

  try {
    const response = await fetch(`${API_BASE_URL}/admin/monitoring/events?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return Array.isArray(body) ? (body as MonitorEvent[]) : null
  } catch {
    return null
  }
}

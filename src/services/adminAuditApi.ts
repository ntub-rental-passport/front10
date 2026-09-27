import { getAuthSession } from '@/src/composables/useAuth'

/** 後端記的稽核紀錄（backend/audit_service.py）。 */
export interface ServerAuditEvent {
  id: number
  at: string
  actor: string
  action: string
  target: string
  detail: string
  /** 穩定的對象識別，例如 `user:12`、`scheduled:<id>` */
  subject: string | null
  ip: string | null
}

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL

/**
 * 讀後端的稽核紀錄（新到舊）。僅限管理員。
 *
 * 讀不到回 null，跟「讀到了、一筆都沒有」（空陣列）分開 —— 前者畫面要說
 * 「後端紀錄讀取失敗」，不能假裝沒有紀錄。
 */
export async function fetchAdminAudit(
  options: { subject?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<ServerAuditEvent[] | null> {
  const token = getAuthSession()?.accessToken
  if (!token) return null

  const query = new URLSearchParams({ limit: String(options.limit ?? 2000) })
  if (options.subject) query.set('subject', options.subject)

  try {
    const response = await fetch(`${API_BASE_URL}/admin/audit?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: options.signal,
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return Array.isArray(body) ? (body as ServerAuditEvent[]) : null
  } catch {
    return null
  }
}

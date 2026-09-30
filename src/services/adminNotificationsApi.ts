/**
 * 管理員通知中心的 API（backend/routers/admin_notifications_api.py）。
 * 已讀狀態是每位管理員自己的，後端看 token 判斷是誰。
 */
import type { AdminNotification } from '@/src/mocks/admin/admin-notifications'
import { adminRequest } from './adminHttp'

const BASE = '/admin/notification-center'

/** 讀不到回 null：畫面要分得出「讀不到」和「真的沒有通知」 */
export async function fetchAdminNotifications(): Promise<AdminNotification[] | null> {
  try {
    return await adminRequest<AdminNotification[]>(BASE)
  } catch {
    return null
  }
}

/** 失敗時丟出後端給的理由，畫面原樣顯示 */
export function sendAdminNote(title: string, body: string): Promise<AdminNotification> {
  return adminRequest(`${BASE}/notes`, { method: 'POST', body: { title, body } })
}

export function markAdminNotificationRead(id: string): Promise<void> {
  return adminRequest(`${BASE}/${encodeURIComponent(id)}/read`, { method: 'POST' })
}

export function markAdminNotificationUnread(id: string): Promise<void> {
  return adminRequest(`${BASE}/${encodeURIComponent(id)}/unread`, { method: 'POST' })
}

export function markAllAdminNotificationsRead(): Promise<void> {
  return adminRequest(`${BASE}/read-all`, { method: 'POST' })
}

/**
 * 站內通知的 API（backend/routers/inbox_api.py）。
 *
 * - 後台（Bearer）：立即發送、發送紀錄。
 * - 收件匣（cookie，任何登入的人）：自己的站內通知，以及公告的已讀、關閉狀態。
 *   以前這些都存在瀏覽器裡，換一台裝置就看不到、又變成未讀。
 */
import type {
  NotifCategory,
  NotifChannel,
  NotifSourceType,
  UserNotification,
} from '@/src/mocks/admin/notifications'
import { adminRequest, API_BASE_URL } from './adminHttp'

export type NotifRecipient =
  | { kind: 'role'; role: 'user' | 'landlord' | 'all' }
  | { kind: 'users'; emails: string[] }

export interface SendNotificationInput {
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
  recipient: NotifRecipient
  /** 收件人條件（全部使用者／全部租客／指定使用者），發送紀錄的批次列要顯示 */
  recipientLabel: string
  /** 這次發送的來源（模板名稱、一次性撰寫或測試發送） */
  sourceLabel: string
  actionUrl?: string
  actionLabel?: string
}

/** 立即發送。站內當下送到，Email 由後端在背景寄；失敗時丟出後端給的理由 */
export function sendAdminNotification(
  input: SendNotificationInput,
): Promise<{ batchId: string; recipientCount: number }> {
  return adminRequest('/admin/notifications/send', { method: 'POST', body: input })
}

/** 發送紀錄：每位收件人一筆，前端依 batchId 分組。讀不到回 null */
export async function fetchAdminMessages(): Promise<UserNotification[] | null> {
  try {
    return await adminRequest<UserNotification[]>('/admin/notifications/messages')
  } catch {
    return null
  }
}

/* -------------------- 收件匣 -------------------- */

export interface InboxMessage {
  id: string
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
  sourceType: NotifSourceType
  createdAt: string
  read: boolean
  actionUrl?: string
  actionLabel?: string
}

export interface InboxState {
  messages: InboxMessage[]
  readAnnouncementIds: string[]
  /** 首頁公告橫幅按過關閉的「id:updatedAt」 */
  dismissedAnnouncementKeys: string[]
}

/** 收件匣用登入的 cookie 驗證（跟 /api/auth/me 一樣），同網域的請求會自動帶上 */
async function userRequest(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response
}

/** 讀不到（沒登入、後端掛了）回 null，畫面沿用手上的資料 */
export async function fetchMyInbox(): Promise<InboxState | null> {
  try {
    return (await (await userRequest('/notifications')).json()) as InboxState
  } catch {
    return null
  }
}

export async function markInboxMessageRead(id: string): Promise<void> {
  await userRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
}

export async function markInboxAllRead(announcementIds: string[]): Promise<void> {
  await userRequest('/notifications/read-all', { method: 'POST', body: { announcementIds } })
}

export async function markAnnouncementReadOnServer(id: string): Promise<void> {
  await userRequest(`/notifications/announcements/${encodeURIComponent(id)}/read`, { method: 'POST' })
}

export async function dismissAnnouncementOnServer(key: string): Promise<void> {
  await userRequest('/notifications/announcements/dismiss', { method: 'POST', body: { key } })
}

export type AdminNotifSource = 'alert' | 'user-message' | 'admin-note'

export const adminNotifSourceLabels: Record<AdminNotifSource, string> = {
  alert: '系統告警',
  'user-message': '使用者訊息',
  'admin-note': '內部備註',
}

export interface AdminNotification {
  id: string
  source: AdminNotifSource
  title: string
  body: string
  actionUrl?: string
  actionLabel?: string
  senderName?: string
  createdAt: string
  read: boolean
}

import { daysAgo } from './helpers'

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

export function seedAdminNotifications(): AdminNotification[] {
  return [
    {
      id: 'an-1',
      source: 'alert',
      title: 'OpenAI 額度預估 3 天後用盡',
      body: 'OpenAI GPT-4o 的 API 額度目前使用率已達 87%，按目前消耗速率預計 3 天內用盡，請儘速調整額度上限或限制使用量。',
      actionUrl: '/admin/monitoring',
      actionLabel: '查看監控',
      createdAt: daysAgo(0, 9),
      read: false,
    },
    {
      id: 'an-2',
      source: 'user-message',
      title: '租客反映帳單金額異常',
      body: '租客 王小艾（amy.wang@example.com）來訊表示本月帳單金額與合約約定不符，要求管理員協助確認。',
      actionUrl: '/admin/users',
      actionLabel: '查看使用者',
      senderName: '王小艾',
      createdAt: daysAgo(1, 14),
      read: false,
    },
    {
      id: 'an-3',
      source: 'admin-note',
      title: '下週押金對帳需特別注意',
      body: '本月有三位房東提出押金爭議，下週對帳時請特別確認這三筆資料。相關工單編號：MT-0042、MT-0051、MT-0063。',
      senderName: '系統管理員',
      createdAt: daysAgo(2, 10),
      read: false,
    },
    {
      id: 'an-4',
      source: 'alert',
      title: '報修工單逾期未處理',
      body: '目前有 2 張報修工單已逾期未回應，系統已自動標記為「逾期」並加入待處理佇列。',
      actionUrl: '/admin/maintenance-tickets',
      actionLabel: '查看工單',
      createdAt: daysAgo(3, 8),
      read: true,
    },
    {
      id: 'an-5',
      source: 'user-message',
      title: '房東申請提前解約',
      body: '房東 張大明（ming.zhang@example.com）提交提前解約申請，涉及租客 3 名，需管理員審核押金退還流程。',
      actionUrl: '/admin/users',
      actionLabel: '查看使用者',
      senderName: '張大明',
      createdAt: daysAgo(5, 11),
      read: true,
    },
    {
      id: 'an-6',
      source: 'admin-note',
      title: '補貼審核標準更新',
      body: '自下個月起，租金補貼審核將增加收入證明文件要求，請各位管理員注意通知尚未補件的申請者。',
      senderName: '系統管理員',
      createdAt: daysAgo(7, 15),
      read: true,
    },
  ]
}

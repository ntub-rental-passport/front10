import { daysAgo } from './helpers'

export type NotifChannel = 'inapp' | 'email' | 'push'
export type NotifCategory = '系統' | '租約' | '補貼' | '帳務'
export type NotifSourceType = 'system' | 'landlord' | 'admin' | 'roommate'

export const notifSourceLabels: Record<NotifSourceType, string> = {
  system: '系統',
  landlord: '房東',
  admin: '管理員',
  roommate: '室友',
}

export interface NotifTemplate {
  id: string
  name: string
  category: NotifCategory
  channels: NotifChannel[]
  title: string
  body: string
  enabled: boolean
  updatedAt: string
}

// Email／推播後端還沒接，實際上沒有真的寄出去，所以一律是 pending；
// 只有實際啟用的管道才會有條目，沒啟用的管道不需要狀態。
export type NotifDeliveryStatus = 'sent' | 'pending' | 'failed'

export interface UserNotification {
  id: string
  userEmail: string
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
  deliveryStatus: Partial<Record<NotifChannel, NotifDeliveryStatus>>
  /** 同一次發送共用，發送紀錄以此聯合成批次 */
  batchId: string
  /** 當初挑選的收件人條件（全部使用者／全部租客／指定使用者），純顯示用 */
  recipientLabel: string
  /** 這次發送的來源：套用模板時存模板名稱，自由撰寫時存「一次性撰寫」，只在批次詳情頁顯示 */
  sourceLabel: string
  /** 通知來源類型，用於通知中心的來源 badge */
  sourceType?: NotifSourceType
  /** 可選的操作連結，通知中心顯示為按鈕 */
  actionUrl?: string
  /** 操作按鈕文字，搭配 actionUrl 使用 */
  actionLabel?: string
  createdAt: string
  read: boolean
}

export function seedNotifTemplates(): NotifTemplate[] {
  return [
    {
      id: 'nt-1',
      name: '租約到期提醒',
      category: '租約',
      channels: ['inapp', 'email'],
      title: '您的租約將於 {{到期日}} 到期',
      body: '{{姓名}} 您好，您位於 {{地址}} 的租約即將於 {{到期日}} 到期，請儘早與房東確認續約意願。',
      enabled: true,
      updatedAt: daysAgo(3),
    },
    {
      id: 'nt-2',
      name: '補貼審核通過',
      category: '補貼',
      channels: ['inapp', 'push'],
      title: '租金補貼審核通過',
      body: '{{姓名}} 您好，您申請的租金補貼已審核通過，每月核定金額為 {{金額}} 元，將於 {{撥款日}} 起撥款。',
      enabled: true,
      updatedAt: daysAgo(7),
    },
    {
      id: 'nt-3',
      name: '帳單待繳提醒',
      category: '帳務',
      channels: ['inapp', 'email', 'push'],
      title: '本期帳單 {{金額}} 元待繳',
      body: '您的本期帳單金額為 {{金額}} 元，應繳日為 {{應繳日}}，逾期將產生滯納金。',
      enabled: true,
      updatedAt: daysAgo(1),
    },
    {
      id: 'nt-4',
      name: '系統維護預告',
      category: '系統',
      channels: ['inapp'],
      title: '系統維護預告',
      body: '本平台將於 {{維護時間}} 進行系統維護，屆時暫停服務，造成不便敬請見諒。',
      enabled: true,
      updatedAt: daysAgo(5),
    },
    {
      id: 'nt-5',
      name: '合約分析完成',
      category: '系統',
      channels: ['inapp'],
      title: '合約分析完成',
      body: '您上傳的「{{檔名}}」已完成 AI 分析，可至合約專區查看結果。',
      enabled: false,
      updatedAt: daysAgo(20),
    },
  ]
}

export function seedUserNotifications(): UserNotification[] {
  return [
    {
      id: 'nm-1',
      batchId: 'nb-1',
      recipientLabel: '指定使用者',
      sourceLabel: '帳單待繳提醒',
      userEmail: 'amy.wang@example.com',
      title: '本期帳單 12,400 元待繳',
      body: '您的本期帳單金額為 12,400 元，應繳日為 2026/08/10，逾期將產生滯納金。',
      category: '帳務',
      channels: ['inapp', 'email', 'push'],
      deliveryStatus: { inapp: 'sent', email: 'pending', push: 'pending' },
      sourceType: 'landlord',
      actionUrl: '/app/billing',
      actionLabel: '查看帳單',
      createdAt: daysAgo(1),
      read: false,
    },
    {
      id: 'nm-5',
      batchId: 'nb-5',
      recipientLabel: '指定使用者',
      sourceLabel: '',
      userEmail: 'amy.wang@example.com',
      title: '報修工單已受理',
      body: '您提報的「廚房水龍頭漏水」工單已受理，房東預計於三個工作天內安排維修。',
      category: '租約',
      channels: ['inapp'],
      deliveryStatus: { inapp: 'sent' },
      sourceType: 'landlord',
      actionUrl: '/app/maintenance',
      actionLabel: '查看工單',
      createdAt: daysAgo(2),
      read: false,
    },
    {
      id: 'nm-6',
      batchId: 'nb-6',
      recipientLabel: '指定使用者',
      sourceLabel: '',
      userEmail: 'amy.wang@example.com',
      title: '請補傳租賃合約影本',
      body: '您的補貼申請尚缺租賃合約影本，請於 7 日內上傳，逾期將暫停審核。',
      category: '補貼',
      channels: ['inapp', 'email'],
      deliveryStatus: { inapp: 'sent', email: 'pending' },
      sourceType: 'admin',
      actionUrl: '/app/subsidy',
      actionLabel: '前往補件',
      createdAt: daysAgo(3),
      read: false,
    },
    {
      id: 'nm-2',
      batchId: 'nb-2',
      recipientLabel: '指定使用者',
      sourceLabel: '補貼審核通過',
      userEmail: 'amy.wang@example.com',
      title: '租金補貼審核通過',
      body: '小艾 您好，您申請的租金補貼已審核通過，每月核定金額為 3,200 元，將於 2026/08/15 起撥款。',
      category: '補貼',
      channels: ['inapp', 'push'],
      deliveryStatus: { inapp: 'sent', push: 'pending' },
      sourceType: 'admin',
      createdAt: daysAgo(4),
      read: false,
    },
    {
      id: 'nm-7',
      batchId: 'nb-7',
      recipientLabel: '指定使用者',
      sourceLabel: '',
      userEmail: 'amy.wang@example.com',
      title: '室友已繳納本月公共費用',
      body: '您的室友 林小美 已繳納本月公共電費分攤 $680，目前所有室友均已繳清。',
      category: '帳務',
      channels: ['inapp'],
      deliveryStatus: { inapp: 'sent' },
      sourceType: 'roommate',
      createdAt: daysAgo(5),
      read: true,
    },
    {
      id: 'nm-3',
      batchId: 'nb-3',
      recipientLabel: '指定使用者',
      sourceLabel: '租約到期提醒',
      userEmail: 'amy.wang@example.com',
      title: '您的租約將於 2026/12/31 到期',
      body: '小艾 您好，您位於 台北市中正區杭州南路一段 88 號 6 樓 的租約即將於 2026/12/31 到期，請儘早與房東確認續約意願。',
      category: '租約',
      channels: ['inapp', 'email'],
      deliveryStatus: { inapp: 'sent', email: 'pending' },
      sourceType: 'landlord',
      createdAt: daysAgo(12),
      read: true,
    },
    {
      id: 'nm-8',
      batchId: 'nb-8',
      recipientLabel: '指定使用者',
      sourceLabel: '',
      userEmail: 'amy.wang@example.com',
      title: '新室友入住通知',
      body: '您的房間（台北市中正區杭州南路一段 88 號 6 樓）將有新室友 陳大明 於 9/1 入住，請多多照顧。',
      category: '租約',
      channels: ['inapp'],
      deliveryStatus: { inapp: 'sent' },
      sourceType: 'roommate',
      createdAt: daysAgo(15),
      read: true,
    },
    {
      id: 'nm-4',
      batchId: 'nb-4',
      recipientLabel: '指定使用者',
      sourceLabel: '合約分析完成',
      userEmail: 'amy.wang@example.com',
      title: '合約分析完成',
      body: '您上傳的「租賃契約_中正區.pdf」已完成 AI 分析，可至合約專區查看結果。',
      category: '系統',
      channels: ['inapp'],
      deliveryStatus: { inapp: 'sent' },
      sourceType: 'system',
      actionUrl: '/app/contracts',
      actionLabel: '查看結果',
      createdAt: daysAgo(25),
      read: true,
    },
  ]
}

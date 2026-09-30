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
  /**
   * 這個模板預設的操作按鈕。套用模板時帶進編輯器，送出前還可以改。
   *
   * 存在模板上是因為「租約到期提醒」的按鈕永遠是「查看合約」——
   * 每次發送重打一次沒有意義，而且遲早會有人打錯。
   * 可選欄位，舊資料是 undefined，不需要 migration。
   */
  actionUrl?: string
  actionLabel?: string
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

/**
 * 通知發送的服務層。後端目前沒有真的寄送 Email／推播的能力，這裡先用
 * localStorage 版本模擬「寫進使用者的收件匣」——效果等同於 sendFromTemplate
 * 原本直接塞資料的那段邏輯，只是搬到這裡集中管理。
 *
 * 後端接上後，這個檔案內部只需要換成呼叫後端的 fetch（可以參考 authApi.ts
 * 的寫法），export 出去的函式簽章不用變，呼叫端（useAdminNotifications 等）
 * 完全不用跟著改。
 */
import { createAdminCollection, newId } from '@/src/composables/admin/useAdminStore'
import { computeDeliveryStatus, migrateUserNotifications } from '@/src/utils/notif-delivery'
import { migrateNotifBatches } from '@/src/utils/notif-batch'
import { migrateNotifSourceLabel, migrateNotifSourceType } from '@/src/utils/notif-source'
import {
  seedUserNotifications,
  type NotifCategory,
  type NotifChannel,
  type NotifDeliveryStatus,
  type NotifSourceType,
  type UserNotification,
} from '@/src/mocks/admin/notifications'

function migrateMessages(list: UserNotification[]): UserNotification[] {
  return migrateNotifSourceType(
    migrateNotifSourceLabel(migrateNotifBatches(migrateUserNotifications(list))),
  )
}

export const notifMessagesCollection = createAdminCollection<UserNotification[]>(
  'notif-messages',
  seedUserNotifications,
  migrateMessages,
)

export interface SendNotificationPayload {
  emails: string[]
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
  /** 收件人條件（全部使用者／全部租客／指定使用者），發送紀錄的批次列要顯示 */
  recipientLabel: string
  /** 這次發送的來源（模板名稱或「一次性撰寫」），只在批次詳情頁顯示 */
  sourceLabel: string
  sourceType?: NotifSourceType
  actionUrl?: string
  actionLabel?: string
}

export interface SendResult {
  successCount: number
  channelStatus: Partial<Record<NotifChannel, NotifDeliveryStatus>>
}

export async function sendNotification(payload: SendNotificationPayload): Promise<SendResult> {
  const {
    emails, title, body, category, channels,
    recipientLabel, sourceLabel,
    sourceType = 'admin', actionUrl, actionLabel,
  } = payload
  const deliveryStatus = computeDeliveryStatus(channels)
  const createdAt = new Date().toISOString()
  const batchId = newId('nb')

  for (const email of emails) {
    notifMessagesCollection.value.unshift({
      id: newId('nm'),
      batchId,
      recipientLabel,
      sourceLabel,
      sourceType,
      actionUrl,
      actionLabel,
      userEmail: email,
      title,
      body,
      category,
      channels: [...channels],
      deliveryStatus,
      createdAt,
      read: false,
    })
  }

  return { successCount: emails.length, channelStatus: deliveryStatus }
}

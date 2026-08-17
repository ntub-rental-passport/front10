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
import {
  seedUserNotifications,
  type NotifCategory,
  type NotifChannel,
  type NotifDeliveryStatus,
  type UserNotification,
} from '@/src/mocks/admin/notifications'

export const notifMessagesCollection = createAdminCollection<UserNotification[]>(
  'notif-messages',
  seedUserNotifications,
  migrateUserNotifications,
)

export interface SendNotificationPayload {
  emails: string[]
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
}

export interface SendResult {
  successCount: number
  channelStatus: Partial<Record<NotifChannel, NotifDeliveryStatus>>
}

export async function sendNotification(payload: SendNotificationPayload): Promise<SendResult> {
  const { emails, title, body, category, channels } = payload
  const deliveryStatus = computeDeliveryStatus(channels)
  const createdAt = new Date().toISOString()

  for (const email of emails) {
    notifMessagesCollection.value.unshift({
      id: newId('nm'),
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

import type { NotifChannel, NotifDeliveryStatus } from '@/src/mocks/admin/notifications'

/**
 * 站內通知寫進本機資料就等於送達，所以 inapp 一律 sent；
 * Email／推播目前沒有真的後端可以寄，一律標記 pending，
 * 不能謊報已送出，但也保留管道本身讓功能看起來完整。
 * 只為實際啟用的管道產生條目，沒開的管道不必記狀態。
 */
export function computeDeliveryStatus(
  channels: NotifChannel[],
): Partial<Record<NotifChannel, NotifDeliveryStatus>> {
  const result: Partial<Record<NotifChannel, NotifDeliveryStatus>> = {}
  for (const channel of channels) {
    result[channel] = channel === 'inapp' ? 'sent' : 'pending'
  }
  return result
}

/** 舊資料沒有 deliveryStatus 欄位，用當時啟用的 channels 補回對應狀態，避免畫面讀到 undefined。 */
export function migrateUserNotifications<
  T extends { channels: NotifChannel[]; deliveryStatus?: Partial<Record<NotifChannel, NotifDeliveryStatus>> },
>(list: T[]): T[] {
  return list.map((item) =>
    item.deliveryStatus ? item : { ...item, deliveryStatus: computeDeliveryStatus(item.channels) },
  )
}

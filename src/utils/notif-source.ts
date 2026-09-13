import type { NotifSourceType } from '@/src/mocks/admin/notifications'

/**
 * 舊資料沒有 sourceLabel 欄位——當初是套用哪個模板發的，事後已經無從得知，
 * 猜成「一次性撰寫」等於偽造來源，所以統一補空字串，畫面上再自行處理成「—」。
 */
export function migrateNotifSourceLabel<T extends { sourceLabel?: string }>(list: T[]): T[] {
  return list.map((item) => (item.sourceLabel !== undefined ? item : { ...item, sourceLabel: '' }))
}

export function inferSourceType(category: string): NotifSourceType {
  if (category === '系統') return 'system'
  if (category === '租約') return 'landlord'
  if (category === '帳務') return 'landlord'
  if (category === '補貼') return 'admin'
  return 'system'
}

export function migrateNotifSourceType<T extends { sourceType?: NotifSourceType; category: string }>(
  list: T[],
): T[] {
  return list.map((item) =>
    item.sourceType !== undefined ? item : { ...item, sourceType: inferSourceType(item.category) },
  )
}

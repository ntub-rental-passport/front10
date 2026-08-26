/**
 * 舊資料沒有 sourceLabel 欄位——當初是套用哪個模板發的，事後已經無從得知，
 * 猜成「一次性撰寫」等於偽造來源，所以統一補空字串，畫面上再自行處理成「—」。
 */
export function migrateNotifSourceLabel<T extends { sourceLabel?: string }>(list: T[]): T[] {
  return list.map((item) => (item.sourceLabel !== undefined ? item : { ...item, sourceLabel: '' }))
}

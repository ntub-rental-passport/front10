/**
 * 稽核紀錄保留天數的篩選邏輯。純邏輯，不依賴 Vue 或 collection ——
 * 呼叫端（useAdminAudit）自己決定要濾哪一份資料、讀哪一份設定。
 *
 * 這是「視窗式」篩選，不是刪除：超過保留天數的紀錄只是不顯示，
 * 原始資料仍留在 collection 裡，之後把保留天數調大就能重新看到。
 */

export interface RetainableEvent {
  at: string
}

const MS_PER_DAY = 86_400_000

/**
 * @param retentionDays 保留天數；0 或負數代表不限制（永久保留）
 * @param now 供測試注入固定時間，預設為目前時間
 */
export function filterByRetention<T extends RetainableEvent>(
  events: T[],
  retentionDays: number,
  now: Date = new Date(),
): T[] {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return events

  const cutoff = now.getTime() - retentionDays * MS_PER_DAY

  return events.filter((event) => {
    const at = Date.parse(event.at)
    // 時間字串壞掉時保守地保留紀錄，稽核資料寧可多顯示也不要無故消失
    if (Number.isNaN(at)) return true
    return at >= cutoff
  })
}

/**
 * 標題旁那排 KPI 的純邏輯。
 *
 * 這排卡的高度只有原本 StatTile 的三分之一左右，所以每一個字都要算數：
 * 沒有 sublabel、沒有 sparkline，只有「這是什麼」與「多少」。
 */

/**
 * 數字加千分位。
 *
 * 後台的數字遲早會變成四位數以上（使用者總數、工單累計），沒有千分位的
 * 「12847」要停下來數位數才讀得出來。用 zh-TW 而不是預設 locale：預設會
 * 跟著瀏覽器語言跑，同一個畫面在不同機器上可能出現不同的分隔符號。
 *
 * 字串原樣回傳 —— 呼叫端已經格式化好的東西（例如「91.4%」）不要再動它。
 */
export function formatStatValue(value: string | number): string {
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-TW')
}

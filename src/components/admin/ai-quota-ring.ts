/**
 * AI 用量額度進度環的幾何計算。純邏輯，不依賴 Vue。
 *
 * 半圓路徑固定不變（見 AiQuotaRing.vue 的 ARC 常數），用 SVG 的 pathLength="100"
 * 把路徑長度正規化成 0–100，這樣只要算出 stroke-dashoffset 就能畫出百分比，
 * 不用自己算弧長或三角函數，換路徑形狀也不用重算這裡的邏輯。
 */

export interface QuotaRingVisual {
  /** 進度弧的 stroke-dashoffset（配合 pathLength="100"、stroke-dasharray="100"） */
  dashOffset: number
  /** 環中央顯示的文字 */
  displayText: string
}

/**
 * unset（額度未設定）時不畫任何進度、文字顯示「未設定」——跟 QuotaProgressCard
 * 的既有規則一致（見該檔案的 unset 處理），不能顯示 0%：那會被誤讀成「已經設定
 * 額度，而且目前完全沒用到」，跟「根本沒設額度」是兩件事。
 */
export function resolveQuotaRingVisual(percent: number, unset: boolean): QuotaRingVisual {
  if (unset) return { dashOffset: 100, displayText: '未設定' }

  // 防禦性 clamp：呼叫端（useAdminAiUsage）已經把 percent 限制在 0–100，
  // 這裡再擋一次是為了讓這個函式本身在任何輸入下都不會畫出超出路徑的進度弧。
  const clamped = Math.min(100, Math.max(0, percent))
  return { dashOffset: 100 - clamped, displayText: `${Math.round(clamped)}%` }
}

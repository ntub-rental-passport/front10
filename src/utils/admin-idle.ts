/**
 * 管理員閒置登出的判斷。純邏輯。
 *
 * 真正的關卡在後端（backend/security.py 的 admin_session_from）：伺服器記得最後一次
 * 操作的時間，超過就作廢。這裡的計時是給畫面用的 —— 提早一分鐘跳出提醒，
 * 時間到了自己登出、帶到內部登入頁並說明原因，不要讓人在一堆 401 錯誤裡迷路。
 */

/** 跟 backend/platform_settings.py 的 ADMIN_IDLE_MINUTES 一致 */
export const ADMIN_IDLE_MINUTES = 20
/** 登出前多久跳出提醒 */
export const IDLE_WARNING_SECONDS = 60

export type IdlePhase = 'active' | 'warning' | 'expired'

export interface IdleState {
  phase: IdlePhase
  /** 距離自動登出還剩幾秒（已登出為 0） */
  secondsLeft: number
}

export function idleState(
  lastActivityAt: number,
  now: number,
  idleMinutes: number = ADMIN_IDLE_MINUTES,
  warningSeconds: number = IDLE_WARNING_SECONDS,
): IdleState {
  const limitMs = idleMinutes * 60_000
  const leftMs = limitMs - Math.max(0, now - lastActivityAt)
  if (leftMs <= 0) return { phase: 'expired', secondsLeft: 0 }
  const secondsLeft = Math.ceil(leftMs / 1000)
  return { phase: secondsLeft <= warningSeconds ? 'warning' : 'active', secondsLeft }
}

/**
 * 要不要把「有在操作」回報給伺服器。
 *
 * 每次滑鼠移動都回報會把後端打爆；一分鐘一次就夠了 —— 閒置的單位是 20 分鐘，
 * 一分鐘的誤差不影響結果。
 */
export const ACTIVITY_REPORT_INTERVAL_MS = 60_000

export function shouldReportActivity(lastReportedAt: number, now: number): boolean {
  return now - lastReportedAt >= ACTIVITY_REPORT_INTERVAL_MS
}

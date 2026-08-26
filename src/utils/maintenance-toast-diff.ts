/**
 * 比對維護關閉清單前後的差異，抓出「這次新變成關閉」與「這次恢復」的功能 key。
 *
 * 抽成純函式的理由：這段邏輯決定右下角浮出提示要不要跳、跳哪一種——
 * 錯了不是畫面不好看，是使用者會漏看服務中斷，或者恢復了卻沒被告知、
 * 只能自己一直回來試。放在 watch callback 裡用眼睛看不安心，這裡用
 * 單元測試把每個分支釘住。
 */

import type { PlanFeatureKey } from './admin-entitlements'

export interface OutageKeyDiff {
  /** 這次新變成關閉的功能 key，保留 next 的原始順序 */
  added: PlanFeatureKey[]
  /** 這次恢復（不再關閉）的功能 key，保留 previous 的原始順序 */
  removed: PlanFeatureKey[]
}

export function diffOutageKeys(
  previous: PlanFeatureKey[],
  next: PlanFeatureKey[],
): OutageKeyDiff {
  const previousSet = new Set(previous)
  const nextSet = new Set(next)

  return {
    added: next.filter((key) => !previousSet.has(key)),
    removed: previous.filter((key) => !nextSet.has(key)),
  }
}

/**
 * 把一則提示加進佇列並套用同時顯示的上限。
 *
 * 抽成純函式而不是留在 composable 裡，是因為這段在瀏覽器裡難以取信：
 * 畫面被背景化時 requestAnimationFrame 不會跑，Vue 的 TransitionGroup
 * 離場動畫就推進不到 leave-to，被移除的元素會永遠留在 DOM。那時候用肉眼
 * 或 DOM 計數去看「畫面上有幾則」，數到的是殘骸不是狀態，會誤判成上限壞掉。
 * 這裡用測試釘住行為，就不必靠環境正常才敢相信。
 *
 * 溢位時丟最舊的：新事件永遠比舊事件重要，尤其「暫停服務」代表使用者正在
 * 用的東西剛沒了，不該被稍早的提示卡著顯示不出來。
 */
export function appendCapped<T>(
  current: T[],
  incoming: T,
  max: number,
): { kept: T[]; dropped: T[] } {
  const next = [...current, incoming]
  if (max <= 0) return { kept: [], dropped: next }

  const overflow = next.length - max
  if (overflow <= 0) return { kept: next, dropped: [] }

  return { kept: next.slice(overflow), dropped: next.slice(0, overflow) }
}

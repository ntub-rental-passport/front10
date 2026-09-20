export type TrendDirection = 'up' | 'down'

export interface TrendDisplay {
  direction: TrendDirection
  text: string
  toneClass: string
}

const UP_TONE_CLASS = 'text-primary bg-secondary'
const DOWN_TONE_CLASS = 'text-destructive bg-destructive/10'

/**
 * 決定 TrendChip 要不要顯示、顯示什麼。
 *
 * value 是 0 或沒給值，代表沒有可比較的歷史資料。這種情況顯示「+0%」
 * 看起來像是「持平」，但使用者根本不知道基準是什麼——顯示一個沒有意義的
 * 數字比不顯示更容易誤導，所以直接回 null，什麼都不畫（見 TrendChip.vue）。
 */
export function resolveTrendDisplay(
  value: number | undefined,
  suffix = '%',
): TrendDisplay | null {
  if (!value) return null // 0、undefined、NaN 都在這裡被擋掉

  if (value > 0) {
    return { direction: 'up', text: `+${value}${suffix}`, toneClass: UP_TONE_CLASS }
  }

  return { direction: 'down', text: `${value}${suffix}`, toneClass: DOWN_TONE_CLASS }
}

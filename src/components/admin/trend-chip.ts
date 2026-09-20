export type TrendDirection = 'up' | 'down'

export interface TrendDisplay {
  direction: TrendDirection
  text: string
  toneClass: string
}

/**
 * 上升樣式用 secondary-foreground 而不是 primary。
 *
 * 淺色模式下這兩個 token 是完全相同的值（都是 oklch(0.45 0.15 280)，
 * 見 src/index.css），所以淺色外觀零變化。差別在深色模式：
 * --primary 會變亮到 0.6，踩在同樣變深的 --secondary 上實測對比只有 2.83，
 * 12px 的文字未達 AA 的 4.5；--secondary-foreground 在深色是 0.9，同底對比 8.53。
 *
 * 也就是說 primary 在這裡從來就不是「配 secondary 用的前景色」，
 * 淺色模式只是碰巧看起來沒事。
 */
const UP_TONE_CLASS = 'text-secondary-foreground bg-secondary'
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

/**
 * 後台圖表的取色。
 *
 * 顏色的唯一真實來源是 `src/index.css` 的 CSS 變數 —— 這裡只負責把它們讀出來給
 * Chart.js（canvas 需要具體色值，吃不了 `var(--x)`）。
 *
 * 這樣做的代價是多一次 getComputedStyle，換來的是：改主題只要動 CSS、
 * 深色模式免費跟上、而且不會再出現「圖表色和 UI 色慢慢對不上」的漂移。
 */

export type ChartToken =
  | 'series-1'
  | 'series-2'
  | 'series-3'
  | 'series-4'
  | 'series-5'
  | 'fill'
  | 'grid'
  | 'label'
  | 'danger'
  | 'attention'

/** SSR 或測試環境沒有 document 時的退路，值取自 index.css 的淺色定義 */
const FALLBACK: Record<ChartToken, string> = {
  'series-1': 'oklch(0.42 0.16 280)',
  'series-2': 'oklch(0.54 0.14 280)',
  'series-3': 'oklch(0.66 0.11 280)',
  'series-4': 'oklch(0.78 0.08 280)',
  'series-5': 'oklch(0.88 0.05 280)',
  fill: 'oklch(0.42 0.16 280 / 0.12)',
  grid: 'oklch(0.9 0.02 280)',
  label: 'oklch(0.55 0.03 280)',
  danger: 'oklch(0.7 0.18 40)',
  attention: 'oklch(0.8 0.15 80)',
}

export function chartColor(token: ChartToken): string {
  if (typeof document === 'undefined') return FALLBACK[token]
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--chart-${token}`)
    .trim()
  return value || FALLBACK[token]
}

/** 分類圖表的預設順序：同色相由深到淺 */
export function chartSeries(count: number): string[] {
  const tokens: ChartToken[] = ['series-1', 'series-2', 'series-3', 'series-4', 'series-5']
  return Array.from({ length: count }, (_, index) => chartColor(tokens[index % tokens.length]))
}

/**
 * 把資料點轉成 SVG polyline 的座標字串。
 *
 * 座標系統固定 0–100 寬，配合元件的 viewBox 與 preserveAspectRatio="none"，
 * 讓 SVG 用 CSS 撐滿容器寬度；高度用呼叫端傳入的 height。
 *
 * 資料點少於 2 個畫不出線，回 null（見 Sparkline.vue）。
 */
export function buildSparklinePoints(points: number[], height: number): string | null {
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min
  const stepX = 100 / (points.length - 1)

  return points
    .map((value, index) => {
      const x = round(index * stepX)
      // range 為 0 代表所有點都一樣（一條平線），這裡避免除以 0 變 NaN
      const y = round(range === 0 ? height / 2 : height - ((value - min) / range) * height)
      return `${x},${y}`
    })
    .join(' ')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function daysAgo(days: number, hour = 10): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

/**
 * 幾個「日曆月」以前的某一天。
 *
 * 不用 daysAgo(months * 30) 是因為 30 天與真實月份會錯位，
 * 讓刻意安排的每月人數散到相鄰月份，成長曲線就變成鋸齒。
 */
export function monthsAgo(months: number, dayOfMonth: number, hour = 10): string {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - months, 1, hour, 0, 0, 0)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(dayOfMonth, lastDay))
  return date.toISOString()
}

export function daysAhead(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 0, 0)
  return date.toISOString()
}

/**
 * 確定性亂數（mulberry32）。
 *
 * 假資料需要看起來自然但每次產生都一樣 —— 用 Math.random 的話，
 * 每次重置示範資料圖表都會長不同的樣子，也沒辦法對聚合邏輯寫穩定的測試。
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 從陣列取一個元素 */
export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]
}

/** 取 [min, max] 之間的整數，含兩端 */
export function intBetween(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

/**
 * 依權重挑一個元素。權重不必加總為 1。
 *
 * 用來讓工單狀態隨案齡改變：舊案多半已結案，新案還卡在前段。
 */
export function weightedPick<T extends string>(
  random: () => number,
  weights: Record<T, number>,
): T {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll <= 0) return value
  }
  return entries[entries.length - 1][0]
}

import { usageMonth } from './admin-plans'

export function lastTwelveMonths(now: Date) {
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    return {
      month: usageMonth(start),
      label:
        index === 0 || start.getMonth() === 0
          ? `${start.getFullYear()}年${start.getMonth() + 1}月`
          : `${start.getMonth() + 1}月`,
      start,
      end,
    }
  })
}

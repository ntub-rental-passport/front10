import type { Subscription } from '@/src/mocks/admin/subscription'
import { usageMonth } from './admin-plans'

export interface CheckPackPurchaseMonth {
  month: string
  label: string
  packs: number
}

export function monthlyCheckPackPurchases(
  subscriptions: Subscription[],
  now: Date,
): CheckPackPurchaseMonth[] {
  const months: CheckPackPurchaseMonth[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1)
    return {
      month: usageMonth(date),
      label:
        index === 0 || date.getMonth() === 0
          ? `${date.getFullYear()}年${date.getMonth() + 1}月`
          : `${date.getMonth() + 1}月`,
      packs: 0,
    }
  })
  const byMonth = new Map(months.map((month) => [month.month, month]))
  for (const subscription of subscriptions) {
    if (subscription.role !== 'tenant') continue
    for (const pack of subscription.checkPacks) {
      const createdAt = new Date(pack.createdAt)
      if (pack.source !== 'purchase' || !(createdAt <= now)) continue
      const month = byMonth.get(usageMonth(createdAt))
      if (month) month.packs += pack.quantity
    }
  }
  return months
}

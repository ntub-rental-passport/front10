import type { Subscription } from '@/src/mocks/admin/subscription'
import { usageMonth } from './admin-plans'
import { lastTwelveMonths } from './admin-chart-months'

export interface CheckPackPurchaseMonth {
  month: string
  label: string
  packs: number
}

export function monthlyCheckPackPurchases(
  subscriptions: Subscription[],
  now: Date,
): CheckPackPurchaseMonth[] {
  const months: CheckPackPurchaseMonth[] = lastTwelveMonths(now).map(({ month, label }) => ({
    month,
    label,
    packs: 0,
  }))
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

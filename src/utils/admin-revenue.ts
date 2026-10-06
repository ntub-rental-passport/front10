import type { Subscription } from '@/src/mocks/admin/subscription'
import { billingDate, getPlan, usageMonth } from './admin-plans'
import { billingAmount, tenantCheckPack, type PlanRole } from './subscription-plans'

export type RevenueSeriesKey = 'plus' | 'pro' | 'checkPacks'

export interface RevenueEvent {
  at: string
  series: RevenueSeriesKey
  amount: number
}

export interface RevenueMonth {
  month: string
  label: string
  plus: number
  pro: number
  checkPacks: number
  total: number
}

export function subscriptionCharges(
  subscription: Subscription,
  now: Date = new Date(),
): RevenueEvent[] {
  if (subscription.planKey === 'free' || !subscription.billingCycle) return []
  const start = new Date(subscription.startedAt)
  const end = new Date(subscription.expiresAt)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return []
  const trialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt).getTime() : null
  const amount = billingAmount(
    getPlan(subscription.role, subscription.planKey),
    subscription.billingCycle,
  )
  const events: RevenueEvent[] = []
  // active 只描述現在的權益；已收到的歷史款項不能因停用而消失。
  for (let period = 0; ; period++) {
    const at = billingDate(start, subscription.billingCycle, period)
    // expiresAt 是下一次續扣日；取消前的實收保留，那次尚未發生的續扣不能算收入。
    if (at > now || at >= end) break
    if (trialEnd === null || at.getTime() >= trialEnd) {
      events.push({ at: at.toISOString(), series: subscription.planKey, amount })
    }
  }
  return events
}

export function monthlyRevenue(
  subscriptions: Subscription[],
  role: PlanRole,
  now: Date = new Date(),
) {
  const months: RevenueMonth[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1)
    return {
      month: usageMonth(date),
      label:
        index === 0 || date.getMonth() === 0
          ? `${date.getFullYear()}年${date.getMonth() + 1}月`
          : `${date.getMonth() + 1}月`,
      plus: 0,
      pro: 0,
      checkPacks: 0,
      total: 0,
    }
  })
  const byMonth = new Map(months.map((month) => [month.month, month]))
  for (const subscription of subscriptions) {
    if (subscription.role !== role) continue
    const events = subscriptionCharges(subscription, now)
    if (subscription.role === 'tenant') {
      for (const pack of subscription.checkPacks) {
        if (pack.source === 'purchase' && new Date(pack.createdAt) <= now) {
          events.push({
            at: pack.createdAt,
            series: 'checkPacks',
            amount: pack.quantity * tenantCheckPack.price,
          })
        }
      }
    }
    for (const event of events) {
      // 用本地日曆月份歸帳，UTC 月底的扣款可能已是本地的下個月。
      const month = byMonth.get(usageMonth(new Date(event.at)))
      if (!month) continue
      month[event.series] += event.amount
      month.total += event.amount
    }
  }
  const series: { key: RevenueSeriesKey; label: string }[] = [
    { key: 'plus', label: 'Plus' },
    { key: 'pro', label: 'Pro' },
  ]
  if (role === 'tenant') series.push({ key: 'checkPacks', label: '檢查包' })
  return { months, series, currentMonthTotal: months.at(-1)!.total }
}

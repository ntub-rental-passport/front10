import type { Subscription, TenantSubscription } from '@/src/mocks/admin/subscription'
import type { AdminUserRole } from '@/src/mocks/admin/users'
import {
  annualSavings,
  billingAmount,
  monthlyEquivalent,
  planLimits,
  subscriptionPlans,
  type BillingCycle,
  type PlanKey,
  type PlanRole,
} from './subscription-plans'

export const TRIAL_DAYS = 14

/** 每次從首次付款日推算並夾到月底，避免二月讓後續月份永久漂到 28 日。 */
export function billingDate(startedAt: Date, cycle: BillingCycle, periods = 1): Date {
  const date = new Date(startedAt)
  date.setDate(1)
  date.setMonth(date.getMonth() + periods * (cycle === 'monthly' ? 1 : 12))
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(startedAt.getDate(), lastDay))
  return date
}

export function getPlan(role: PlanRole, key: PlanKey) {
  return subscriptionPlans[role].find((plan) => plan.key === key)!
}

export function getPlanLimits<R extends PlanRole>(role: R, key: PlanKey) {
  return planLimits[role][key]
}

export function planRoleOf(role: AdminUserRole): PlanRole | null {
  return role === 'admin' ? null : role === 'landlord' ? 'landlord' : 'tenant'
}

export function isInTrial(trialEndsAt: string | null, now: Date = new Date()): boolean {
  return !!trialEndsAt && new Date(trialEndsAt).getTime() > now.getTime()
}

export function effectivePlanKey(
  subscription: Subscription | null,
  now: Date = new Date(),
): PlanKey {
  if (!subscription?.active) return 'free'
  return isInTrial(subscription.trialEndsAt, now) ? 'plus' : subscription.planKey
}

/** 角色異動後不能沿用另一角色的訂閱；沒有同角色紀錄時仍有 Free 權益。 */
export function userPlan(
  user: { role: AdminUserRole },
  subscription: Subscription | null,
  now: Date = new Date(),
) {
  const role = planRoleOf(user.role)
  if (!role) return null
  const matching = subscription?.role === role ? subscription : null
  return { role, ...getPlan(role, effectivePlanKey(matching, now)) }
}

export function hasActivePaidPlan(subscription: Subscription | null): boolean {
  return !!subscription?.active && subscription.planKey !== 'free'
}

/** 計費依原訂閱；試用只暫時改權益，不憑空產生扣款。 */
export function billingLabel(subscription: Subscription | null): string {
  if (!hasActivePaidPlan(subscription) || !subscription?.billingCycle) return '免費方案，無扣款'
  const plan = getPlan(subscription.role, subscription.planKey)
  const amount = billingAmount(plan, subscription.billingCycle).toLocaleString('zh-TW')
  if (subscription.billingCycle === 'monthly') return `月繳 NT$${amount}`
  return `年繳 NT$${amount}（月均 NT$${monthlyEquivalent(plan)}，較月繳省 NT$${annualSavings(plan).toLocaleString('zh-TW')}）`
}

/** 示範用量按日曆月重置；獨立儲存的一次性贈送與加購消耗不跟著歸零。 */
export function usageMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function checkPackSummary(subscription: TenantSubscription) {
  const packs = subscription.checkPacks
  const purchased = packs
    .filter((pack) => pack.source === 'purchase')
    .reduce((n, pack) => n + pack.quantity, 0)
  const granted = packs
    .filter((pack) => pack.source === 'admin')
    .reduce((n, pack) => n + pack.quantity, 0)
  const remaining = packs.reduce(
    (n, pack) => n + Math.max(0, pack.quantity - pack.usedAt.length),
    0,
  )
  return { purchased, granted, remaining }
}

export function tenantAiUsage(
  subscription: TenantSubscription,
  emailVerified: boolean,
  now: Date = new Date(),
) {
  const quota = getPlanLimits('tenant', effectivePlanKey(subscription, now)).analysis
  const monthly = quota.period === 'monthly'
  const limit = monthly || emailVerified ? quota.limit : 0
  const planUsed = monthly
    ? subscription.aiUsageMonth === usageMonth(now)
      ? subscription.aiUsed
      : 0
    : subscription.freeAiUsed
  const packUsed = subscription.checkPacks.reduce(
    (n, pack) =>
      n +
      pack.usedAt.filter((at) => !monthly || usageMonth(new Date(at)) === usageMonth(now)).length,
    0,
  )
  const packsRemaining = checkPackSummary(subscription).remaining
  const remaining = Math.max(0, limit - planUsed) + packsRemaining
  const used = planUsed + packUsed
  return {
    period: quota.period,
    planLimit: limit,
    planUsed,
    used,
    available: limit + packUsed + packsRemaining,
    remaining,
    exhausted: remaining === 0,
  }
}

/** 先扣方案額度，再扣最早取得的包；保留消耗時間，跨月不能讓已使用的包復活。 */
export function consumeTenantAnalysis(
  subscription: TenantSubscription,
  emailVerified: boolean,
  now: Date = new Date(),
): TenantSubscription | null {
  const usage = tenantAiUsage(subscription, emailVerified, now)
  if (usage.exhausted) return null
  if (usage.planUsed < usage.planLimit) {
    return usage.period === 'monthly'
      ? { ...subscription, aiUsageMonth: usageMonth(now), aiUsed: usage.planUsed + 1 }
      : { ...subscription, freeAiUsed: usage.planUsed + 1 }
  }
  const pack = [...subscription.checkPacks]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .find((item) => item.usedAt.length < item.quantity)!
  return {
    ...subscription,
    checkPacks: subscription.checkPacks.map((item) =>
      item.id === pack.id ? { ...item, usedAt: [...item.usedAt, now.toISOString()] } : item,
    ),
  }
}

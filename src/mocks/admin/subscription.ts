import { createRandom, daysAgo, daysAhead, intBetween, monthsAgo } from './helpers'
import { TRIAL_DAYS, billingDate, getPlanLimits, usageMonth } from '@/src/utils/admin-plans'
import type { BillingCycle, PlanKey, PlanRole } from '@/src/utils/subscription-plans'
import { seedAdminUsers, type AdminUser } from './users'

interface SubscriptionBase {
  id: string
  userId: string
  planKey: PlanKey
  billingCycle: BillingCycle | null
  startedAt: string
  expiresAt: string
  active: boolean
  trialEndsAt: string | null
}

export interface ContractCheckPack {
  id: string
  source: 'purchase' | 'admin'
  quantity: number
  createdAt: string
  /** 一個時間代表一包已消耗；與月份分開保存，才不會重置加購權益。 */
  usedAt: string[]
}

export interface TenantSubscription extends SubscriptionBase {
  role: 'tenant'
  /** 只記方案內的本月用量；加購消耗由包的 usedAt 記錄。 */
  aiUsed: number
  aiUsageMonth: string
  freeAiUsed: number
  storageUsedMb: number
  checkPacks: ContractCheckPack[]
}

export interface LandlordSubscription extends SubscriptionBase {
  role: 'landlord'
}

export type Subscription = TenantSubscription | LandlordSubscription

/** 各角色分開循環，避免小樣本抽不到某方案、週期或警示情境。 */
const PLAN_CYCLE: PlanKey[] = ['free', 'plus', 'pro', 'plus', 'pro', 'free']

export function seedSubscriptions(users: AdminUser[] = seedAdminUsers()): Subscription[] {
  const random = createRandom(302558)
  const now = new Date()
  const indexes: Record<PlanRole, number> = { tenant: 0, landlord: 0 }
  return users.flatMap((user): Subscription[] => {
    if (user.role === 'admin') return []
    const role = user.role === 'landlord' ? 'landlord' : 'tenant'
    const index = indexes[role]++
    const planKey = PLAN_CYCLE[index % PLAN_CYCLE.length]
    const billingCycle: BillingCycle | null =
      planKey === 'free' ? null : index % 2 === 0 ? 'yearly' : 'monthly'
    const active = user.status === 'active'
    const trialEndsAt =
      active && index % 6 === 5 ? daysAhead(intBetween(random, 1, TRIAL_DAYS - 1)) : null
    let startedAt: string
    let expiresAt: string
    if (!billingCycle) {
      startedAt = user.registeredAt
      expiresAt = !active ? daysAgo(3) : daysAhead(intBetween(random, 15, 27))
    } else {
      // 月繳保留即將到期情境；其餘開始日分散，年繳收款才不會集中在同一月份。
      const soon = billingCycle === 'monthly' && index % 3 === 1
      const nextWeek = new Date(now)
      nextWeek.setDate(nextWeek.getDate() + 7)
      const day = soon ? nextWeek.getDate() : intBetween(random, 1, 28)
      // 停用者保留至少一期已付款歷史，再於某個過去的續扣日前取消。
      const minimumMonths = active ? 1 : billingCycle === 'yearly' ? 13 : 2
      startedAt = monthsAgo(intBetween(random, minimumMonths, 18), day)
      const start = new Date(startedAt)
      let period = 1
      let next = billingDate(start, billingCycle, period)
      while (next <= now) next = billingDate(start, billingCycle, ++period)
      expiresAt = (active ? next : billingDate(start, billingCycle, period - 1)).toISOString()
    }
    const common = {
      id: `sub-${user.id}`,
      userId: user.id,
      planKey,
      billingCycle,
      startedAt,
      expiresAt,
      active,
      trialEndsAt,
    }
    if (role === 'landlord') return [{ ...common, role }]
    const limits = getPlanLimits(role, trialEndsAt ? 'plus' : active ? planKey : 'free')
    const exhausted = index % 6 === 1
    return [
      {
        ...common,
        role,
        aiUsageMonth: usageMonth(),
        aiUsed: limits.analysis.period === 'monthly' && exhausted ? limits.analysis.limit : 0,
        freeAiUsed: planKey === 'free' && user.emailVerified && index % 2 === 0 ? 1 : 0,
        storageUsedMb: Math.floor(limits.storage.limit * (exhausted ? 1 : random() * 0.8)),
        checkPacks:
          index % 6 === 2
            ? [
                {
                  id: `pack-${user.id}-purchase`,
                  source: 'purchase',
                  quantity: 3,
                  createdAt: daysAgo(40),
                  usedAt: [daysAgo(35)],
                },
                {
                  id: `pack-${user.id}-admin`,
                  source: 'admin',
                  quantity: 1,
                  createdAt: daysAgo(2),
                  usedAt: [],
                },
              ]
            : [],
      },
    ]
  })
}

import { createRandom, daysAgo, daysAhead, intBetween } from './helpers'
import { seedAdminUsers, type AdminUser } from './users'

export type PlanId = 'free' | 'plus' | 'pro'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  priceLabel: string
  aiQuota: number
  storageMb: number
}

export interface Subscription {
  id: string
  userId: string
  planId: PlanId
  expiresAt: string
  aiUsed: number
  storageUsedMb: number
  active: boolean
}

export function seedPlans(): SubscriptionPlan[] {
  return [
    { id: 'free', name: '免費方案', priceLabel: 'NT$0', aiQuota: 3, storageMb: 200 },
    { id: 'plus', name: '進階方案', priceLabel: 'NT$99／月', aiQuota: 20, storageMb: 2048 },
    { id: 'pro', name: '專業方案', priceLabel: 'NT$299／月', aiQuota: 100, storageMb: 10240 },
  ]
}

const QUOTA: Record<PlanId, { ai: number; storage: number }> = {
  free: { ai: 3, storage: 200 },
  plus: { ai: 20, storage: 2048 },
  pro: { ai: 100, storage: 10240 },
}

/**
 * 方案與到期日用固定循環分配，不靠機率。
 *
 * 純機率會讓小樣本嚴重偏離期望值 —— 專業方案可能一筆都抽不到，
 * 到期日也很難剛好落進「即將到期」那 14 天，警示卡就永遠是 0。
 */
const PLAN_CYCLE: PlanId[] = ['free', 'plus', 'free', 'pro', 'plus', 'free', 'plus', 'free', 'pro', 'plus']

/** 每 7 筆安排 1 筆落在 14 天內到期，確保到期警示有東西可看 */
const EXPIRING_EVERY = 7

/** 每 9 筆安排 1 筆把額度用滿 */
const EXHAUSTED_EVERY = 9

/** 管理員不訂閱；其餘使用者約八成有訂閱記錄，留下一批「尚未訂閱」供空狀態驗證 */
export function seedSubscriptions(users: AdminUser[] = seedAdminUsers()): Subscription[] {
  const random = createRandom(302558)
  const subscriptions: Subscription[] = []
  let index = 0

  for (const user of users) {
    if (user.role === 'admin') continue
    if (random() > 0.8) continue

    const planId = PLAN_CYCLE[index % PLAN_CYCLE.length]
    const quota = QUOTA[planId]

    // 停用帳號的訂閱一併失效，且到期日落在過去
    const active = user.status === 'active' && random() > 0.06
    const expiringSoon = active && index % EXPIRING_EVERY === 0
    const expiresAt = !active
      ? daysAgo(intBetween(random, 2, 60))
      : expiringSoon
        ? daysAhead(intBetween(random, 2, 13))
        : daysAhead(intBetween(random, 25, 330))

    // 每 9 筆安排 1 筆把額度用滿，其餘落在一到八成之間
    const exhausted = active && index % EXHAUSTED_EVERY === EXHAUSTED_EVERY - 1
    const usageRatio = exhausted ? 1 : 0.12 + random() * 0.68

    index += 1
    subscriptions.push({
      id: `sub-${index}`,
      userId: user.id,
      planId,
      expiresAt,
      // 用 floor：免費方案額度只有 3 次，四捨五入會讓一半的人都被算成用滿
      aiUsed: Math.min(quota.ai, Math.floor(quota.ai * usageRatio)),
      storageUsedMb: Math.min(quota.storage, Math.floor(quota.storage * usageRatio)),
      active,
    })
  }

  return subscriptions
}

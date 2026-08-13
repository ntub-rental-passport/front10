import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import {
  seedPlans,
  seedSubscriptions,
  type PlanId,
  type Subscription,
  type SubscriptionPlan,
} from '@/src/mocks/admin-seed'
import { discardLegacy } from '@/src/utils/admin-collection-migrate'

export const adminPlansCollection = createAdminCollection<SubscriptionPlan[]>('plans', seedPlans)
const plans = adminPlansCollection

// 舊格式用 userEmail 指向使用者，無法與其他 collection 對接，直接丟棄重 seed。
export const adminSubscriptionCollection = createAdminCollection<Subscription[]>(
  'subscriptions',
  seedSubscriptions,
  discardLegacy(seedSubscriptions, 'userId'),
)
const subscriptions = adminSubscriptionCollection

const EXPIRING_SOON_DAYS = 14

/** 稽核紀錄用 email 當識別，比 userId 好讀 */
function labelOf(userId: string): string {
  return adminUsersCollection.value.find((user) => user.id === userId)?.email ?? userId
}

export function useAdminSubscription() {
  const { logAction } = useAdminAudit()

  function planOf(subscription: Subscription): SubscriptionPlan {
    return plans.value.find((plan) => plan.id === subscription.planId) ?? plans.value[0]
  }

  function changePlan(id: string, planId: PlanId): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    if (!subscription || subscription.planId === planId) return
    const nextPlan = plans.value.find((plan) => plan.id === planId)
    if (!nextPlan) return
    subscription.planId = planId
    logAction('訂閱', labelOf(subscription.userId), `方案調整為「${nextPlan.name}」`)
  }

  function cancelSubscription(id: string): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    if (!subscription || !subscription.active) return
    subscription.active = false
    logAction('訂閱', labelOf(subscription.userId), '取消訂閱')
  }

  function isExpiringSoon(subscription: Subscription): boolean {
    if (!subscription.active) return false
    const remainingMs = new Date(subscription.expiresAt).getTime() - Date.now()
    return remainingMs > 0 && remainingMs <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  }

  return { plans, subscriptions, planOf, changePlan, cancelSubscription, isExpiringSoon }
}

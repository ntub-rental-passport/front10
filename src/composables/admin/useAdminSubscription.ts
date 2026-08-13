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
import { isSubscriptionExpiring } from '@/src/utils/admin-user-directory'

export const adminPlansCollection = createAdminCollection<SubscriptionPlan[]>('plans', seedPlans)
const plans = adminPlansCollection

// 舊格式用 userEmail 指向使用者，無法與其他 collection 對接，直接丟棄重 seed。
export const adminSubscriptionCollection = createAdminCollection<Subscription[]>(
  'subscriptions',
  seedSubscriptions,
  discardLegacy(seedSubscriptions, 'userId'),
)
const subscriptions = adminSubscriptionCollection

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

  // 與使用者列表的「訂閱即將到期」警示共用同一份判定，避免兩處規則走鐘
  function isExpiringSoon(subscription: Subscription): boolean {
    return isSubscriptionExpiring(subscription)
  }

  return { plans, subscriptions, planOf, changePlan, cancelSubscription, isExpiringSoon }
}

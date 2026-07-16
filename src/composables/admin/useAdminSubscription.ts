import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedPlans,
  seedSubscriptions,
  type PlanId,
  type Subscription,
  type SubscriptionPlan,
} from '@/src/mocks/admin-seed'

const plans = createAdminCollection<SubscriptionPlan[]>('plans', seedPlans)
const subscriptions = createAdminCollection<Subscription[]>('subscriptions', seedSubscriptions)

const EXPIRING_SOON_DAYS = 14

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
    logAction('訂閱', subscription.userEmail, `方案調整為「${nextPlan.name}」`)
  }

  function cancelSubscription(id: string): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    if (!subscription || !subscription.active) return
    subscription.active = false
    logAction('訂閱', subscription.userEmail, '取消訂閱')
  }

  function isExpiringSoon(subscription: Subscription): boolean {
    if (!subscription.active) return false
    const remainingMs = new Date(subscription.expiresAt).getTime() - Date.now()
    return remainingMs > 0 && remainingMs <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  }

  return { plans, subscriptions, planOf, changePlan, cancelSubscription, isExpiringSoon }
}

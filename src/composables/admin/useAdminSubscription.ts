import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import { adminSettings } from './useAdminSettings'
import {
  seedPlans,
  seedSubscriptions,
  type PlanId,
  type Subscription,
  type SubscriptionPlan,
} from '@/src/mocks/admin-seed'
import { ADMIN_DATASET_VERSION, discardLegacy } from '@/src/utils/admin-collection-migrate'
import { isSubscriptionExpiring } from '@/src/utils/admin-user-directory'
import { PLAN_FEATURES, type PlanFeatureKey } from '@/src/utils/admin-entitlements'

/**
 * 方案內容只由程式定義（mocks/admin/subscription.ts 的 seedPlans）。
 *
 * 以前可以在系統設定頁改，改完存在瀏覽器裡。權益是產品決策，不該由後台隨手
 * 調整，而且只改得到那一台瀏覽器。以前改過、存在 localStorage 的舊版本不再讀取。
 */
const PLANS: readonly SubscriptionPlan[] = seedPlans()
export const adminPlans = computed<SubscriptionPlan[]>(() => [...PLANS])
const plans = adminPlans

// 舊格式用 userEmail 指向使用者，且沒有單次加購欄位，直接丟棄重 seed。
// marker 用 extraCredits 而非 userId —— 前者是這一版才出現的欄位。
export const adminSubscriptionCollection = createAdminCollection<Subscription[]>(
  `subscriptions-${ADMIN_DATASET_VERSION}`,
  seedSubscriptions,
  discardLegacy(seedSubscriptions, 'extraCredits'),
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

  /**
   * 加購單次額度。
   *
   * 只加不減：要收回額度應該是調方案上限，而不是把已經賣出去的次數扣回來。
   * 這裡也不記金流 —— 平台還沒接金流，後台不該生出一筆假的付款紀錄。
   */
  function grantCredits(id: string, featureKey: PlanFeatureKey, amount: number): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    if (!subscription || !Number.isFinite(amount) || amount <= 0) return

    const next = Math.floor(amount)
    subscription.extraCredits = {
      ...subscription.extraCredits,
      [featureKey]: (subscription.extraCredits[featureKey] ?? 0) + next,
    }
    logAction(
      '訂閱',
      labelOf(subscription.userId),
      `加購${PLAN_FEATURES[featureKey].label} ${next} ${PLAN_FEATURES[featureKey].unit ?? '次'}`,
    )
  }

  // 與使用者列表的「訂閱即將到期」警示共用同一份判定，避免兩處規則走鐘
  function isExpiringSoon(subscription: Subscription): boolean {
    return isSubscriptionExpiring(subscription, adminSettings.value.subscriptionExpiringSoonDays)
  }

  return {
    plans,
    subscriptions,
    planOf,
    changePlan,
    cancelSubscription,
    grantCredits,
    isExpiringSoon,
  }
}

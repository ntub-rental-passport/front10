import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import { adminSettings } from './useAdminSettings'
import { seedSubscriptions, type Subscription } from '@/src/mocks/admin/subscription'
import { ADMIN_DATASET_VERSION, discardLegacy } from '@/src/utils/admin-collection-migrate'
import { isSubscriptionExpiring } from '@/src/utils/admin-user-directory'
import { billingDate, getPlan, planRoleOf } from '@/src/utils/admin-plans'
import { subscriptionPlans, type PlanKey, type PlanRole } from '@/src/utils/subscription-plans'

// 缺少付費開始日就無法推算歷史扣款，舊展示資料整批重建。
export const adminSubscriptionCollection = createAdminCollection<Subscription[]>(
  `subscriptions-${ADMIN_DATASET_VERSION}`,
  seedSubscriptions,
  discardLegacy(seedSubscriptions, 'startedAt'),
)
const subscriptions = adminSubscriptionCollection

/** 稽核紀錄用 email 當識別，比 userId 好讀 */
function labelOf(userId: string): string {
  return adminUsersCollection.value.find((user) => user.id === userId)?.email ?? userId
}

export function useAdminSubscription() {
  const { logAction } = useAdminAudit()

  function changePlan(id: string, role: PlanRole, planKey: PlanKey): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    const user = adminUsersCollection.value.find((item) => item.id === subscription?.userId)
    if (!subscription || subscription.role !== role || !user || planRoleOf(user.role) !== role)
      return
    if (!subscriptionPlans[role].some((plan) => plan.key === planKey)) return
    if (subscription.planKey === planKey && subscription.active && !subscription.trialEndsAt) return

    const wasFree = !subscription.active || subscription.planKey === 'free'
    if (planKey === 'free') {
      subscription.billingCycle = null
    } else if (wasFree) {
      subscription.billingCycle = 'monthly'
      const now = new Date()
      subscription.startedAt = now.toISOString()
      // Free 的到期日沒有計費意義，升級後必須從首次付款重建下一期日期。
      subscription.expiresAt = billingDate(now, 'monthly').toISOString()
    }
    subscription.planKey = planKey
    subscription.active = true
    // 管理員改方案須立即生效，不能被尚未結束的試用蓋過。
    subscription.trialEndsAt = null
    logAction('訂閱', labelOf(subscription.userId), `方案調整為「${getPlan(role, planKey).name}」`)
  }

  function grantCheckPacks(id: string, quantity: number): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    const user = adminUsersCollection.value.find((item) => item.id === subscription?.userId)
    if (!subscription || subscription.role !== 'tenant' || user?.role !== 'user') return
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return
    subscription.checkPacks.push({
      id: crypto.randomUUID(),
      source: 'admin',
      quantity,
      createdAt: new Date().toISOString(),
      usedAt: [],
    })
    logAction('訂閱', labelOf(subscription.userId), `補發契約檢查包 ${quantity} 包`)
  }

  // 與使用者列表共用門檻，避免兩處警示不同步。
  function isExpiringSoon(subscription: Subscription): boolean {
    return isSubscriptionExpiring(subscription, adminSettings.value.subscriptionExpiringSoonDays)
  }

  return { subscriptions, changePlan, grantCheckPacks, isExpiringSoon }
}

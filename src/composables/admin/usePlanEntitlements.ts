import { computed } from 'vue'
import { useAdminAudit } from './useAdminAudit'
import { adminPlansCollection, adminSubscriptionCollection } from './useAdminSubscription'
import { adminHandoverCollection } from './useAdminHandover'
import { adminSubsidyCollection } from './useAdminSubsidy'
import type { SubscriptionPlan } from '@/src/mocks/admin/subscription'
import {
  PLAN_FEATURES,
  PLAN_FEATURE_KEYS,
  impactedUserCount,
  limitImpacts,
  newlyImpacted,
  type LimitImpact,
  type PlanFeatureKey,
  type PlanFeatures,
  type UsageSnapshot,
} from '@/src/utils/admin-entitlements'

/**
 * 還沒送件出去的補貼申請才佔用「同時申請」的名額 ——
 * 已送件與已退件都結束了，再算進去等於把歷史紀錄當成現在的佔用。
 */
const OPEN_SUBSIDY_STATUSES = ['pending', 'need-docs', 'ready']

/**
 * 每位使用者目前的實際用量。
 *
 * 三項有額度的功能各自從真正的資料來源算，不另外編一份數字 ——
 * 調降上限的影響評估要有意義，用量就必須是真的。
 */
export function usePlanEntitlements() {
  const { logAction } = useAdminAudit()

  const plans = adminPlansCollection

  const usageSnapshots = computed<UsageSnapshot[]>(() =>
    adminSubscriptionCollection.value.map((subscription) => {
      const { userId } = subscription
      return {
        userId,
        planId: subscription.planId,
        used: {
          'contract-analysis': subscription.aiUsed,
          handover: adminHandoverCollection.value.filter(
            (record) => record.tenantUserId === userId || record.landlordUserId === userId,
          ).length,
          subsidy: adminSubsidyCollection.value.filter(
            (application) =>
              application.userId === userId &&
              OPEN_SUBSIDY_STATUSES.includes(application.status),
          ).length,
        },
        extraCredits: subscription.extraCredits,
      }
    }),
  )

  function impactsUnder(source: SubscriptionPlan[]): LimitImpact[] {
    const featuresByPlan = Object.fromEntries(
      source.map((plan) => [plan.id, plan.features]),
    ) as Record<string, PlanFeatures>
    return limitImpacts(usageSnapshots.value, featuresByPlan)
  }

  /** 因為這次調整才會超額的人數。現行設定下就已經超額的人不算在內。 */
  function impactOf(draft: SubscriptionPlan[]): number {
    return impactedUserCount(newlyImpacted(impactsUnder(plans.value), impactsUnder(draft)))
  }

  /** 稽核紀錄要寫得出「改了什麼」，否則事後查不出是哪一次調整造成的 */
  function describeChanges(draft: SubscriptionPlan[]): string[] {
    const changes: string[] = []

    for (const next of draft) {
      const current = plans.value.find((plan) => plan.id === next.id)
      if (!current) continue

      for (const key of PLAN_FEATURE_KEYS) {
        const before = current.features[key]
        const after = next.features[key]
        if (before.enabled !== after.enabled) {
          changes.push(`${next.name}：${PLAN_FEATURES[key].label} ${after.enabled ? '開啟' : '關閉'}`)
        }
        if (before.limit !== after.limit) {
          changes.push(
            `${next.name}：${PLAN_FEATURES[key].label} 上限 ${limitText(before.limit)} → ${limitText(after.limit)}`,
          )
        }
      }
    }

    return changes
  }

  function savePlanFeatures(draft: SubscriptionPlan[]): void {
    const changes = describeChanges(draft)
    if (changes.length === 0) return

    plans.value = draft.map((plan) => ({ ...plan, features: cloneFeatures(plan.features) }))
    logAction('系統設定', '方案權益', changes.join('；'))
  }

  return { plans, usageSnapshots, impactOf, describeChanges, savePlanFeatures }
}

export function limitText(limit: number | null): string {
  return limit === null ? '無上限' : String(limit)
}

/** 深拷貝，避免草稿與已儲存的資料共用同一個物件而「還原變更」失效 */
export function cloneFeatures(features: PlanFeatures): PlanFeatures {
  return Object.fromEntries(
    PLAN_FEATURE_KEYS.map((key) => [key, { ...features[key] }]),
  ) as Record<PlanFeatureKey, PlanFeatures[PlanFeatureKey]>
}

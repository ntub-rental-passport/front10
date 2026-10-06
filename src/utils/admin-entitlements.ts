/**
 * 功能識別供停機公告使用，key 與標籤須和後端一致。
 * 方案額度集中在 subscription-plans.ts，避免把功能停機與訂閱權益混為一談。
 */

export type PlanFeatureKey =
  | 'contract-analysis'
  | 'handover'
  | 'subsidy'
  | 'garbage'
  | 'outage'
  | 'notes'

export interface PlanFeatureMeta {
  label: string
}

export const PLAN_FEATURES: Record<PlanFeatureKey, PlanFeatureMeta> = {
  'contract-analysis': { label: '契約分析' },
  handover: { label: '點交存證' },
  subsidy: { label: '租金補貼' },
  garbage: { label: '垃圾車查詢' },
  outage: { label: '停水停電通知' },
  notes: { label: '記事與室友協作' },
}

export const PLAN_FEATURE_KEYS = Object.keys(PLAN_FEATURES) as PlanFeatureKey[]

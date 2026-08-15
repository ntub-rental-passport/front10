/**
 * 方案權益：哪個方案能用哪些功能、各自的額度上限。純邏輯，不依賴 Vue。
 *
 * 設計上有三條規矩：
 *
 * 1. **無上限用 `null`**，不用 -1 或 999999 —— 魔術數字遲早會被拿去做算術。
 * 2. **不是每個功能都有額度**。契約分析按次、點交存證按物件、租金補貼按同時
 *    申請數，這三個限制得起來；垃圾車與停水停電是資訊查詢，替它們編一個
 *    「每月可查幾次」的數字沒有任何依據。
 * 3. **一個功能只有一個上限來源**。契約分析的額度就是這裡的 limit，
 *    不再另外存 aiQuota —— 兩個來源會讓「這人到底能用幾次」查兩個地方。
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
  /** 額度單位；null 代表這個功能只有開關、沒有額度 */
  unit: string | null
}

export const PLAN_FEATURES: Record<PlanFeatureKey, PlanFeatureMeta> = {
  'contract-analysis': { label: '契約分析', unit: '次／月' },
  handover: { label: '點交存證', unit: '個物件' },
  subsidy: { label: '租金補貼', unit: '件同時申請' },
  garbage: { label: '垃圾車查詢', unit: null },
  outage: { label: '停水停電通知', unit: null },
  notes: { label: '記事與室友協作', unit: null },
}

export const PLAN_FEATURE_KEYS = Object.keys(PLAN_FEATURES) as PlanFeatureKey[]

/** 這個功能是否吃額度。純開關的功能不該顯示額度輸入框。 */
export function isMetered(key: PlanFeatureKey): boolean {
  return PLAN_FEATURES[key].unit !== null
}

export interface PlanFeatureRule {
  enabled: boolean
  /** null = 無上限。純開關功能一律為 null。 */
  limit: number | null
}

export type PlanFeatures = Record<PlanFeatureKey, PlanFeatureRule>

// ── 可用性判定 ────────────────────────────────────────────────────

export type FeatureVerdict = 'allowed' | 'disabled' | 'exhausted'

/**
 * 這個人現在能不能用這個功能。
 *
 * `extraCredits` 是單次加購的額度，疊加在方案上限之上 ——
 * 單次付費的本質就是「一筆可消耗的額度」，不是換方案。
 */
export function featureVerdict(
  rule: PlanFeatureRule | undefined,
  used = 0,
  extraCredits = 0,
): FeatureVerdict {
  if (!rule || !rule.enabled) return 'disabled'
  if (rule.limit === null) return 'allowed'
  return used < rule.limit + extraCredits ? 'allowed' : 'exhausted'
}

/** 還剩幾次。無上限或功能關閉時回傳 null —— 那時候「剩幾次」沒有意義。 */
export function remainingQuota(
  rule: PlanFeatureRule | undefined,
  used = 0,
  extraCredits = 0,
): number | null {
  if (!rule || !rule.enabled || rule.limit === null) return null
  return Math.max(0, rule.limit + extraCredits - used)
}

// ── 試用 ──────────────────────────────────────────────────────────

/** 新戶限時試用的天數 */
export const TRIAL_DAYS = 14

/** 試用中的使用者享有的方案 */
export const TRIAL_PLAN_ID = 'plus'

export function isInTrial(trialEndsAt: string | null, now: Date = new Date()): boolean {
  if (!trialEndsAt) return false
  return new Date(trialEndsAt).getTime() > now.getTime()
}

/**
 * 實際生效的方案。
 *
 * 試用期間一律套用試用方案，不管他名下掛的是哪一個 —— 試用的定義就是
 * 「先給你更好的用」，到期自動落回原方案，不需要另外的降級動作。
 */
export function effectivePlanId(
  planId: string,
  trialEndsAt: string | null,
  now: Date = new Date(),
): string {
  return isInTrial(trialEndsAt, now) ? TRIAL_PLAN_ID : planId
}

// ── 調整方案上限時的影響評估 ──────────────────────────────────────

export interface UsageSnapshot {
  userId: string
  planId: string
  /** 各功能目前的使用量 */
  used: Partial<Record<PlanFeatureKey, number>>
  /** 各功能的單次加購額度 */
  extraCredits?: Partial<Record<PlanFeatureKey, number>>
}

export interface LimitImpact {
  userId: string
  featureKey: PlanFeatureKey
  used: number
  limit: number
}

/**
 * 套用新的方案設定後，有誰會立刻超額。
 *
 * 調降上限是立即生效的，所以儲存前必須先算出影響範圍給管理員看 ——
 * 「這個調整會讓 3 個人本期直接不能用」是他該在按下去之前知道的事。
 */
export function limitImpacts(
  snapshots: UsageSnapshot[],
  featuresByPlan: Record<string, PlanFeatures>,
): LimitImpact[] {
  const impacts: LimitImpact[] = []

  for (const snapshot of snapshots) {
    const features = featuresByPlan[snapshot.planId]
    if (!features) continue

    for (const key of PLAN_FEATURE_KEYS) {
      const rule = features[key]
      if (!rule?.enabled || rule.limit === null) continue

      const used = snapshot.used[key] ?? 0
      const extra = snapshot.extraCredits?.[key] ?? 0
      if (used > rule.limit + extra) {
        impacts.push({ userId: snapshot.userId, featureKey: key, used, limit: rule.limit + extra })
      }
    }
  }

  return impacts
}

/** 受影響的人數（同一人多項超額只算一次） */
export function impactedUserCount(impacts: LimitImpact[]): number {
  return new Set(impacts.map((impact) => impact.userId)).size
}

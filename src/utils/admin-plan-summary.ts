/**
 * 使用者詳情頁「方案包含什麼」。純邏輯。
 *
 * 方案內容以前在系統設定頁可以改；現在改成只由程式定義，管理員需要知道的時機
 * 是處理某個使用者的時候 —— 所以放在他的方案旁邊，而且連他用了多少一起講。
 */

import { PLAN_FEATURES, PLAN_FEATURE_KEYS, type PlanFeatureKey, type PlanFeatures } from './admin-entitlements'

export interface PlanInclusion {
  key: PlanFeatureKey
  label: string
  included: boolean
  /** 「20 次／月（已用 5，加購 +3）」「無上限」「包含」「不包含」 */
  text: string
}

export function planInclusions(
  features: PlanFeatures,
  options: {
    /** 有記錄用量的功能才給；目前只有契約分析有逐人用量 */
    used?: Partial<Record<PlanFeatureKey, number>>
    extraCredits?: Partial<Record<PlanFeatureKey, number>>
  } = {},
): PlanInclusion[] {
  return PLAN_FEATURE_KEYS.map((key) => {
    const rule = features[key]
    const { label, unit } = PLAN_FEATURES[key]
    if (!rule?.enabled) return { key, label, included: false, text: '不包含' }
    if (unit === null) return { key, label, included: true, text: '包含' }

    const base = rule.limit === null ? '無上限' : `${rule.limit} ${unit}`
    const notes: string[] = []
    const used = options.used?.[key]
    if (used !== undefined) notes.push(`已用 ${used}`)
    const extra = options.extraCredits?.[key] ?? 0
    if (extra > 0) notes.push(`加購 +${extra}`)
    return { key, label, included: true, text: notes.length ? `${base}（${notes.join('，')}）` : base }
  })
}

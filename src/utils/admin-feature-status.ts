/**
 * 功能維護開關：功能故障時，管理員暫時對「所有使用者」關閉某功能。純邏輯，不依賴 Vue。
 *
 * 這與 admin-entitlements.ts 的方案權益是完全不同的兩件事，設計上刻意不共用：
 *
 * 1. **權益關閉 vs 維護關閉，文案不能混**。權益關閉是「升級方案即可使用」，
 *    維護關閉是「服務故障中，預計 X 恢復」——把兩者用同一套文案講，
 *    使用者會誤以為維護中的功能可以花錢解決。
 * 2. **功能 key 沿用 `PlanFeatureKey`，不另建一份清單**。兩邊本來就是同一組
 *    六項功能，分別維護會有清單漂移的風險（例如新增功能時只改到一邊）。
 * 3. **`internalReason` 只給管理員看，`publicNote` 才是使用者會看到的**。
 *    把故障細節（例如「XX API 金鑰過期」）直接曝露給使用者沒有意義，
 *    反而可能洩漏內部架構細節。
 */

import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from './admin-entitlements'

export interface FeatureOutage {
  featureKey: PlanFeatureKey
  /** 內部原因：只給管理員看，進稽核紀錄與後台橫幅，不對使用者顯示 */
  internalReason: string
  /** 對外說明：顯示在使用者端；留白時改用制式文案 */
  publicNote: string
  closedAt: string
  /** 預計恢復時間；null 代表沒填 */
  etaAt: string | null
}

export const DEFAULT_PUBLIC_NOTE = '此功能正在維護中，造成不便敬請見諒。'

/** 這個功能目前是否有生效中的維護紀錄；沒有就回 null。 */
export function outageOf(outages: FeatureOutage[], key: PlanFeatureKey): FeatureOutage | null {
  return outages.find((outage) => outage.featureKey === key) ?? null
}

/** 這個功能現在是不是被維護關閉。 */
export function isFeatureClosed(outages: FeatureOutage[], key: PlanFeatureKey): boolean {
  return outageOf(outages, key) !== null
}

/** 對外顯示的說明文字。留白（含只有空白）視同沒填，退回制式文案，避免畫面開天窗。 */
export function publicNoteOf(outage: FeatureOutage): string {
  const trimmed = outage.publicNote.trim()
  return trimmed === '' ? DEFAULT_PUBLIC_NOTE : trimmed
}

/** 有沒有填預計恢復時間，而且那個時間已經過了。沒填一律回 false —— 沒有承諾就談不上過期。 */
export function isEtaPassed(outage: FeatureOutage, now: Date = new Date()): boolean {
  if (!outage.etaAt) return false
  return new Date(outage.etaAt).getTime() <= now.getTime()
}

/**
 * 可以對外公布的預計恢復時間，回傳 ISO 字串（呼叫端自行格式化）。
 *
 * 已過期一律回 null，不繼續顯示那個過去的時間點。
 * 留著一個「說好幾點恢復結果沒恢復」的過期承諾，比起乾脆不給時間更傷信任——
 * 使用者看到過期的 ETA 只會覺得平台自己都忘了要恢復，或乾脆放著不管。
 * 沒過期就照樣回傳；沒填也回 null（沒有可公布的東西）。
 */
export function publicEtaAt(outage: FeatureOutage, now: Date = new Date()): string | null {
  if (!outage.etaAt) return null
  if (isEtaPassed(outage, now)) return null
  return outage.etaAt
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * 關閉了多久，只回時長本身（「3 小時 20 分」），不帶「已關閉」之類的前綴。
 *
 * 刻意不把前綴寫進來：後台橫幅要講「已關閉 3 小時 20 分」，稽核紀錄要講
 * 「共關閉 3 小時 20 分」，前綴屬於呼叫端的語境。如果這裡回傳含前綴的完整句子，
 * 稽核那邊就得去字串裡把前綴切掉——那種切法在前綴一改就會悄悄切錯，
 * 而且錯的方向是寫進稽核紀錄，事後根本看不出來。
 *
 * 級距切換的原因：關注的精細度會隨關閉時間拉長而變粗——剛關閉時分鐘數才有意義，
 * 拖過一天就只需要知道大概天數。
 */
export function outageDurationLabel(outage: FeatureOutage, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(outage.closedAt).getTime())

  if (elapsed < MINUTE_MS) return '不到 1 分鐘'

  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS)
    return `${minutes} 分`
  }

  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS)
    const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS)
    return `${hours} 小時 ${minutes} 分`
  }

  const days = Math.floor(elapsed / DAY_MS)
  const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS)
  return `${days} 天 ${hours} 小時`
}

/** 目前被關閉的功能 key，依 PLAN_FEATURE_KEYS 的順序排列，讓畫面順序穩定。 */
export function closedFeatureKeys(outages: FeatureOutage[]): PlanFeatureKey[] {
  const closed = new Set(outages.map((outage) => outage.featureKey))
  return PLAN_FEATURE_KEYS.filter((key) => closed.has(key))
}

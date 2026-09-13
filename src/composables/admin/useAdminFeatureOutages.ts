/**
 * 功能維護開關的後台寫入介面。
 *
 * 讀取邏輯放在 useFeatureOutages（前台也會 import），這裡只放管理員才需要的
 * 寫入操作與稽核記錄，避免前台被拖進不相關的 import 圖。
 */

import { useAdminAudit } from './useAdminAudit'
import { featureOutagesCollection } from '@/src/composables/useFeatureOutages'
import { outageDurationLabel, outageOf } from '@/src/utils/admin-feature-status'
import { PLAN_FEATURES, type PlanFeatureKey } from '@/src/utils/admin-entitlements'
import { formatDateTime } from '@/src/utils/admin-format'

const outages = featureOutagesCollection

export function useAdminFeatureOutages() {
  const { logAction } = useAdminAudit()

  /**
   * 關閉功能（或更新一筆已經在關閉中的紀錄）。
   *
   * `internalReason` 必填：沒有原因的關閉，管理員之後回頭看稽核紀錄會完全
   * 看不出當初為什麼關，直接擋掉比事後補記錄可靠。
   *
   * 已經關閉的功能再關一次視為「更新」而非「重新關閉」，`closedAt` 保留
   * 原值——不然每次改個對外說明或 ETA，畫面上的「已關閉多久」就會被歸零，
   * 那個數字會變成謊話。
   */
  function closeFeature(
    key: PlanFeatureKey,
    internalReason: string,
    publicNote: string,
    etaAt: string | null,
  ): void {
    const trimmedReason = internalReason.trim()
    if (trimmedReason === '') return

    const existing = outageOf(outages.value, key)
    const etaLabel = etaAt ? `預計恢復 ${formatDateTime(etaAt)}` : '未填預計時間'

    if (existing) {
      existing.internalReason = trimmedReason
      existing.publicNote = publicNote
      existing.etaAt = etaAt
    } else {
      outages.value.push({
        featureKey: key,
        internalReason: trimmedReason,
        publicNote,
        closedAt: new Date().toISOString(),
        etaAt,
      })
    }

    // 更新與關閉要分得出來：兩筆都寫「關閉功能」的話，稽核紀錄看起來會像
    // 關了兩次卻只恢復一次，事後想重建「這功能到底關了多久」就會誤判。
    logAction(
      '系統',
      PLAN_FEATURES[key].label,
      existing
        ? `更新維護資訊：${trimmedReason}（${etaLabel}）`
        : `關閉功能：${trimmedReason}（${etaLabel}）`,
    )
  }

  /** 恢復功能：移除維護紀錄，稽核記下這次總共關閉了多久。 */
  function reopenFeature(key: PlanFeatureKey): void {
    const existing = outageOf(outages.value, key)
    if (!existing) return

    const durationLabel = outageDurationLabel(existing)
    outages.value = outages.value.filter((item) => item.featureKey !== key)

    logAction('系統', PLAN_FEATURES[key].label, `恢復功能，共關閉 ${durationLabel}`)
  }

  return { outages, closeFeature, reopenFeature }
}

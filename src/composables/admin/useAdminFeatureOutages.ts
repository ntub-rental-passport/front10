/**
 * 功能停用的後台讀寫，存在後端（/api/admin/feature-outages），所有管理員看同一份。
 *
 * 前台用的唯讀版本在 useFeatureOutages（沒有內部原因）。稽核由後端記：
 * 關閉、更新說明、恢復（連同總共關了多久）各一筆。
 */

import { ref } from 'vue'
import { refreshPublicSettings } from '@/src/composables/usePublicSettings'
import {
  closeFeatureOutage,
  fetchAdminFeatureOutages,
  reopenFeatureOutage,
} from '@/src/services/platformSettingsApi'
import type { PlanFeatureKey } from '@/src/utils/admin-entitlements'
import type { FeatureOutage } from '@/src/utils/admin-feature-status'

const outages = ref<FeatureOutage[]>([])
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

export async function loadAdminFeatureOutages(): Promise<void> {
  loadState.value = 'loading'
  const result = await fetchAdminFeatureOutages()
  if (result) {
    outages.value = result
    loadState.value = 'ready'
  } else {
    loadState.value = 'error'
  }
}

export function useAdminFeatureOutages() {
  if (loadState.value === 'idle') void loadAdminFeatureOutages()

  /**
   * 關閉功能（或更新一筆已經在關閉中的紀錄）。內部原因必填，後端也會再檢查一次。
   * 失敗時丟出後端給的理由，畫面原樣顯示。
   */
  async function closeFeature(
    key: PlanFeatureKey,
    internalReason: string,
    publicNote: string,
    etaAt: string | null,
  ): Promise<void> {
    const saved = await closeFeatureOutage(key, { internalReason, publicNote, etaAt })
    outages.value = [...outages.value.filter((item) => item.featureKey !== key), saved]
    // 自己這台瀏覽器馬上看到效果，不等公開設定的快取過期
    void refreshPublicSettings({ force: true })
  }

  async function reopenFeature(key: PlanFeatureKey): Promise<void> {
    await reopenFeatureOutage(key)
    outages.value = outages.value.filter((item) => item.featureKey !== key)
    void refreshPublicSettings({ force: true })
  }

  return { outages, loadState, closeFeature, reopenFeature }
}

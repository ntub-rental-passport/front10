/**
 * 功能停用的唯讀讀取介面，前台用。
 *
 * 資料來自公開設定（usePublicSettings，換頁時更新），所以沒有內部原因 ——
 * 那只給管理員看，見 useAdminFeatureOutages。這個檔案會被前台 import，
 * 刻意不 import 任何後台專用的模組。
 */

import { computed, type ComputedRef } from 'vue'
import { publicSettings } from '@/src/composables/usePublicSettings'
import {
  isFeatureClosed,
  outageOf as findOutage,
  type PublicFeatureOutage,
} from '@/src/utils/admin-feature-status'
import type { PlanFeatureKey } from '@/src/utils/admin-entitlements'

export function useFeatureOutages(): {
  outages: ComputedRef<PublicFeatureOutage[]>
  isClosed: (key: PlanFeatureKey) => boolean
  outageOf: (key: PlanFeatureKey) => PublicFeatureOutage | null
} {
  const outages = computed(() => publicSettings.value.featureOutages)

  function isClosed(key: PlanFeatureKey): boolean {
    return isFeatureClosed(outages.value, key)
  }

  function outageOf(key: PlanFeatureKey): PublicFeatureOutage | null {
    return findOutage(outages.value, key)
  }

  return { outages, isClosed, outageOf }
}

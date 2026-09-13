/**
 * 功能維護開關的唯讀讀取介面。
 *
 * 這個檔案之後會被前台 import（判斷某功能是否因維護而暫停），所以刻意
 * 只放讀取邏輯，不 import 任何稽核或後台專用的模組——前台不該因為
 * 後台程式碼的變動而被牽連重新打包或出錯。
 *
 * collection 名稱不加 ADMIN_DATASET_VERSION：這份資料不與使用者／工單
 * 那幾份資料交叉引用欄位，沒有版本遷移的問題，seed 是空陣列——
 * 預設六項功能全部正常開啟，沒有任何維護中的紀錄。
 */

import { computed, type ComputedRef } from 'vue'
import { createAdminCollection } from '@/src/composables/admin/useAdminStore'
import {
  isFeatureClosed,
  outageOf as findOutage,
  type FeatureOutage,
} from '@/src/utils/admin-feature-status'
import type { PlanFeatureKey } from '@/src/utils/admin-entitlements'

export const featureOutagesCollection = createAdminCollection<FeatureOutage[]>(
  'feature-outages',
  () => [],
)

export function useFeatureOutages(): {
  outages: ComputedRef<FeatureOutage[]>
  isClosed: (key: PlanFeatureKey) => boolean
  outageOf: (key: PlanFeatureKey) => FeatureOutage | null
} {
  const outages = computed(() => featureOutagesCollection.value)

  function isClosed(key: PlanFeatureKey): boolean {
    return isFeatureClosed(outages.value, key)
  }

  function outageOf(key: PlanFeatureKey): FeatureOutage | null {
    return findOutage(outages.value, key)
  }

  return { outages, isClosed, outageOf }
}

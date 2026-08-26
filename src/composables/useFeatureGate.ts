/**
 * 目前路由該不該被功能維護開關擋住。
 *
 * 管理員角色不受攔截影響：後台把功能關掉之後，管理員自己得能點進同一個
 * 路由確認畫面長什麼樣、預計恢復時間有沒有填對——被自己設的維護狀態擋住，
 * 就只能「先開放給所有人再祈禱」。但 `isPathUnderMaintenance` 刻意不管角色，
 * 因為它是給導覽列灰掉用的：管理員也要看到灰掉的項目，否則他不知道一般
 * 使用者現在看到的是維護畫面還是正常畫面，也就無從確認設定對不對。
 */

import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { getAuthSession } from '@/src/composables/useAuth'
import { useFeatureOutages } from '@/src/composables/useFeatureOutages'
import { featureKeyForPath } from '@/src/utils/feature-routes'
import type { FeatureOutage } from '@/src/utils/admin-feature-status'

export function useFeatureGate(): {
  /** 目前路由對應的功能被維護關閉，且當前使用者不是管理員 */
  blocked: ComputedRef<boolean>
  /** 被擋住時的維護紀錄，供說明畫面顯示 */
  outage: ComputedRef<FeatureOutage | null>
  /** 指定的導覽路徑是否處於維護中（導覽列灰掉用，管理員也會看到灰掉） */
  isPathUnderMaintenance: (path: string) => boolean
} {
  const route = useRoute()
  const { outageOf } = useFeatureOutages()

  const outage = computed<FeatureOutage | null>(() => {
    const key = featureKeyForPath(route.path)
    if (!key) return null
    return outageOf(key)
  })

  const blocked = computed(() => {
    if (!outage.value) return false
    return getAuthSession()?.role !== 'admin'
  })

  function isPathUnderMaintenance(path: string): boolean {
    const key = featureKeyForPath(path)
    if (!key) return false
    return outageOf(key) !== null
  }

  return { blocked, outage, isPathUnderMaintenance }
}

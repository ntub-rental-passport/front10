<script setup lang="ts">
/**
 * 通知中心置頂的「目前維護中功能」狀態區塊。
 *
 * 刻意不放進 useNotifications 的收件匣，也刻意不計入 unreadCount、
 * 不能點擊標成已讀：
 *
 * 1. 它顯示的是「現在的狀態」，不是「發生過的事件」。狀態沒有已讀的概念——
 *    你讀過了、功能還是關著，語意上「已讀」根本沒有改變什麼。
 * 2. 維護紀錄不落地成公告，沒有地方存「這個人讀過這筆維護紀錄」。如果硬把
 *    它算進未讀數，使用者點開讀了、重新整理又變回未讀（因為壓根沒有已讀
 *    狀態可以持久化），那顆紅點永遠消不掉，看起來像壞掉。
 *
 * 絕對不顯示 outage.internalReason：那是管理員在後台看的內部原因
 * （例如「XX API 金鑰過期」），對使用者曝露內部架構細節沒有意義，
 * 這點與 FeatureMaintenanceNotice.vue 的視覺語彙與規則一致。
 */
import { computed } from 'vue'
import { Clock, Wrench } from 'lucide-vue-next'
import { useFeatureOutages } from '@/src/composables/useFeatureOutages'
import { useTickingNow } from '@/src/composables/useTickingNow'
import { closedFeatureKeys, publicEtaAt, publicNoteOf } from '@/src/utils/admin-feature-status'
import { PLAN_FEATURES } from '@/src/utils/admin-entitlements'
import { formatDateTime } from '@/src/utils/admin-format'

const { outages, outageOf } = useFeatureOutages()

// 預計恢復時間是否已過期會隨時間推移改變，需要一個會走動的 now 當依賴，
// 用法沿用 FeatureMaintenanceNotice.vue，不在這裡重寫時間判斷。
const now = useTickingNow()

const rows = computed(() =>
  closedFeatureKeys(outages.value).map((key) => {
    const outage = outageOf(key)!
    const etaAt = publicEtaAt(outage, now.value)
    return {
      key,
      label: PLAN_FEATURES[key].label,
      note: publicNoteOf(outage),
      etaLabel: etaAt ? formatDateTime(etaAt) : null,
    }
  }),
)
</script>

<template>
  <div
    v-if="rows.length > 0"
    class="space-y-3 rounded-2xl border border-amber-300 bg-amber-50/60 p-4"
  >
    <div class="flex items-center gap-2 text-sm font-semibold text-amber-800">
      <Wrench class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>服務狀態</span>
    </div>

    <div class="space-y-2">
      <div
        v-for="row in rows"
        :key="row.key"
        class="rounded-xl border border-amber-200 bg-white/70 p-3"
      >
        <p class="min-w-0 text-sm font-medium text-amber-900">{{ row.label }}維護中</p>
        <p class="mt-1 min-w-0 text-sm text-amber-800/90">{{ row.note }}</p>
        <p v-if="row.etaLabel" class="mt-1 flex items-center gap-1 text-xs text-amber-700">
          <Clock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span class="min-w-0">預計 {{ row.etaLabel }} 恢復服務</span>
        </p>
      </div>
    </div>
  </div>
</template>

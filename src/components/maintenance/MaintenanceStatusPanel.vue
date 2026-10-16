<script setup lang="ts">
/** 通知中心的維護狀態區塊，因無可持久化的已讀紀錄而不計入未讀數，且不得顯示 outage.internalReason。 */
import { computed } from 'vue'
import { Clock, Wrench } from 'lucide-vue-next'
import { useFeatureOutages } from '@/src/composables/useFeatureOutages'
import { useTickingNow } from '@/src/composables/useTickingNow'
import { closedFeatureKeys, publicEtaAt, publicNoteOf } from '@/src/utils/admin-feature-status'
import { PLAN_FEATURES } from '@/src/utils/admin-entitlements'
import { formatDateTime } from '@/src/utils/admin-format'

const { outages, outageOf } = useFeatureOutages()

// 恢復時間的過期判定須依賴會持續更新的 now，避免頁面開著時判定凍結。
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

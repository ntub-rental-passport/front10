<script setup lang="ts">
/** 維護功能路由的說明畫面，不得顯示僅供管理員查看的 outage.internalReason。 */
import { computed } from 'vue'
import { PauseCircle } from 'lucide-vue-next'
import { useTickingNow } from '@/src/composables/useTickingNow'
import { publicEtaAt, publicNoteOf, type PublicFeatureOutage } from '@/src/utils/admin-feature-status'
import { PLAN_FEATURES } from '@/src/utils/admin-entitlements'
import { formatDateTime } from '@/src/utils/admin-format'

const props = defineProps<{ outage: PublicFeatureOutage }>()

// 預計恢復時間是否已過期會隨時間推移改變，需要一個會走動的 now 當依賴，
// 否則使用者把頁面開著不動，過期判定會凍結在剛進頁面的那一刻。
const now = useTickingNow()

const featureLabel = computed(() => PLAN_FEATURES[props.outage.featureKey].label)
const noticeText = computed(() => publicNoteOf(props.outage))
const etaLabel = computed(() => {
  const eta = publicEtaAt(props.outage, now.value)
  return eta ? formatDateTime(eta) : null
})
</script>

<template>
  <div class="flex min-h-[60vh] items-center justify-center px-6 py-12">
    <div class="max-w-md space-y-5 text-center">
      <div class="mx-auto w-fit rounded-3xl bg-muted p-5 text-muted-foreground">
        <PauseCircle class="h-10 w-10" aria-hidden="true" />
      </div>

      <div class="space-y-2">
        <h1 class="text-2xl font-bold tracking-tight text-foreground">
          {{ featureLabel }}維護中
        </h1>
        <p class="text-sm text-muted-foreground">{{ noticeText }}</p>
        <p v-if="etaLabel" class="text-sm text-muted-foreground">
          預計 {{ etaLabel }} 恢復服務
        </p>
      </div>

      <p class="text-xs text-muted-foreground">
        這個網址沒有問題，資料也都還在，恢復後重新整理即可繼續使用。
      </p>
    </div>
  </div>
</template>

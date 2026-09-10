<script setup lang="ts">
/**
 * 使用者停在維護中的功能路由時顯示的說明畫面。
 *
 * 刻意做成平靜的置中空狀態，不是嚇人的錯誤頁——這是暫時的、會恢復的狀態，
 * 使用者的網址沒有錯，資料也還在，用不到「發生錯誤」那種視覺語彙。
 *
 * 絕對不顯示 outage.internalReason：那是管理員在後台看的內部原因
 * （例如「XX API 金鑰過期」），對使用者曝露內部架構細節沒有意義。
 */
import { computed } from 'vue'
import { PauseCircle } from 'lucide-vue-next'
import { useTickingNow } from '@/src/composables/useTickingNow'
import { publicEtaAt, publicNoteOf, type FeatureOutage } from '@/src/utils/admin-feature-status'
import { PLAN_FEATURES } from '@/src/utils/admin-entitlements'
import { formatDateTime } from '@/src/utils/admin-format'

const props = defineProps<{ outage: FeatureOutage }>()

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

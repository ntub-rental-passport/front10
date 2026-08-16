<script setup lang="ts">
/**
 * 功能維護開關的狀態橫幅：讓管理員在監控頁以外的地方也看得到「現在有哪些
 * 功能對使用者關著」，防止關了忘記開回來。
 *
 * 兩種模式：
 * - 不給 featureKey：總覽模式，列出全部關閉中的功能，可就地恢復。用在
 *   後台總覽這種「路過就看得到」的位置。
 * - 給 featureKey：單一功能模式，只顯示該功能且唯讀。用在有專屬後台模組
 *   的功能頁（租金補貼、點交存證），提醒正在處理案件的管理員：這功能現在
 *   對使用者是關的。刻意不放恢復按鈕——模組頁是來處理案件的，一個誤觸
 *   就解除維護狀態風險太高，恢復動作留給監控頁做。
 *
 * 條件式渲染：沒有任何要顯示的內容時整個元件不渲染。常駐橫幅的話 99%
 * 時間顯示「一切正常」，那格就變成沒人看的空氣，真的出事時反而不顯眼。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import { AlertTriangle, PauseCircle } from 'lucide-vue-next'
import { useFeatureOutages } from '@/src/composables/useFeatureOutages'
import { useAdminFeatureOutages } from '@/src/composables/admin/useAdminFeatureOutages'
import { useTickingNow } from '@/src/composables/useTickingNow'
import { PLAN_FEATURES, type PlanFeatureKey } from '@/src/utils/admin-entitlements'
import {
  closedFeatureKeys,
  isEtaPassed,
  outageDurationLabel,
  outageOf,
  publicEtaAt,
  type FeatureOutage,
} from '@/src/utils/admin-feature-status'
import { formatDateTime } from '@/src/utils/admin-format'

const props = defineProps<{
  /** 指定功能時只顯示該功能且唯讀；不指定則列出全部關閉中的功能並可就地恢復 */
  featureKey?: PlanFeatureKey
}>()

const { outages } = useFeatureOutages()
const { reopenFeature } = useAdminFeatureOutages()

// 時長與過期判定都跟現在幾點有關，見 useTickingNow 註解
const now = useTickingNow()

interface RowView {
  key: PlanFeatureKey
  label: string
  durationLabel: string
  etaLabel: string | null
  etaExpired: boolean
  internalReason: string
}

function toRowView(outage: FeatureOutage): RowView {
  const eta = publicEtaAt(outage, now.value)
  return {
    key: outage.featureKey,
    label: PLAN_FEATURES[outage.featureKey].label,
    durationLabel: outageDurationLabel(outage, now.value),
    etaLabel: eta ? formatDateTime(eta) : null,
    etaExpired: isEtaPassed(outage, now.value),
    internalReason: outage.internalReason,
  }
}

// 總覽模式：依 closedFeatureKeys 的穩定順序列出全部關閉中的功能
const overviewRows = computed<RowView[]>(() => {
  if (props.featureKey) return []
  return closedFeatureKeys(outages.value)
    .map((key) => outageOf(outages.value, key))
    .filter((outage): outage is FeatureOutage => outage !== null)
    .map(toRowView)
})

// 單一功能模式：該功能沒被關閉時不渲染
const singleRow = computed<RowView | null>(() => {
  if (!props.featureKey) return null
  const outage = outageOf(outages.value, props.featureKey)
  return outage ? toRowView(outage) : null
})

const visible = computed(() => overviewRows.value.length > 0 || singleRow.value !== null)
</script>

<template>
  <div
    v-if="visible"
    class="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
  >
    <!-- 總覽模式 -->
    <template v-if="!featureKey">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2 text-sm font-medium text-destructive">
          <PauseCircle class="h-4 w-4 shrink-0" aria-hidden="true" />
          {{ overviewRows.length }} 項功能目前對使用者關閉中
        </div>
        <RouterLink to="/admin/monitoring" class="shrink-0 text-xs text-primary hover:underline">
          前往功能開關
        </RouterLink>
      </div>

      <div
        v-for="row in overviewRows"
        :key="row.key"
        class="flex flex-col gap-2 rounded-xl border bg-background/60 p-3 sm:flex-row sm:items-start sm:justify-between"
        :class="row.etaExpired ? 'border-destructive/50' : 'border-border'"
      >
        <div class="min-w-0 space-y-1">
          <p class="font-medium">{{ row.label }}</p>
          <p class="text-sm text-muted-foreground">已關閉 {{ row.durationLabel }}</p>
          <p class="text-sm text-muted-foreground">{{ row.internalReason }}</p>
          <p v-if="row.etaExpired" class="flex items-center gap-1 text-sm font-medium text-destructive">
            <AlertTriangle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            恢復時間待更新
          </p>
          <p v-else-if="row.etaLabel" class="text-sm text-muted-foreground">
            預計恢復：{{ row.etaLabel }}
          </p>
        </div>

        <Button size="sm" class="shrink-0" @click="reopenFeature(row.key)">恢復</Button>
      </div>
    </template>

    <!-- 單一功能模式：唯讀，不放恢復按鈕 -->
    <template v-else-if="singleRow">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-start gap-2">
          <PauseCircle class="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div class="min-w-0 space-y-1 text-sm">
            <p class="font-medium text-destructive">
              此功能目前對使用者關閉中，使用者無法新增或送出。
            </p>
            <p class="text-muted-foreground">已關閉 {{ singleRow.durationLabel }}</p>
            <p class="text-muted-foreground">{{ singleRow.internalReason }}</p>
            <p
              v-if="singleRow.etaExpired"
              class="flex items-center gap-1 font-medium text-destructive"
            >
              <AlertTriangle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              恢復時間待更新
            </p>
            <p v-else-if="singleRow.etaLabel" class="text-muted-foreground">
              預計恢復：{{ singleRow.etaLabel }}
            </p>
          </div>
        </div>
        <RouterLink
          to="/admin/monitoring"
          class="shrink-0 whitespace-nowrap text-xs text-primary hover:underline"
        >
          前往監控頁處理
        </RouterLink>
      </div>
    </template>
  </div>
</template>

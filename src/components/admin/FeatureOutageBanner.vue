<script setup lang="ts">
/** 功能維護狀態橫幅：未指定 featureKey 時列出全部關閉中的功能並可恢復，指定時僅顯示該功能且唯讀。 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import { AlertTriangle, PauseCircle } from 'lucide-vue-next'
import ActionError from '@/src/components/admin/ActionError.vue'
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

// 後台版：有內部原因。前台那份（useFeatureOutages）刻意沒有
const { outages, reopenFeature } = useAdminFeatureOutages()

const actionError = ref('')

async function reopen(key: PlanFeatureKey): Promise<void> {
  actionError.value = ''
  try {
    await reopenFeature(key)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '恢復失敗，請稍後再試。'
  }
}

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

const overviewRows = computed<RowView[]>(() => {
  if (props.featureKey) return []
  return closedFeatureKeys(outages.value)
    .map((key) => outageOf(outages.value, key))
    .filter((outage): outage is FeatureOutage => outage !== null)
    .map(toRowView)
})

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

      <ActionError v-if="actionError" :message="actionError" @dismiss="actionError = ''" />

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

        <Button size="sm" class="shrink-0" @click="reopen(row.key)">恢復</Button>
      </div>
    </template>

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

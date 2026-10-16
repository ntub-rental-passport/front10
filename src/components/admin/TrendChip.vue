<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp } from 'lucide-vue-next'

import { resolveTrendDisplay, TREND_PERIOD_LABEL, type TrendPeriod } from './trend-chip'

/** 趨勢 chip：value 為 0 或未提供時不渲染，period 表示百分比的比較期間。 */
const props = withDefaults(
  defineProps<{
    value?: number
    suffix?: string
    period?: TrendPeriod
  }>(),
  { suffix: '%' },
)

const trend = computed(() => resolveTrendDisplay(props.value, props.suffix))
</script>

<template>
  <span v-if="trend" class="inline-flex items-baseline gap-1">
    <span
      :class="[
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
        trend.toneClass,
      ]"
    >
      <ArrowUp v-if="trend.direction === 'up'" :size="12" aria-hidden="true" />
      <ArrowDown v-else :size="12" aria-hidden="true" />
      {{ trend.text }}
    </span>
    <span v-if="period" class="whitespace-nowrap text-[11px] text-foreground/70">
      {{ TREND_PERIOD_LABEL[period] }}
    </span>
  </span>
</template>

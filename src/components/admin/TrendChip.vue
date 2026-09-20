<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp } from 'lucide-vue-next'

import { resolveTrendDisplay, TREND_PERIOD_LABEL, type TrendPeriod } from './trend-chip'

/**
 * 趨勢 chip：只在「真的知道升降」時顯示。
 *
 * value 是 0 或沒給值時不渲染任何東西（回 null）——沒有歷史資料可比較，
 * 顯示 +0% 反而是誤導。判斷邏輯在同資料夾的 trend-chip.ts，方便純邏輯測試。
 *
 * `period` 說明這個百分比在比什麼期間。它畫在色塊**外面**的原因是：
 * 期間是註解而不是數值，放進色塊會讓它看起來和百分比一樣重要，而且
 * 色塊一長就壓過旁邊的主數字。見 trend-chip.ts 對期間的完整說明。
 */
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

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp } from 'lucide-vue-next'
import { resolveTrendDisplay } from './trend-chip'

/**
 * 趨勢 chip：只在「真的知道升降」時顯示。
 *
 * value 是 0 或沒給值時不渲染任何東西（回 null）——沒有歷史資料可比較，
 * 顯示 +0% 反而是誤導。判斷邏輯在同資料夾的 trend-chip.ts，方便純邏輯測試。
 */
const props = withDefaults(
  defineProps<{
    value?: number
    suffix?: string
  }>(),
  { suffix: '%' },
)

const trend = computed(() => resolveTrendDisplay(props.value, props.suffix))
</script>

<template>
  <span
    v-if="trend"
    :class="[
      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
      trend.toneClass,
    ]"
  >
    <ArrowUp v-if="trend.direction === 'up'" :size="12" aria-hidden="true" />
    <ArrowDown v-else :size="12" aria-hidden="true" />
    {{ trend.text }}
  </span>
</template>

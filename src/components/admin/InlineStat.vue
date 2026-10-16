<script setup lang="ts">
import { computed, type Component } from 'vue'
import { RouterLink } from 'vue-router'

import TrendChip from './TrendChip.vue'
import type { TrendPeriod } from './trend-chip'
import { formatStatValue, resolveInlineStatVisual } from './inline-stat'

/** 標題旁的一行式 KPI，顯示圖示、標題、數值與趨勢。 */
const props = defineProps<{
  icon: Component
  label: string
  value: string | number
  /** 缺少資料不能當成零，用簡短小字交代佔位符的原因 */
  note?: string
  /** 沒有可比較的歷史資料時不要傳，TrendChip 會自己不渲染 */
  trend?: number
  /** 趨勢的比較期間；提供 trend 時應一併提供。 */
  trendPeriod?: TrendPeriod
  /** 有值才變成連結並顯示 hover 效果 */
  to?: string
  /** 主角卡使用品牌色填滿，一排只應有一張。 */
  hero?: boolean
}>()

const display = computed(() => formatStatValue(props.value))
const visual = computed(() => resolveInlineStatVisual(props.hero))
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    class="flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3"
    :class="[
      visual.containerClass,
      to ? (hero ? 'transition-opacity hover:opacity-90' : 'transition-colors hover:bg-muted/60') : undefined,
    ]"
  >
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-xl"
      :class="visual.iconClass"
      aria-hidden="true"
    >
      <component :is="icon" class="size-5" />
    </span>

    <span class="min-w-0">
      <!-- 標籤使用 foreground/70，因 muted-foreground 在頁面底色上未達小字所需的 AA 對比。 -->
      <span class="block truncate text-xs" :class="visual.labelClass">{{ label }}</span>
      <span class="flex flex-wrap items-baseline gap-x-2">
        <span class="text-2xl font-bold leading-tight tracking-tight">{{ display }}</span>
        <span v-if="note" class="text-xs" :class="visual.labelClass">{{ note }}</span>
        <TrendChip v-if="trend" :value="trend" suffix="%" :period="trendPeriod" />
      </span>
    </span>
  </component>
</template>

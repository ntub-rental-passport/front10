<script setup lang="ts">
import { computed, type Component } from 'vue'
import { RouterLink } from 'vue-router'

import TrendChip from './TrendChip.vue'
import type { TrendPeriod } from './trend-chip'
import { formatStatValue, resolveInlineStatVisual } from './inline-stat'

/**
 * 標題旁的一行式 KPI。
 *
 * ## 為什麼不用 StatTile
 *
 * StatTile 是 p-5 的方塊，一列四張實測高 156px。總覽頁的首屏原本有 43% 被
 * 標題區吃掉（第一個數字出現在 329px / 768px），那 156px 是主因之一。
 * 這個版本把 icon、標題、數字、趨勢擠進一行，高度約 56px。
 *
 * ## 為什麼一定要有 icon
 *
 * 四張並排的卡如果只有文字，掃視時長得一模一樣 —— 必須停下來讀字才知道
 * 哪張是哪張。一個圖形讓眼睛可以直接跳到要找的那張。
 *
 * ## 沒有 sublabel、沒有 sparkline
 *
 * 這個高度塞不下，硬塞只會讓每一行都變得難讀。需要那些細節的數字，
 * 應該留在下方的圖表卡裡 —— 那裡本來就有空間講清楚組成。
 */
const props = defineProps<{
  icon: Component
  label: string
  value: string | number
  /** 沒有可比較的歷史資料時不要傳，TrendChip 會自己不渲染 */
  trend?: number
  /**
   * 這個趨勢在比什麼期間。有 trend 就應該有 period —— 兩個不同基準的
   * 百分比並排而不說明期間，讀的人只能假設它們可比。
   */
  trendPeriod?: TrendPeriod
  /** 有值才變成連結並顯示 hover 效果 */
  to?: string
  /**
   * 主角卡：整塊填滿品牌色。一排只能有一張——兩張以上就等於沒有主角。
   * 樣式與理由見 inline-stat.ts 的 resolveInlineStatVisual。
   */
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
      <!--
        標籤用 foreground/70 而不是 muted-foreground：這排 KPI 沒有卡片底，
        直接坐在頁面底色上。muted-foreground 在淺色頁面底上實測只有 4.44，
        12px 文字差一點點不到 AA 的 4.5（在白色卡片上才有 4.87）。
        foreground/70 是 6.53 / 8.79，而且視覺上仍然比數字退一階。
      -->
      <span class="block truncate text-xs" :class="visual.labelClass">{{ label }}</span>
      <span class="flex flex-wrap items-baseline gap-x-2">
        <span class="text-2xl font-bold leading-tight tracking-tight">{{ display }}</span>
        <TrendChip v-if="trend" :value="trend" suffix="%" :period="trendPeriod" />
      </span>
    </span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import TrendChip from './TrendChip.vue'
import Sparkline from './Sparkline.vue'
import { resolveStatTileVisual } from './stat-tile'

/**
 * KPI 卡片的共用外殼：標籤、數值、可選的趨勢/迷你圖/鑽取箭頭。
 *
 * trend、spark 直接丟給 TrendChip、Sparkline——「資料沒有意義時要不要畫」
 * 由那兩個元件自己的規則決定（0/undefined、資料點 < 2），這裡不重複判斷。
 *
 * hero 標記一排裡的主角卡，一排只能有一張；有 to 才顯示鑽取箭頭並讓整張卡
 * 可以點進去，視覺規則在同資料夾的 stat-tile.ts。
 */
const props = defineProps<{
  label: string
  value: string | number
  sublabel?: string
  trend?: number
  spark?: number[]
  hero?: boolean
  to?: string
}>()

const visual = computed(() => resolveStatTileVisual(props.hero, props.to))
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    :class="
      cn(
        'group relative flex flex-col gap-3 rounded-2xl p-5',
        visual.containerClass,
        to ? 'transition-shadow hover:shadow-md' : undefined,
      )
    "
  >
    <ArrowUpRight
      v-if="visual.showArrow"
      :size="16"
      aria-hidden="true"
      :class="
        cn(
          'absolute right-4 top-4 transition-colors',
          hero
            ? 'text-primary-foreground/70 group-hover:text-primary-foreground'
            : 'text-muted-foreground group-hover:text-foreground',
        )
      "
    />

    <div class="flex flex-col gap-1 pr-6">
      <p :class="cn('text-sm font-medium', visual.mutedTextClass)">{{ label }}</p>
      <div class="flex flex-wrap items-baseline gap-2">
        <p class="text-2xl font-bold tabular-nums">{{ value }}</p>
        <TrendChip :value="trend" />
      </div>
      <p v-if="sublabel" :class="cn('text-xs', visual.mutedTextClass)">{{ sublabel }}</p>
    </div>

    <Sparkline v-if="spark" :points="spark" :class="visual.mutedTextClass" />
  </component>
</template>

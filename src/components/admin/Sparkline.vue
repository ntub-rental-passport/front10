<script setup lang="ts">
import { computed } from 'vue'
import { buildSparklinePoints } from './sparkline'

/**
 * 卡內迷你圖：純 SVG 折線，不引入新的圖表套件——全後台只有這一種
 * 28px 高的裝飾線需求，犯不著為它多背一個 chart library。
 *
 * 資料點少於 2 個時不渲染：一個點連不成線，硬畫只會出現一個奇怪的點或空白，
 * 不如直接不顯示。判斷邏輯在同資料夾的 sparkline.ts。
 *
 * 顏色故意不在這裡指定，用 stroke="currentColor" 跟著外層文字色走，
 * 讓同一個元件在一般卡片（muted）跟主角卡（primary-foreground）上都對。
 */
const props = withDefaults(
  defineProps<{
    points: number[]
    height?: number
  }>(),
  { height: 28 },
)

const polylinePoints = computed(() => buildSparklinePoints(props.points, props.height))
</script>

<template>
  <svg
    v-if="polylinePoints"
    :viewBox="`0 0 100 ${height}`"
    :height="height"
    preserveAspectRatio="none"
    class="w-full opacity-60"
    aria-hidden="true"
  >
    <polyline
      :points="polylinePoints"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

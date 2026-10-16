<script setup lang="ts">
import { computed } from 'vue'
import { buildSparklinePoints } from './sparkline'

/** 卡內 SVG 迷你折線圖，少於兩個資料點時不渲染，線色繼承外層文字色。 */
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

<script setup lang="ts">
import { computed } from 'vue'
import { resolveQuotaRingVisual } from './ai-quota-ring'

/**
 * 單一供應商的用量額度進度環：SVG 半圓，用 pathLength="100" 把路徑長度正規化，
 * 靠 stroke-dashoffset 畫出百分比（見規格一、設計語彙「進度環」，幾何計算在
 * 同資料夾的 ai-quota-ring.ts）。
 *
 * 進度弧顏色固定用 var(--primary)，不依額度等級（ok/warn/critical）換色——
 * 等級已經在旁邊的 QuotaProgressCard 用色塊表達過一次，這裡只負責「一眼看出
 * 還剩多少」，兩個地方都做語意變色反而互相搶戲。
 */
const props = defineProps<{
  label: string
  percent: number
  unset: boolean
}>()

const visual = computed(() => resolveQuotaRingVisual(props.percent, props.unset))

// 半圓路徑：viewBox 0 0 100 60 內、圓心 (50,50)、半徑 42，從左端點到右端點沿上緣掃過去
const ARC = 'M8,50 A42,42 0 0 1 92,50'
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <svg viewBox="0 0 100 60" class="w-full max-w-32" aria-hidden="true">
      <path :d="ARC" fill="none" stroke="var(--muted)" stroke-width="10" stroke-linecap="round" />
      <path
        :d="ARC"
        fill="none"
        stroke="var(--primary)"
        stroke-width="10"
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray="100"
        :stroke-dashoffset="visual.dashOffset"
      />
      <text
        x="50"
        y="46"
        text-anchor="middle"
        class="fill-current text-foreground text-sm font-bold"
      >
        {{ visual.displayText }}
      </text>
    </svg>
    <p class="truncate text-xs text-muted-foreground">{{ label }}</p>
  </div>
</template>

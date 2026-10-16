<script setup lang="ts">
import { computed } from 'vue'
import { resolveQuotaRingVisual } from './ai-quota-ring'

/** 單一供應商的 SVG 半圓額度進度環，以 pathLength="100" 與 stroke-dashoffset 表示百分比。 */
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

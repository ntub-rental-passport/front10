<script setup lang="ts">
/**
 * 趨勢面積圖卡。
 *
 * 單一序列、單一顏色、淡填充 —— 趨勢圖要說的是形狀，不是配色。
 * 顏色一律經由 CSS token 取得，主題或深色模式改動時自動跟上。
 */
import { computed, onMounted, ref } from 'vue'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { chartColor } from '@/src/constants/admin-chart'
import type { TrendPoint } from '@/src/utils/admin-overview'

ChartJS.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip)

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    points: TrendPoint[]
    /** 右上角的摘要文字，例如「本週 14 件」 */
    summary?: string
    height?: string
    /** 曲線張力，0 是折線、0.35 是平滑 */
    tension?: number
  }>(),
  { height: 'h-64', tension: 0.35 },
)

// CSS 變數要等元件掛載後才讀得到，掛載前先用 fallback
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const chartData = computed<ChartData<'line'>>(() => {
  void mounted.value
  return {
    labels: props.points.map((point) => point.label),
    datasets: [
      {
        data: props.points.map((point) => point.value),
        borderColor: chartColor('series-1'),
        backgroundColor: chartColor('fill'),
        borderWidth: 2,
        fill: true,
        tension: props.tension,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: chartColor('series-1'),
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
      },
    ],
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => {
  void mounted.value
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { displayColors: false },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: chartColor('label'), maxRotation: 0, autoSkipPadding: 16 },
      },
      y: {
        beginAtZero: true,
        grid: { color: chartColor('grid') },
        border: { display: false },
        ticks: { color: chartColor('label'), precision: 0, maxTicksLimit: 5 },
      },
    },
  }
})
</script>

<template>
  <Card class="h-full rounded-3xl border-border/70 bg-background/90 shadow-sm">
    <CardHeader class="flex flex-row items-start justify-between space-y-0 pb-2">
      <div>
        <CardTitle class="text-sm font-medium">{{ title }}</CardTitle>
        <p v-if="description" class="mt-1 text-xs text-muted-foreground">{{ description }}</p>
      </div>
      <span
        v-if="summary"
        class="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
      >
        {{ summary }}
      </span>
    </CardHeader>
    <CardContent>
      <div :class="['relative', height]">
        <Line :data="chartData" :options="chartOptions" />
      </div>
    </CardContent>
  </Card>
</template>

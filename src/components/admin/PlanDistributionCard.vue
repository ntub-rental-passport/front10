<script setup lang="ts">
/**
 * 訂閱方案分布甜甜圈。
 *
 * 標籤直接畫在圖上，不另外列圖例 —— 但因此弧段本身必須可點，
 * 否則「點方案可篩選」會跟著圖例一起消失。
 */
import { computed, ref } from 'vue'
import {
  ArcElement,
  Chart as ChartJS,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import { Doughnut } from 'vue-chartjs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { chartColor } from '@/src/constants/admin-chart'
import type { PlanDistributionSegment } from '@/src/utils/admin-user-directory'

ChartJS.register(ArcElement, Tooltip)

const props = defineProps<{
  segments: PlanDistributionSegment[]
  colors: string[]
  total: number
  /** 目前生效的方案篩選，'all' 代表沒有篩選 */
  activePlan: string
}>()

const emit = defineEmits<{ select: [planId: PlanDistributionSegment['planId']] }>()

const hasData = computed(() => props.segments.some((segment) => segment.value > 0))

const colorOf = (index: number): string => props.colors[index % props.colors.length]

/** 只畫有數量的段，零的段畫出來只會讓標籤擠在一起 */
const visible = computed(() =>
  props.segments
    .map((segment, index) => ({ ...segment, color: colorOf(index) }))
    .filter((segment) => segment.value > 0),
)

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: hasData.value ? visible.value.map((segment) => segment.label) : ['無資料'],
  datasets: [
    {
      data: hasData.value ? visible.value.map((segment) => segment.value) : [1],
      backgroundColor: hasData.value ? visible.value.map((segment) => segment.color) : ['#E2E8F0'],
      borderColor: '#ffffff',
      borderWidth: 2,
      // 被選中的那一段推出來，取代原本圖例上的反白
      offset: hasData.value
        ? visible.value.map((segment) => (segment.planId === props.activePlan ? 8 : 0))
        : [0],
    },
  ],
}))

/**
 * 把「方案名 數量」畫在各段外側，並用短引線連回弧段。
 *
 * 不畫在環內是因為環很細（cutout 62% 之下只有十幾像素），文字塞不進去；
 * 畫在外側才讀得到，代價是要留白給標籤，所以 layout.padding 開得比較大。
 */
const labelPlugin = computed<Plugin<'doughnut'>>(() => ({
  id: 'planArcLabels',
  afterDatasetsDraw(chart) {
    if (!hasData.value) return
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)

    ctx.save()
    ctx.font = '500 12px "Geist Variable", sans-serif'
    ctx.textBaseline = 'middle'

    meta.data.forEach((element, index) => {
      const segment = visible.value[index]
      if (!segment) return

      const arc = element as unknown as {
        x: number
        y: number
        outerRadius: number
        startAngle: number
        endAngle: number
      }
      const angle = (arc.startAngle + arc.endAngle) / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      const from = { x: arc.x + cos * arc.outerRadius, y: arc.y + sin * arc.outerRadius }
      const bend = { x: arc.x + cos * (arc.outerRadius + 12), y: arc.y + sin * (arc.outerRadius + 12) }
      const toRight = cos >= 0
      const end = { x: bend.x + (toRight ? 10 : -10), y: bend.y }

      ctx.strokeStyle = chartColor('grid')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(bend.x, bend.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

      ctx.textAlign = toRight ? 'left' : 'right'
      ctx.fillStyle = chartColor('label')
      ctx.fillText(segment.label, end.x + (toRight ? 4 : -4), end.y - 7)
      ctx.fillStyle = segment.color
      ctx.font = '700 13px "Geist Variable", sans-serif'
      ctx.fillText(String(segment.value), end.x + (toRight ? 4 : -4), end.y + 8)
      ctx.font = '500 12px "Geist Variable", sans-serif'
    })

    ctx.restore()
  },
}))

const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  cutout: '62%',
  responsive: true,
  maintainAspectRatio: false,
  // 留白給外側標籤，否則長標籤會被畫布裁掉
  layout: { padding: { top: 24, bottom: 24, left: 72, right: 72 } },
  plugins: {
    legend: { display: false },
    tooltip: { enabled: hasData.value },
  },
}))

/**
 * 點擊與游標自己處理，不走 options.onClick。
 *
 * 實測 options 上的 onClick／onHover 在這個組合下完全不會被呼叫（事件確實有到
 * canvas，但處理器沒觸發），與其追框架層的原因，不如直接拿 chart 實例做命中判定 ——
 * 結果確定，而且少一層黑箱。
 */
const chartRef = ref<{ chart?: ChartJS<'doughnut'> } | null>(null)

function segmentAt(event: MouseEvent): PlanDistributionSegment | null {
  const chart = chartRef.value?.chart
  if (!chart) return null
  const hits = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false)
  return visible.value[hits[0]?.index ?? -1] ?? null
}

function handleChartClick(event: MouseEvent): void {
  const segment = segmentAt(event)
  if (segment) emit('select', segment.planId)
}

function handleChartMove(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement
  target.style.cursor = segmentAt(event) ? 'pointer' : 'default'
}
</script>

<template>
  <Card class="h-full rounded-3xl border-border/70 bg-background/90 shadow-sm">
    <CardHeader class="pb-2">
      <CardTitle class="text-sm font-medium">訂閱方案分布</CardTitle>
      <p class="text-xs text-muted-foreground">全部 {{ total }} 位使用者，點方案可篩選</p>
    </CardHeader>
    <CardContent>
      <div class="relative h-64" @click="handleChartClick" @mousemove="handleChartMove">
        <Doughnut ref="chartRef" :data="chartData" :options="chartOptions" :plugins="[labelPlugin]" />
        <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-3xl font-black leading-none">{{ total }}</span>
          <span class="mt-1 text-xs text-muted-foreground">位使用者</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

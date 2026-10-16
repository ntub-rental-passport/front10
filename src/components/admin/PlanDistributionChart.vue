<script setup lang="ts">
/** 列表與總覽共用的方案分布甜甜圈圖，弧段可點擊以篩選方案。 */
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
import type { PlanRole } from '@/src/utils/subscription-plans'
import { chartColor } from '@/src/constants/admin-chart'
import type { PlanDistributionSegment } from '@/src/utils/admin-user-directory'

ChartJS.register(ArcElement, Tooltip)

const props = defineProps<{
  role: PlanRole
  segments: PlanDistributionSegment[]
  colors: string[]
  /** 目前生效的方案篩選，'all' 代表沒有篩選 */
  activePlan: string
}>()

const emit = defineEmits<{ select: [planKey: PlanDistributionSegment['planKey']] }>()
const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0))

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
      offset: hasData.value
        ? visible.value.map((segment) =>
            `${props.role}-${segment.planKey}` === props.activePlan ? 8 : 0,
          )
        : [0],
    },
  ],
}))

/** 環內空間不足以容納文字，標籤需畫在弧段外側並由 layout.padding 預留空間。 */
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
      const bend = {
        x: arc.x + cos * (arc.outerRadius + 12),
        y: arc.y + sin * (arc.outerRadius + 12),
      }
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
  layout: { padding: { top: 18, bottom: 18, left: 108, right: 108 } },
  plugins: {
    legend: { display: false },
    tooltip: { enabled: hasData.value },
  },
}))

/** 此組合不會觸發 options.onClick／onHover，需從外層事件取得 chart 實例做命中判定。 */
const chartRef = ref<{ chart?: ChartJS<'doughnut'> } | null>(null)

function segmentAt(event: MouseEvent): PlanDistributionSegment | null {
  const chart = chartRef.value?.chart
  if (!chart) return null
  const hits = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false)
  return visible.value[hits[0]?.index ?? -1] ?? null
}

function handleChartClick(event: MouseEvent): void {
  const segment = segmentAt(event)
  if (segment) emit('select', segment.planKey)
}

function handleChartMove(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement
  target.style.cursor = segmentAt(event) ? 'pointer' : 'default'
}
</script>

<template>
  <div class="relative h-48" @click="handleChartClick" @mousemove="handleChartMove">
    <Doughnut ref="chartRef" :data="chartData" :options="chartOptions" :plugins="[labelPlugin]" />
    <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span class="text-2xl font-black leading-none">{{ total }}</span>
      <span class="mt-0.5 text-[11px] text-muted-foreground">位使用者</span>
    </div>
  </div>
</template>

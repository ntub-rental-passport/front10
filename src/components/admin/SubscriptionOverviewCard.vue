<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import type { PlanDistributionSegment, UserDirectoryRow } from '@/src/utils/admin-user-directory'
import { planDistribution } from '@/src/utils/admin-user-directory'
import { planFilterQuery } from '@/src/utils/admin-plan-filter'
import type { PlanKey, PlanRole } from '@/src/utils/subscription-plans'
import { chartColor } from '@/src/constants/admin-chart'
import { useNow } from '@/src/composables/useNow'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  rows: UserDirectoryRow[]
}>()
const router = useRouter()
const now = useNow()
const role = defineModel<PlanRole>('role', { default: 'landlord' })
const segments = computed(() => planDistribution(props.rows, role.value, now.value))
const total = computed(() => segments.value.reduce((sum, segment) => sum + segment.value, 0))
const trialCount = computed(() =>
  segments.value.reduce((sum, segment) => sum + segment.trialCount, 0),
)
const planColors = computed(() => [
  chartColor('series-3'),
  chartColor('series-2'),
  chartColor('series-1'),
])
const chartData = computed<ChartData<'bar'>>(() => ({
  labels: segments.value.map((segment) => segment.label),
  datasets: [
    {
      data: segments.value.map((segment) => segment.value),
      backgroundColor: segments.value.map((_, index) => planColors.value[index]),
      borderRadius: 4,
      maxBarThickness: 48,
    },
  ],
}))
const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'nearest', intersect: true },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (item) => {
          const trial = segments.value[item.dataIndex]?.trialCount ?? 0
          return `${item.label}：${item.parsed.y ?? 0} 位${trial > 0 ? `（試用 ${trial} 位）` : ''}`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: chartColor('label'), font: { size: 11 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartColor('grid') },
      ticks: {
        color: chartColor('label'),
        font: { size: 11 },
        precision: 0,
      },
    },
  },
}))

// 與甜甜圈一樣，從 wrapper 事件取得 chart 實例做命中判定。
const chartRef = ref<{ chart?: ChartJS<'bar'> } | null>(null)

function segmentAt(event: MouseEvent): PlanDistributionSegment | null {
  const chart = chartRef.value?.chart
  if (!chart) return null
  const hits = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false)
  return segments.value[hits[0]?.index ?? -1] ?? null
}

function handleChartClick(event: MouseEvent): void {
  const segment = segmentAt(event)
  if (segment) selectPlan(segment.planKey)
}

function handleChartMove(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement
  target.style.cursor = segmentAt(event) ? 'pointer' : 'default'
}

function selectPlan(planKey: PlanKey): void {
  void router.push({
    path: '/admin/users',
    query: planFilterQuery(role.value, planKey),
  })
}
</script>

<template>
  <Card class="min-w-0 rounded-3xl border-border/70 bg-background/90 shadow-sm">
    <CardHeader class="p-5 pb-2">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex gap-1" role="group" aria-label="方案角色">
          <Button
            size="sm"
            :variant="role === 'landlord' ? 'secondary' : 'ghost'"
            :aria-pressed="role === 'landlord'"
            @click="role = 'landlord'"
            >房東</Button
          >
          <Button
            size="sm"
            :variant="role === 'tenant' ? 'secondary' : 'ghost'"
            :aria-pressed="role === 'tenant'"
            @click="role = 'tenant'"
            >租客</Button
          >
        </div>
        <CardTitle class="text-sm font-medium">訂閱</CardTitle>
      </div>
    </CardHeader>
    <CardContent class="grid min-w-0 gap-6 px-5 pb-5">
      <div class="min-w-0">
        <p class="text-sm font-medium">各方案訂閱人數</p>
        <p class="text-xs text-muted-foreground">
          全部 {{ total }} 位{{ role === 'landlord' ? '房東' : '租客' }}，點方案可篩選
        </p>
        <p v-if="trialCount > 0" class="text-xs text-muted-foreground">
          其中 {{ trialCount }} 位試用中
        </p>
        <div class="relative h-60 min-w-0" @click="handleChartClick" @mousemove="handleChartMove">
          <Bar ref="chartRef" :data="chartData" :options="chartOptions" />
        </div>
      </div>
    </CardContent>
  </Card>
</template>

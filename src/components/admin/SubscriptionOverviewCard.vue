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
  type Plugin,
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
import type { Subscription } from '@/src/mocks/admin/subscription'
import { monthlyCheckPackPurchases } from '@/src/utils/admin-addon-purchases'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  rows: UserDirectoryRow[]
  subscriptions: Subscription[]
}>()
const router = useRouter()
const now = useNow()
const role = defineModel<PlanRole>('role', { default: 'landlord' })
const segments = computed(() => planDistribution(props.rows, role.value, now.value))
const purchaseMonths = computed(() => monthlyCheckPackPurchases(props.subscriptions, now.value))
const hasPurchases = computed(() => purchaseMonths.value.some((month) => month.packs > 0))

function barLabelPlugin(drawZeros: boolean): Plugin<'bar'> {
  return {
    id: 'barValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      ctx.save()
      ctx.font = '500 12px "Geist Variable", sans-serif'
      ctx.fillStyle = chartColor('label')
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        chart.getDatasetMeta(datasetIndex).data.forEach((element, index) => {
          const value = dataset.data[index]
          if (typeof value !== 'number' || (!drawZeros && value === 0)) return
          const bar = element as BarElement
          ctx.fillText(String(value), bar.x, bar.y - 6)
        })
      })
      ctx.restore()
    },
  }
}

const planLabelPlugin = barLabelPlugin(true)
const purchaseLabelPlugin = barLabelPlugin(false)
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
  layout: { padding: { top: 24 } },
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
      suggestedMax: Math.max(
        1,
        Math.ceil(Math.max(...segments.value.map((segment) => segment.value)) * 1.15),
      ),
      grid: { color: chartColor('grid') },
      ticks: {
        color: chartColor('label'),
        font: { size: 11 },
        precision: 0,
      },
    },
  },
}))

const purchaseChartData = computed<ChartData<'bar'>>(() => ({
  labels: purchaseMonths.value.map((month) => month.label),
  datasets: [
    {
      data: purchaseMonths.value.map((month) => month.packs),
      backgroundColor: chartColor('attention'),
      borderRadius: 4,
      maxBarThickness: 48,
    },
  ],
}))
const purchaseChartOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 24 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (item) => `${item.label}：${item.parsed.y ?? 0} 包`,
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
      suggestedMax: Math.max(
        1,
        Math.ceil(Math.max(...purchaseMonths.value.map((month) => month.packs)) * 1.15),
      ),
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
    <CardContent
      class="grid min-w-0 gap-6 px-5 pb-5"
      :class="{ 'md:grid-cols-2': role === 'tenant' }"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium">各方案訂閱人數</p>
        <div class="relative h-60 min-w-0" @click="handleChartClick" @mousemove="handleChartMove">
          <Bar
            ref="chartRef"
            :data="chartData"
            :options="chartOptions"
            :plugins="[planLabelPlugin]"
          />
        </div>
      </div>
      <div v-if="role === 'tenant'" class="min-w-0">
        <p class="text-sm font-medium">單次加購</p>
        <p class="text-xs text-muted-foreground">
          近 12 個月每月購買的契約檢查包數量（不含管理員贈送）
        </p>
        <div v-if="hasPurchases" class="relative h-60 min-w-0">
          <Bar
            :data="purchaseChartData"
            :options="purchaseChartOptions"
            :plugins="[purchaseLabelPlugin]"
          />
        </div>
        <div v-else class="flex h-60 items-center justify-center text-sm text-muted-foreground">
          目前沒有加購紀錄
        </div>
      </div>
    </CardContent>
  </Card>
</template>

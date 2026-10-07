<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import type { UserDirectoryRow } from '@/src/utils/admin-user-directory'
import { planFilterQuery } from '@/src/utils/admin-plan-filter'
import { subscriptionPlans, type PlanKey, type PlanRole } from '@/src/utils/subscription-plans'
import { chartColor } from '@/src/constants/admin-chart'
import { useNow } from '@/src/composables/useNow'
import type { Subscription } from '@/src/mocks/admin/subscription'
import { monthlyCheckPackPurchases } from '@/src/utils/admin-addon-purchases'
import { monthlyPlanCounts } from '@/src/utils/admin-plan-history'

ChartJS.register(
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
)

const props = defineProps<{
  rows: UserDirectoryRow[]
  subscriptions: Subscription[]
}>()
const router = useRouter()
const now = useNow()
const role = defineModel<PlanRole>('role', { default: 'landlord' })
const planMonths = computed(() => monthlyPlanCounts(props.rows, role.value, now.value))
const purchaseMonths = computed(() => monthlyCheckPackPurchases(props.subscriptions, now.value))
const planKeys: PlanKey[] = ['free', 'plus', 'pro']

const valueLabelPlugin: Plugin<'bar' | 'line'> = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    ctx.save()
    ctx.font = '500 12px "Geist Variable", sans-serif'
    ctx.fillStyle = chartColor('label')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    chart.data.labels?.forEach((_, index) => {
      let total = 0
      let x = 0
      let y = Infinity
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (dataset.type !== 'bar') return
        const value = dataset.data[index]
        const element = chart.getDatasetMeta(datasetIndex).data[index]
        if (typeof value !== 'number' || !element) return
        total += value
        x = element.x
        y = Math.min(y, element.y)
      })
      if (total > 0) ctx.fillText(String(total), x, y - 6)
    })
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (dataset.type !== 'line') return
      chart.getDatasetMeta(datasetIndex).data.forEach((element, index) => {
        const value = dataset.data[index]
        if (typeof value === 'number' && value !== 0) {
          ctx.fillText(String(value), element.x, element.y - 6)
        }
      })
    })
    ctx.restore()
  },
}

const chartData = computed<ChartData<'bar' | 'line'>>(() => {
  const colors = [chartColor('series-3'), chartColor('series-2'), chartColor('series-1')]
  const datasets: ChartData<'bar' | 'line'>['datasets'] = subscriptionPlans[role.value].map(
    (plan, index) => ({
      type: 'bar',
      label: plan.name,
      data: planMonths.value.map((month) => month.counts[plan.key]),
      backgroundColor: colors[index],
      stack: 'plans',
      yAxisID: 'y',
      borderRadius: 4,
      maxBarThickness: 36,
      order: 1,
    }),
  )
  if (role.value === 'tenant') {
    datasets.push({
      type: 'line',
      label: '單次加購',
      data: purchaseMonths.value.map((month) => month.packs),
      yAxisID: 'y1',
      borderColor: chartColor('attention'),
      pointBackgroundColor: chartColor('attention'),
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      order: 0,
      fill: false,
    })
  }
  return { labels: planMonths.value.map((month) => month.label), datasets }
})
const chartOptions = computed<ChartOptions<'bar' | 'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 24 } },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: chartColor('label'), boxWidth: 12 },
    },
    tooltip: {
      callbacks: {
        label: (item) =>
          item.dataset.type === 'line'
            ? `${item.parsed.y ?? 0} 包`
            : `${item.dataset.label}：${item.parsed.y ?? 0} 位`,
        footer: (items) => {
          const total = items.reduce(
            (sum, item) => sum + (item.dataset.type === 'bar' ? (item.parsed.y ?? 0) : 0),
            0,
          )
          return `合計：${total} 位`
        },
      },
    },
  },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      ticks: { color: chartColor('label'), font: { size: 11 } },
    },
    y: {
      stacked: true,
      beginAtZero: true,
      suggestedMax: Math.max(
        1,
        Math.ceil(
          Math.max(
            ...planMonths.value.map((month) =>
              planKeys.reduce((sum, key) => sum + month.counts[key], 0),
            ),
          ) * 1.15,
        ),
      ),
      title: { display: true, text: '人數', color: chartColor('label') },
      grid: { color: chartColor('grid') },
      ticks: { color: chartColor('label'), font: { size: 11 }, precision: 0 },
    },
    ...(role.value === 'tenant'
      ? {
          y1: {
            position: 'right' as const,
            beginAtZero: true,
            suggestedMax: Math.max(
              1,
              Math.ceil(Math.max(...purchaseMonths.value.map((month) => month.packs)) * 1.15),
            ),
            title: { display: true, text: '加購包數', color: chartColor('label') },
            grid: { drawOnChartArea: false },
            ticks: { color: chartColor('label'), font: { size: 11 }, precision: 0 },
          },
        }
      : {}),
  },
}))

// 從 wrapper 事件取得 chart 實例做命中判定。
const chartRef = ref<{ chart?: ChartJS<'bar' | 'line'> } | null>(null)

function planAt(event: MouseEvent): PlanKey | null {
  const chart = chartRef.value?.chart
  if (!chart) return null
  const hits = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false)
  return planKeys[hits[0]?.datasetIndex ?? -1] ?? null
}

function handleChartClick(event: MouseEvent): void {
  const planKey = planAt(event)
  if (planKey) selectPlan(planKey)
}

function handleChartMove(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement
  target.style.cursor = planAt(event) ? 'pointer' : 'default'
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
    <CardContent class="min-w-0 px-5 pb-5">
      <div class="min-w-0">
        <p class="text-sm font-medium">
          {{ role === 'tenant' ? '各方案訂閱人數與單次加購' : '各方案訂閱人數' }}
        </p>
        <p class="text-xs text-muted-foreground">
          近 12 個月各月月底人數，本月為今日；點長條可篩選方案
        </p>
        <div class="relative h-72 min-w-0" @click="handleChartClick" @mousemove="handleChartMove">
          <Bar
            ref="chartRef"
            :data="chartData as ChartData<'bar'>"
            :options="chartOptions as ChartOptions<'bar'>"
            :plugins="[valueLabelPlugin as Plugin<'bar'>]"
          />
        </div>
      </div>
    </CardContent>
  </Card>
</template>

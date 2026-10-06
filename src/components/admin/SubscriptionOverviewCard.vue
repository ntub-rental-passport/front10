<script setup lang="ts">
import { computed } from 'vue'
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
import PlanDistributionChart from './PlanDistributionChart.vue'
import type { UserDirectoryRow } from '@/src/utils/admin-user-directory'
import { planDistribution } from '@/src/utils/admin-user-directory'
import { planFilterQuery } from '@/src/utils/admin-plan-filter'
import { monthlyRevenue } from '@/src/utils/admin-revenue'
import type { Subscription } from '@/src/mocks/admin/subscription'
import type { PlanKey, PlanRole } from '@/src/utils/subscription-plans'
import { chartColor } from '@/src/constants/admin-chart'
import { useNow } from '@/src/composables/useNow'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  rows: UserDirectoryRow[]
  subscriptions: Subscription[]
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
const revenue = computed(() => monthlyRevenue(props.subscriptions, role.value, now.value))
const hasRevenue = computed(() => revenue.value.months.some((month) => month.total > 0))
const currency = (amount: number) => `NT$${amount.toLocaleString('zh-TW')}`
const chartData = computed<ChartData<'bar'>>(() => ({
  labels: revenue.value.months.map((month) => month.label),
  datasets: revenue.value.series.map((series) => ({
    label: series.label,
    data: revenue.value.months.map((month) => month[series.key]),
    backgroundColor: chartColor(
      series.key === 'plus' ? 'series-2' : series.key === 'pro' ? 'series-1' : 'attention',
    ),
    borderRadius: 4,
    maxBarThickness: 28,
  })),
}))
const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'bottom', labels: { color: chartColor('label'), boxWidth: 12 } },
    tooltip: {
      callbacks: {
        label: (item) => `${item.dataset.label}：${currency(item.parsed.y ?? 0)}`,
        footer: (items) =>
          `合計：${currency(items.reduce((sum, item) => sum + (item.parsed.y ?? 0), 0))}`,
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
      grid: { color: chartColor('grid') },
      ticks: {
        color: chartColor('label'),
        font: { size: 11 },
        precision: 0,
        callback: (value) => currency(Number(value)),
      },
    },
  },
}))

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
    <CardContent class="grid min-w-0 gap-6 px-5 pb-5 md:grid-cols-2">
      <div class="min-w-0">
        <p class="text-sm font-medium">各方案訂閱人數</p>
        <p class="text-xs text-muted-foreground">
          全部 {{ total }} 位{{ role === 'landlord' ? '房東' : '租客' }}，點方案可篩選
        </p>
        <p v-if="trialCount > 0" class="text-xs text-muted-foreground">
          其中 {{ trialCount }} 位試用中
        </p>
        <PlanDistributionChart
          :role="role"
          :segments="segments"
          :colors="planColors"
          active-plan="all"
          @select="selectPlan"
        />
      </div>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium">訂閱收款</p>
          <p class="text-sm font-medium">本月收款 {{ currency(revenue.currentMonthTotal) }}</p>
        </div>
        <p class="text-xs text-muted-foreground">近 12 個月實收金額（含稅）；年繳全額記於扣款月</p>
        <div v-if="hasRevenue" class="relative h-60 min-w-0">
          <Bar :data="chartData" :options="chartOptions" />
        </div>
        <p v-else class="flex h-60 items-center justify-center text-sm text-muted-foreground">
          目前沒有收款紀錄
        </p>
      </div>
    </CardContent>
  </Card>
</template>

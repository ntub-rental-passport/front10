<script setup lang="ts">
/**
 * 訂閱方案分布甜甜圈。
 *
 * 與總覽頁的 DonutStatCard 長得像，但行為相反：那張整片是連結，
 * 這張的每一段是篩選開關 —— 點方案就把下方列表篩成那個方案的人。
 */
import { computed } from 'vue'
import { ArcElement, Chart as ChartJS, Tooltip, type ChartData, type ChartOptions } from 'chart.js'
import { Doughnut } from 'vue-chartjs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
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

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: hasData.value ? props.segments.map((segment) => segment.label) : ['無資料'],
  datasets: [
    {
      data: hasData.value ? props.segments.map((segment) => segment.value) : [1],
      backgroundColor: hasData.value ? props.segments.map((_, i) => colorOf(i)) : ['#E2E8F0'],
      borderColor: '#ffffff',
      borderWidth: 2,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  cutout: '72%',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: hasData.value },
  },
}))
</script>

<template>
  <Card class="h-full rounded-3xl border-border/70 bg-background/90 shadow-sm">
    <CardHeader class="pb-2">
      <CardTitle class="text-sm font-medium">訂閱方案分布</CardTitle>
      <p class="text-xs text-muted-foreground">全部 {{ total }} 位使用者，點方案可篩選</p>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="relative h-36">
        <Doughnut :data="chartData" :options="chartOptions" />
        <div
          class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span class="text-3xl font-black leading-none">{{ total }}</span>
          <span class="mt-1 text-xs text-muted-foreground">位使用者</span>
        </div>
      </div>

      <ul class="space-y-1 text-xs">
        <li v-for="(segment, index) in segments" :key="segment.planId">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-muted"
            :class="activePlan === segment.planId ? 'bg-muted font-semibold' : ''"
            :aria-pressed="activePlan === segment.planId"
            @click="emit('select', segment.planId)"
          >
            <span class="flex items-center gap-2 text-muted-foreground">
              <span
                class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: colorOf(index) }"
              />
              {{ segment.label }}
            </span>
            <span class="font-semibold text-foreground">{{ segment.value }}</span>
          </button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>

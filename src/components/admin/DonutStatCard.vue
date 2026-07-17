<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArcElement,
  Chart as ChartJS,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Doughnut } from 'vue-chartjs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'

ChartJS.register(ArcElement, Tooltip)

export interface DonutSegment {
  label: string
  value: number
  color: string
}

const props = defineProps<{
  title: string
  to: string
  centerValue: number
  centerLabel: string
  segments: DonutSegment[]
  note?: string
}>()

const hasData = computed(() => props.segments.some((segment) => segment.value > 0))

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: hasData.value ? props.segments.map((segment) => segment.label) : ['無資料'],
  datasets: [
    {
      data: hasData.value ? props.segments.map((segment) => segment.value) : [1],
      backgroundColor: hasData.value
        ? props.segments.map((segment) => segment.color)
        : ['#E2E8F0'],
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
  <RouterLink :to="to" class="block">
    <Card class="h-full rounded-[1.5rem] border-border/70 bg-background/90 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-medium">{{ title }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="relative h-36">
          <Doughnut :data="chartData" :options="chartOptions" />
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-3xl font-black leading-none">{{ centerValue }}</span>
            <span class="mt-1 text-xs text-muted-foreground">{{ centerLabel }}</span>
          </div>
        </div>
        <ul class="space-y-1 text-xs">
          <li
            v-for="segment in segments"
            :key="segment.label"
            class="flex items-center justify-between text-muted-foreground"
          >
            <span class="flex items-center gap-2">
              <span
                class="inline-block h-2.5 w-2.5 rounded-full"
                :style="{ backgroundColor: segment.color }"
              />
              {{ segment.label }}
            </span>
            <span class="font-semibold text-foreground">{{ segment.value }}</span>
          </li>
        </ul>
        <p v-if="note" class="text-xs text-muted-foreground">{{ note }}</p>
      </CardContent>
    </Card>
  </RouterLink>
</template>

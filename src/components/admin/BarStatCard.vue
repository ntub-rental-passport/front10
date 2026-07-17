<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import { Badge } from '@/components/ui/badge/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

const props = defineProps<{
  title: string
  to: string
  labels: string[]
  values: number[]
  colors: string[]
  cornerText: string
  cornerVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
}>()

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      backgroundColor: props.colors,
      borderRadius: 4,
      maxBarThickness: 28,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#64748B', font: { size: 11 } },
    },
    y: {
      beginAtZero: true,
      suggestedMax: Math.max(...props.values, 1),
      grid: { color: 'rgba(100, 116, 139, 0.12)' },
      ticks: { color: '#64748B', font: { size: 11 }, precision: 0 },
    },
  },
}))
</script>

<template>
  <RouterLink :to="to" class="block">
    <Card class="h-full rounded-[1.5rem] border-border/70 bg-background/90 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">{{ title }}</CardTitle>
        <Badge :variant="cornerVariant ?? 'secondary'">{{ cornerText }}</Badge>
      </CardHeader>
      <CardContent>
        <div class="h-[13.25rem]">
          <Bar :data="chartData" :options="chartOptions" />
        </div>
      </CardContent>
    </Card>
  </RouterLink>
</template>

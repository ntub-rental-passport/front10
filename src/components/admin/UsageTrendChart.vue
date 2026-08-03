<script setup lang="ts">
import { computed } from 'vue'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Legend, Tooltip)

const props = defineProps<{
  labels: string[]
  series: Array<{ label: string; values: number[]; color: string }>
}>()

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.labels,
  datasets: props.series.map((item) => ({
    label: item.label,
    data: item.values,
    borderColor: item.color,
    backgroundColor: item.color,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.3,
  })),
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: { enabled: true },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#64748B', font: { size: 10 }, maxTicksLimit: 10 },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(100, 116, 139, 0.12)' },
      ticks: { color: '#64748B', font: { size: 11 }, precision: 0 },
    },
  },
}))
</script>

<template>
  <div class="h-[16rem]">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

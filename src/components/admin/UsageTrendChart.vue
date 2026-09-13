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
    tooltip: {
      enabled: true,
      callbacks: {
        // 數值已改成佔月額度的百分比，保留一位小數 —— 這裡的數字通常落在
        // 0–5% 之間，取整數會全部變成同一個值，失去可比較的解析度。
        label: (context) => {
          const value = typeof context.parsed.y === 'number' ? context.parsed.y : 0
          return `${context.dataset.label ?? ''}: ${value.toFixed(1)}%`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#64748B', font: { size: 10 }, maxTicksLimit: 10 },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(100, 116, 139, 0.12)' },
      ticks: {
        color: '#64748B',
        font: { size: 11 },
        callback: (value) => `${Number(value).toFixed(1)}%`,
      },
    },
  },
}))
</script>

<template>
  <div class="h-[16rem]">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import UsageTrendChart from '@/src/components/admin/UsageTrendChart.vue'
import { quotaLevelLabels, useAdminAiUsage, type ProviderUsage } from '@/src/composables/admin/useAdminAiUsage'

const CHART_INDIGO = '#5660D6'
const CHART_TEAL = '#0E9488'

const { records, usages, trendDates, seriesFor } = useAdminAiUsage()

const showAllDays = ref(false)

const unitLabels = { token: 'tokens', page: '頁' } as const

const levelVariants = {
  ok: 'secondary',
  warn: 'outline',
  critical: 'destructive',
} as const

const barClasses = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  critical: 'bg-destructive',
} as const

const chartSeries = computed(() => [
  { label: 'Gemini API（tokens）', values: seriesFor('gemini'), color: CHART_INDIGO },
  { label: 'Google Vision（頁）', values: seriesFor('vision'), color: CHART_TEAL },
])

const chartLabels = computed(() => trendDates.value.map((date) => date.slice(5).replace('-', '/')))

const visibleRecords = computed(() => {
  const sorted = [...records.value].sort((a, b) => b.date.localeCompare(a.date))
  if (showAllDays.value) return sorted
  const cutoff = new Set(trendDates.value.slice(-7))
  return sorted.filter((record) => cutoff.has(record.date))
})

const providerLabels = computed(() =>
  Object.fromEntries(usages.value.map((usage) => [usage.provider.id, usage.provider.label])),
)

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW')
}

function daysLeftText(usage: ProviderUsage): string {
  if (usage.unset) return '—'
  if (usage.daysLeft === null) return '目前無消耗'
  return `${usage.daysLeft} 天`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">AI 使用量與額度</h1>
      <p class="mt-1 text-muted-foreground">
        監控平台向 AI 廠商購買的額度，並在耗盡前提出預警。額度上限與門檻於系統設定頁調整。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card v-for="usage in usages" :key="usage.provider.id" class="rounded-[1.5rem]">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-base">{{ usage.provider.label }}</CardTitle>
          <Badge :variant="levelVariants[usage.level]">{{ quotaLevelLabels[usage.level] }}</Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <p v-if="usage.unset" class="text-2xl font-black text-muted-foreground">未設定額度</p>
          <p v-else class="text-2xl font-black">
            {{ formatNumber(usage.used) }}
            <span class="text-base font-medium text-muted-foreground">
              / {{ formatNumber(usage.quota) }} {{ unitLabels[usage.provider.unit] }}
            </span>
          </p>

          <div v-if="!usage.unset" class="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              class="h-full rounded-full transition-all"
              :class="barClasses[usage.level]"
              :style="{ width: `${usage.percent}%` }"
            />
          </div>

          <div class="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p class="text-muted-foreground">剩餘</p>
              <p class="font-semibold">{{ usage.unset ? '—' : formatNumber(usage.remaining) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">近 7 日平均</p>
              <p class="font-semibold">{{ formatNumber(usage.dailyAvg) }} / 日</p>
            </div>
            <div>
              <p class="text-muted-foreground">預估可撐</p>
              <p class="font-semibold">{{ daysLeftText(usage) }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>近 30 天用量趨勢</CardTitle>
        <CardDescription>兩個供應商的計量單位不同，僅供觀察各自的消耗速度變化。</CardDescription>
      </CardHeader>
      <CardContent>
        <UsageTrendChart :labels="chartLabels" :series="chartSeries" />
      </CardContent>
    </Card>

    <Card class="rounded-[1.5rem]">
      <CardHeader class="flex flex-row items-center justify-between space-y-0">
        <CardTitle>每日明細</CardTitle>
        <Button variant="outline" size="sm" @click="showAllDays = !showAllDays">
          {{ showAllDays ? '只顯示近 7 天' : '顯示全部 30 天' }}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">日期</TableHead>
              <TableHead class="whitespace-nowrap">供應商</TableHead>
              <TableHead class="whitespace-nowrap text-right">用量</TableHead>
              <TableHead class="whitespace-nowrap text-right">呼叫次數</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="record in visibleRecords" :key="`${record.date}-${record.provider}`">
              <TableCell class="whitespace-nowrap">{{ record.date }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ providerLabels[record.provider] }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(record.units) }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(record.calls) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>

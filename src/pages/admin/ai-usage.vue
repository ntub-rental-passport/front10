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
import type { AiProviderId } from '@/src/mocks/admin-seed'

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

/**
 * 兩個供應商的原始用量單位差三個數量級（token vs 頁），直接畫在同一張圖上
 * 會讓其中一條線壓成貼著 x 軸的直線。改畫「每日用量佔該供應商月額度的百分比」，
 * 讓兩條線落在同一量級、可直接比較消耗速度。
 */
function percentSeriesFor(providerId: AiProviderId): number[] {
  const usage = usages.value.find((item) => item.provider.id === providerId)
  const quota = usage?.quota ?? 0
  // 額度為 0（尚未設定）或為負數時，除法會產生 Infinity/NaN 讓圖表壞掉，一律填 0。
  if (quota <= 0) return trendDates.value.map(() => 0)
  return seriesFor(providerId).map((value) => (value / quota) * 100)
}

const chartSeries = computed(() => [
  { label: 'Gemini API（% 月額度）', values: percentSeriesFor('gemini'), color: CHART_INDIGO },
  { label: 'Google Vision（% 月額度）', values: percentSeriesFor('vision'), color: CHART_TEAL },
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
      <Card v-for="usage in usages" :key="usage.provider.id" class="rounded-3xl">
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

    <Card class="rounded-3xl">
      <CardHeader>
        <CardTitle>近 30 天用量趨勢</CardTitle>
        <CardDescription>顯示各供應商每日用量佔其月額度的百分比，因此兩者可以直接比較消耗速度。</CardDescription>
      </CardHeader>
      <CardContent>
        <UsageTrendChart :labels="chartLabels" :series="chartSeries" />
      </CardContent>
    </Card>

    <Card class="rounded-3xl">
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

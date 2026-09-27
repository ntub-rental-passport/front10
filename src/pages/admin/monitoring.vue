<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { RouterLink } from 'vue-router'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import {
  Activity,
  ArrowRight,
  CalendarX2,
  CircleCheck,
  MailX,
  OctagonAlert,
  RefreshCw,
  ServerCrash,
  ServerOff,
  TriangleAlert,
  Unplug,
} from 'lucide-vue-next'
import UsageTrendChart from '@/src/components/admin/UsageTrendChart.vue'
import MonitorCard from '@/src/components/admin/MonitorCard.vue'
import FeatureOutageCard from '@/src/components/admin/FeatureOutageCard.vue'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/src/components/admin/admin-tabs'
import { STATUS_CHIP_CLASS, STATUS_DOT_TONE_CLASS, type StatusDotTone } from '@/src/components/admin/status-dot'
import { quotaLevelLabels, useAdminAiUsage, type ProviderUsage } from '@/src/composables/admin/useAdminAiUsage'
import { useAdminFeatureOutages } from '@/src/composables/admin/useAdminFeatureOutages'
import { useSystemHealth } from '@/src/composables/admin/useSystemHealth'
import { useTickingNow } from '@/src/composables/useTickingNow'
import type { AiProviderId } from '@/src/mocks/admin-seed'
import { chartColor } from '@/src/constants/admin-chart'
import { PLAN_FEATURES, PLAN_FEATURE_KEYS } from '@/src/utils/admin-entitlements'
import { outageOf } from '@/src/utils/admin-feature-status'
import { formatShortDateTime, formatTimeAgo, type MonitorReading } from '@/src/utils/admin-monitoring'
import {
  EVENT_FILTERS,
  buildEventRows,
  collectAttention,
  eventTiming,
  filterEventRows,
  isHeartbeatStale,
  lastOutageNote,
  monitorOverview,
  nvidiaBackupNote,
  queueView,
  type EventFilter,
  type MonitorEventKind,
  type QueueSnapshot,
  type QueueView,
} from '@/src/utils/admin-monitoring-report'

const {
  checking,
  check,
  liveMonitors,
  pendingMonitors,
  responseMs,
  metricsLoaded,
  metricsAvailable,
  queues,
  config,
  summary,
  events,
  serverNow,
} = useSystemHealth({ withEvents: true })
const { outages } = useAdminFeatureOutages()

// 「已斷線 42 分鐘」「背景檢查 3 分鐘前」要跟著時間走；輪詢是 30 秒一次，這裡跟上
const tick = useTickingNow(30_000)
const now = computed(() => {
  void tick.value
  return serverNow()
})

/* -------------------- 事件紀錄（服務卡的「上次斷線」也要用） -------------------- */

const eventRows = computed(() => buildEventRows(events.value ?? []))

/* -------------------- 服務是否在線 -------------------- */

function withNotes(reading: MonitorReading, notes: (string | null)[]): MonitorReading {
  const kept = notes.filter((note): note is string => note !== null)
  return kept.length ? { ...reading, notes: kept } : reading
}

const serviceReadings = computed(() =>
  [...liveMonitors(), ...pendingMonitors()].map((reading) => {
    // 正在斷線時，卡片講的是這一次；「上次斷線」等恢復之後才有意義
    const lastOutage = reading.state === 'ok' ? lastOutageNote(eventRows.value, reading.id) : null
    if (reading.id === 'llm-desktop') return withNotes(reading, [nvidiaBackupNote(config.value), lastOutage])
    if (reading.id === 'ocr') return withNotes(reading, [lastOutage])
    return reading
  }),
)

/* -------------------- 背景工作 -------------------- */

interface QueueCard {
  key: string
  label: string
  description: string
  snapshot: QueueSnapshot | null
  view: QueueView | null
  link: string | null
}

const queueCards = computed<QueueCard[]>(() => {
  const definitions = [
    {
      key: 'scheduledNotifications' as const,
      label: '排程通知',
      description: '管理員排定的公告與通知，時間到由後端寄出。',
      link: '/admin/notifications?tab=schedule',
    },
    {
      key: 'garbageReminders' as const,
      label: '垃圾車提醒',
      description: '租客訂的清運提醒（Email／推播），時間到由後端寄出。',
      link: null,
    },
  ]
  return definitions.map((definition) => {
    const snapshot = queues.value?.[definition.key] ?? null
    return { ...definition, snapshot, view: snapshot ? queueView(snapshot, now.value) : null }
  })
})

/* -------------------- 總結列 -------------------- */

const heartbeatStale = computed(() => (summary.value ? isHeartbeatStale(summary.value) : false))

const closedFeatures = computed(() =>
  PLAN_FEATURE_KEYS.filter((key) => outageOf(outages.value, key) !== null).map((key) => PLAN_FEATURES[key].label),
)

const overview = computed(() =>
  monitorOverview({
    loading: !metricsLoaded.value,
    backendDown: responseMs.value === null,
    metricsAvailable: metricsAvailable.value,
    attention: collectAttention({
      readings: serviceReadings.value,
      queues: queueCards.value.flatMap((queue) => (queue.view ? [{ label: queue.label, view: queue.view }] : [])),
      config: config.value,
      heartbeatStale: heartbeatStale.value,
      closedFeatures: closedFeatures.value,
    }),
  }),
)

const OVERVIEW_ICONS: Record<StatusDotTone, Component> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  danger: OctagonAlert,
  idle: Activity,
}

/**
 * 總結列左邊那塊的底色。異常沿用 StatusDot 的實心 chip；正常只給淡淡的綠，
 * 跟 StatusDot 的原則一致：沒事的時候不要搶眼。
 */
const OVERVIEW_TILE_CLASS: Record<StatusDotTone, string> = {
  ok: 'bg-success/10 text-success',
  warn: STATUS_CHIP_CLASS.warn,
  danger: STATUS_CHIP_CLASS.danger,
  idle: STATUS_CHIP_CLASS.idle,
}

const events24hText = computed(() => {
  if (!summary.value) return '—'
  return summary.value.events24h === 0 ? '沒有異常' : `${summary.value.events24h} 次異常`
})

const heartbeatText = computed(() => {
  if (!summary.value) return '—'
  return formatTimeAgo(summary.value.lastHeartbeat, now.value)
})

/* -------------------- 事件紀錄 -------------------- */

const eventFilter = ref<EventFilter>('all')
const EVENT_PAGE_SIZE = 20
const showAllEvents = ref(false)

const EVENT_ICONS: Record<MonitorEventKind, Component> = {
  down: Unplug,
  recovered: Unplug,
  'backend-downtime': ServerOff,
  'server-error': ServerCrash,
  'notification-missed': CalendarX2,
  'notification-failed': MailX,
}

const eventCounts = computed(() =>
  Object.fromEntries(EVENT_FILTERS.map((filter) => [filter.value, filterEventRows(eventRows.value, filter.value).length])),
)

const filteredRows = computed(() => filterEventRows(eventRows.value, eventFilter.value))

const shownRows = computed(() => {
  const rows = showAllEvents.value ? filteredRows.value : filteredRows.value.slice(0, EVENT_PAGE_SIZE)
  return rows.map((row) => ({ row, timing: eventTiming(row, now.value) }))
})

const hiddenEventCount = computed(() => filteredRows.value.length - shownRows.value.length)

function selectEventFilter(value: string | number): void {
  eventFilter.value = value as EventFilter
  showAllEvents.value = false
}

/* -------------------- AI 額度用量（展示資料） -------------------- */

const { records, usages, trendDates, seriesFor } = useAdminAiUsage()

const showAllDays = ref(false)

const unitLabels = { token: 'tokens', page: '頁' } as const

const QUOTA_TONE: Record<ProviderUsage['level'], StatusDotTone> = {
  ok: 'ok',
  warn: 'warn',
  critical: 'danger',
}

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
  { label: 'Gemini API（% 月額度）', values: percentSeriesFor('gemini'), color: chartColor('series-1') },
  { label: 'Google Vision（% 月額度）', values: percentSeriesFor('vision'), color: chartColor('series-3') },
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
  <div class="space-y-8">
    <!--
      總結列：一進來不用看完整頁，就知道今天有沒有事。
      「需要注意」只數要管理員動手的（warn／danger），規則見 collectAttention。
    -->
    <Card class="rounded-3xl">
      <CardContent class="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex min-w-0 items-center gap-4">
          <span
            class="flex size-12 shrink-0 items-center justify-center rounded-2xl"
            :class="OVERVIEW_TILE_CLASS[overview.tone]"
            aria-hidden="true"
          >
            <component :is="OVERVIEW_ICONS[overview.tone]" class="size-6" />
          </span>
          <div class="min-w-0">
            <p class="text-lg font-bold tracking-tight">{{ overview.title }}</p>
            <p v-if="overview.detail" class="text-sm text-foreground/70">{{ overview.detail }}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
          <dl class="flex gap-x-8 text-sm">
            <div class="space-y-0.5">
              <dt class="text-xs text-foreground/70">過去 24 小時</dt>
              <dd class="font-semibold tabular-nums">{{ events24hText }}</dd>
            </div>
            <div class="space-y-0.5">
              <dt class="text-xs text-foreground/70">背景檢查</dt>
              <dd class="font-semibold tabular-nums">
                {{ heartbeatText }}
                <span v-if="heartbeatStale" class="font-normal text-destructive">（已停止）</span>
              </dd>
            </div>
          </dl>
          <Button variant="outline" :disabled="checking" @click="check">
            <RefreshCw class="mr-1 h-4 w-4" :class="checking ? 'animate-spin' : ''" />
            {{ checking ? '量測中' : '重新量測' }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 一、服務是否在線：掛了要去重啟 -->
    <section class="space-y-3" aria-labelledby="monitor-services">
      <div>
        <h2 id="monitor-services" class="text-lg font-bold tracking-tight">服務是否在線</h2>
        <p class="text-sm text-foreground/70">
          前三項是後端本身，後兩項是它依賴的服務。AI 模型與 OCR 由後端每 60 秒檢查一次，沒人開這頁也照常檢查。
        </p>
      </div>
      <!-- 六欄：上排三張各佔二欄，下排兩張各佔三欄 —— 下排有備援與上次斷線要講，需要寬一點 -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <MonitorCard
          v-for="(reading, index) in serviceReadings"
          :key="reading.id"
          :reading="reading"
          :class="index < 3 ? 'lg:col-span-2' : 'lg:col-span-3'"
        />
      </div>
    </section>

    <!-- 二、背景工作：失敗了要去看是哪幾筆 -->
    <section class="space-y-3" aria-labelledby="monitor-queues">
      <div>
        <h2 id="monitor-queues" class="text-lg font-bold tracking-tight">背景工作</h2>
        <p class="text-sm text-foreground/70">後端每 20 秒派送一次。背景工作失敗不會有人發現，除非有人來問，所以在這裡盯著。</p>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card v-for="queue in queueCards" :key="queue.key" class="rounded-3xl">
          <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0 p-5 pb-3">
            <div class="min-w-0">
              <CardTitle class="text-base">{{ queue.label }}</CardTitle>
              <CardDescription class="mt-1">{{ queue.description }}</CardDescription>
            </div>
            <StatusDot
              v-if="queue.view"
              class="shrink-0"
              :tone="queue.view.tone"
              :label="queue.view.statusLabel"
              emphasize
            />
          </CardHeader>

          <CardContent class="space-y-3 px-5 pb-5">
            <template v-if="queue.snapshot && queue.view">
              <dl class="grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-muted/40 p-4 text-sm sm:grid-cols-4">
                <div class="space-y-0.5">
                  <dt class="text-xs text-foreground/70">待送</dt>
                  <dd class="font-semibold tabular-nums">{{ queue.snapshot.pending }} 筆</dd>
                </div>
                <div class="space-y-0.5">
                  <dt class="text-xs text-foreground/70">下一筆</dt>
                  <dd class="font-semibold tabular-nums">
                    {{ queue.snapshot.nextDue ? formatShortDateTime(queue.snapshot.nextDue) : '—' }}
                  </dd>
                </div>
                <div class="space-y-0.5">
                  <dt class="text-xs text-foreground/70">7 天內失敗</dt>
                  <dd class="font-semibold tabular-nums">{{ queue.snapshot.failed7d }} 筆</dd>
                </div>
                <div class="space-y-0.5">
                  <dt class="text-xs text-foreground/70">7 天內錯過</dt>
                  <dd class="font-semibold tabular-nums">{{ queue.snapshot.missed7d }} 筆</dd>
                </div>
              </dl>

              <p
                v-for="alert in queue.view.alerts"
                :key="alert"
                class="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              >
                {{ alert }}
              </p>

              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-xs text-muted-foreground">
                  {{
                    queue.snapshot.lastIssueAt
                      ? `最近一次失敗或錯過：${formatShortDateTime(queue.snapshot.lastIssueAt)}`
                      : '沒有失敗或錯過的紀錄'
                  }}
                </p>
                <RouterLink
                  v-if="queue.link"
                  :to="queue.link"
                  class="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  查看排程
                  <ArrowRight class="size-4" aria-hidden="true" />
                </RouterLink>
              </div>
            </template>
            <p v-else class="text-sm text-muted-foreground">讀不到佇列狀態，請確認後端。</p>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- 三、設定與維護：缺了要去補 .env；功能壞了先對使用者暫停 -->
    <section class="space-y-3" aria-labelledby="monitor-config">
      <div>
        <h2 id="monitor-config" class="text-lg font-bold tracking-tight">設定與維護</h2>
        <p class="text-sm text-foreground/70">設定缺了要到伺服器的 .env 補上，再重新啟動後端；功能壞了可以先在這裡對使用者暫停。</p>
      </div>
      <!--
        上下疊而不是左右並排：功能開關有六列、每列一顆按鈕，並排時左邊的設定卡
        會空出一大塊。兩張卡各自在卡內排成兩欄，高度都收得起來。
      -->
      <div class="space-y-4">
        <Card class="rounded-3xl">
          <CardHeader class="p-5">
            <CardTitle class="text-base">外部服務設定</CardTitle>
            <CardDescription>只檢查有沒有設定，不會顯示任何金鑰或密碼。</CardDescription>
          </CardHeader>
          <CardContent class="px-5 pb-5">
            <ul v-if="config" class="grid gap-3 md:grid-cols-2">
              <li
                v-for="item in config"
                :key="item.key"
                class="flex items-start justify-between gap-4 rounded-2xl border p-4"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ item.label }}</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">{{ item.hint }}</p>
                </div>
                <StatusDot
                  class="shrink-0"
                  :tone="item.ok ? 'ok' : 'warn'"
                  :label="item.ok ? '已設定' : '未設定'"
                  emphasize
                />
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">讀不到設定狀態，請確認後端。</p>
          </CardContent>
        </Card>

        <FeatureOutageCard />
      </div>
    </section>

    <!-- 四、事件紀錄：壞掉的時候留下的紀錄 -->
    <section class="space-y-3" aria-labelledby="monitor-events">
      <div>
        <h2 id="monitor-events" class="text-lg font-bold tracking-tight">事件紀錄</h2>
        <p class="text-sm text-foreground/70">
          服務斷線與恢復、後端停機、排程通知出錯、伺服器錯誤都會記一筆，保留 30 天。錯誤的完整內容在後端的 log 檔。
        </p>
      </div>
      <Card class="rounded-3xl">
        <CardContent class="space-y-4 p-5">
          <Tabs :model-value="eventFilter" @update:model-value="selectEventFilter">
            <TabsList :class="ADMIN_TAB_LIST">
              <TabsTrigger
                v-for="filter in EVENT_FILTERS"
                :key="filter.value"
                :value="filter.value"
                :class="ADMIN_TAB_TRIGGER"
              >
                {{ filter.label }}
                <span class="ml-1.5 tabular-nums">{{ eventCounts[filter.value] }}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <p v-if="events === null" class="text-sm text-muted-foreground">
            {{ metricsLoaded ? '讀不到事件紀錄，請確認後端。' : '讀取中…' }}
          </p>
          <div
            v-else-if="filteredRows.length === 0"
            class="flex items-center gap-2 rounded-2xl border border-dashed p-6 text-sm text-foreground/70"
          >
            <CircleCheck class="size-4 shrink-0 text-success" aria-hidden="true" />
            過去 30 天沒有這類紀錄。
          </div>
          <ul v-else class="divide-y">
            <li
              v-for="{ row, timing } in shownRows"
              :key="row.key"
              class="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-x-4 py-3 first:pt-0 last:pb-0"
            >
              <time :datetime="row.startedAt" class="text-sm tabular-nums text-foreground/70">
                {{ formatShortDateTime(row.startedAt) }}
              </time>
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                  <component :is="EVENT_ICONS[row.kind]" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {{ row.title }}
                  <!-- 整份紀錄只有這一種要上色：還沒恢復的斷線是現在進行式，其他都是過去式 -->
                  <StatusDot v-if="row.ongoing" tone="danger" label="尚未恢復" emphasize />
                </p>
                <p v-if="row.detail" class="mt-0.5 break-words text-sm text-muted-foreground">{{ row.detail }}</p>
              </div>
              <div class="text-right">
                <p class="text-sm tabular-nums">{{ timing.main }}</p>
                <p v-if="timing.sub" class="text-xs text-muted-foreground">{{ timing.sub }}</p>
              </div>
            </li>
          </ul>

          <Button v-if="hiddenEventCount > 0" variant="outline" size="sm" @click="showAllEvents = true">
            再顯示 {{ hiddenEventCount }} 筆
          </Button>
        </CardContent>
      </Card>
    </section>

    <!-- 五、AI 額度用量：還沒有真實資料，整區標「展示資料」 -->
    <section class="space-y-3" aria-labelledby="monitor-ai-usage">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="monitor-ai-usage" class="text-lg font-bold tracking-tight">AI 額度用量</h2>
          <Badge variant="outline">展示資料</Badge>
        </div>
        <p class="text-sm text-foreground/70">
          這一區還沒接上真實用量，數字是範例，之後接上會直接替換。上限與門檻在系統設定頁調整。
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Card v-for="usage in usages" :key="usage.provider.id" class="rounded-3xl">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
            <CardTitle class="text-base">{{ usage.provider.label }}</CardTitle>
            <!-- 展示資料不開 emphasize：假數字不該用實心警示搶注意力 -->
            <StatusDot :tone="QUOTA_TONE[usage.level]" :label="quotaLevelLabels[usage.level]" />
          </CardHeader>
          <CardContent class="space-y-4 px-5 pb-5">
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
                :class="STATUS_DOT_TONE_CLASS[QUOTA_TONE[usage.level]]"
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
        <CardHeader class="p-5">
          <CardTitle class="text-base">近 30 天用量趨勢</CardTitle>
          <CardDescription>顯示各供應商每日用量佔其月額度的百分比，因此兩者可以直接比較消耗速度。</CardDescription>
        </CardHeader>
        <CardContent class="px-5 pb-5">
          <UsageTrendChart :labels="chartLabels" :series="chartSeries" />
        </CardContent>
      </Card>

      <Card class="rounded-3xl">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 p-5">
          <CardTitle class="text-base">每日明細</CardTitle>
          <Button variant="outline" size="sm" @click="showAllDays = !showAllDays">
            {{ showAllDays ? '只顯示近 7 天' : '顯示全部 30 天' }}
          </Button>
        </CardHeader>
        <CardContent class="px-5 pb-5">
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
    </section>
  </div>
</template>

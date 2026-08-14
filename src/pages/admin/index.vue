<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { RotateCcw } from 'lucide-vue-next'
import CategoryBarCard from '@/src/components/admin/CategoryBarCard.vue'
import DonutStatCard from '@/src/components/admin/DonutStatCard.vue'
import PatrolMetricCard from '@/src/components/admin/PatrolMetricCard.vue'
import QuotaProgressCard, { type QuotaProgressItem } from '@/src/components/admin/QuotaProgressCard.vue'
import TrendAreaCard from '@/src/components/admin/TrendAreaCard.vue'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { useAdminAiUsage } from '@/src/composables/admin/useAdminAiUsage'
import { adminRoleLabels, useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { useAdminRbac } from '@/src/composables/admin/useAdminRbac'
import { resetAdminData } from '@/src/composables/admin/useAdminStore'
import { useAdminMaintenance } from '@/src/composables/admin/useAdminMaintenance'
import { useAdminDeposits } from '@/src/composables/admin/useAdminDeposits'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import { formatDateTime } from '@/src/utils/admin-format'
import { isMaintenanceActive } from '@/src/utils/maintenance'
import { maintenanceCategoryLabels, type MaintenanceCategory } from '@/src/utils/admin-maintenance'
import { depositMatchLabels } from '@/src/utils/admin-deposit'
import {
  buildQueue,
  depositMatchDistribution,
  monthlyUserGrowth,
  queueKindLabels,
  queueTotal,
  weeklyTicketTrend,
} from '@/src/utils/admin-overview'
import { chartColor } from '@/src/constants/admin-chart'
import type { AdminUserRole } from '@/src/mocks/admin-seed'

const { users } = useAdminUsers()
const { usages, alerts, alertCount } = useAdminAiUsage()
const { events, logAction } = useAdminAudit()
const { settings } = useAdminSettings()
const { canAccessPath } = useAdminRbac()
const { tickets, stats: maintenanceStats } = useAdminMaintenance()
const { records: depositRecords, stats: depositStats } = useAdminDeposits()
const { rows } = useAdminDirectory()

const resetOpen = ref(false)

// 開關打開不代表此刻生效，排程可能尚未開始或已結束
const maintenanceActive = computed(() => isMaintenanceActive(settings.value))

const maintenanceDetail = computed(() => {
  if (maintenanceActive.value) return '一般使用者目前看到維護頁'
  if (settings.value.maintenanceMode) return '維護模式已開啟，依排程此刻尚未生效'
  return '所有功能開放中'
})

// ── 巡邏 ──────────────────────────────────────────────────────────

const expiringCount = computed(() => rows.value.filter((row) => row.subscriptionExpiring).length)

const patrolMetrics = computed(() => [
  {
    key: 'overdue',
    label: '報修逾期',
    value: maintenanceStats.value.overdue,
    unit: '件',
    caption: `處理中 ${maintenanceStats.value.processing} 件・共 ${maintenanceStats.value.total} 件`,
    to: '/admin/maintenance-tickets',
  },
  {
    key: 'deposit',
    label: '押金金額不符',
    value: depositStats.value.mismatchedCount,
    unit: '筆',
    caption: `另有 ${depositStats.value.pendingCount} 筆租客尚未聲明`,
    to: '/admin/users?alert=deposit-mismatch',
  },
  {
    key: 'quota',
    label: 'AI 額度告急',
    value: alertCount.value,
    unit: '項',
    caption: alertCount.value > 0 ? '請確認供應商額度設定' : '所有供應商額度充足',
    to: '/admin/ai-usage',
  },
  {
    key: 'expiring',
    label: '訂閱即將到期',
    value: expiringCount.value,
    unit: '人',
    caption: '14 天內到期且仍在使用中',
    to: '/admin/users?alert=subscription-expiring',
  },
])

// ── 匯報：趨勢 ────────────────────────────────────────────────────

const ticketTrend = computed(() => weeklyTicketTrend(tickets.value, 12))
const ticketTrendSummary = computed(() => `本週 ${ticketTrend.value.at(-1)?.value ?? 0} 件`)

const userGrowth = computed(() => monthlyUserGrowth(users.value, 12))
const userGrowthSummary = computed(() => {
  const points = userGrowth.value
  const gained = (points.at(-1)?.value ?? 0) - (points.at(-2)?.value ?? 0)
  return gained > 0 ? `本月 +${gained}` : '本月持平'
})

// ── 匯報：組成 ────────────────────────────────────────────────────

const categoryItems = computed(() =>
  (Object.keys(maintenanceCategoryLabels) as MaintenanceCategory[]).map((category) => ({
    label: maintenanceCategoryLabels[category],
    value: maintenanceStats.value.byCategory[category],
  })),
)

const roleSegments = computed(() => {
  // 租客最多、顏色最深，管理員最少最淺 —— 用明度表達量體
  const colors: Record<AdminUserRole, string> = {
    user: chartColor('series-1'),
    landlord: chartColor('series-3'),
    admin: chartColor('series-5'),
  }
  return (Object.keys(colors) as AdminUserRole[]).map((role) => ({
    label: adminRoleLabels[role],
    value: users.value.filter((user) => user.role === role).length,
    color: colors[role],
  }))
})

const suspendedNote = computed(() => {
  const suspended = users.value.filter((user) => user.status === 'suspended').length
  return suspended > 0 ? `停用中 ${suspended} 筆` : '目前沒有停用帳號'
})

const depositSegments = computed(() =>
  depositMatchDistribution(depositRecords.value).map((entry) => ({
    label: depositMatchLabels[entry.match],
    value: entry.value,
    // 只有「不符」用警示色，其餘留在藍紫色系
    color:
      entry.match === 'mismatched'
        ? chartColor('danger')
        : entry.match === 'matched'
          ? chartColor('series-2')
          : chartColor('series-5'),
  })),
)

const usageBars = computed<QuotaProgressItem[]>(() =>
  usages.value.map((usage) => ({
    id: usage.provider.id,
    label: usage.provider.label,
    percent: usage.percent,
    level: usage.level,
    unset: usage.unset,
    caption: usage.unset
      ? '尚未設定額度上限'
      : usage.daysLeft === null
        ? `剩餘 ${usage.remaining.toLocaleString('zh-TW')}・目前無消耗`
        : `剩餘 ${usage.remaining.toLocaleString('zh-TW')}・預估可撐 ${usage.daysLeft} 天`,
  })),
)

// ── 待辦與稽核 ────────────────────────────────────────────────────

const queueItems = computed(() => {
  const fromUsers = buildQueue(rows.value, 6)
  const fromQuota = alerts.value.map((usage) => ({
    id: `ai-${usage.provider.id}`,
    kind: 'quota-exhausted' as const,
    label:
      usage.daysLeft === null
        ? `${usage.provider.label} 額度告急（已用 ${usage.percent}%）`
        : `${usage.provider.label} 額度告急（預估 ${usage.daysLeft} 天後用盡）`,
    to: '/admin/ai-usage',
  }))
  return [...fromQuota, ...fromUsers].slice(0, 7)
})

const queueCount = computed(() => queueTotal(rows.value) + alerts.value.length)

function confirmReset(): void {
  resetAdminData()
  logAction('系統', '示範資料', '重置所有後台示範資料')
  resetOpen.value = false
}
</script>

<template>
  <div class="space-y-8">
    <!-- 標題列：維護狀態是系統狀態而非待辦數字，做成狀態徽章而不是卡片 -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            class="rounded-full border-primary/20 bg-primary/5 px-4 py-1.5 text-primary"
          >
            Admin Console
          </Badge>
          <component
            :is="canAccessPath('/admin/settings') ? RouterLink : 'span'"
            :to="canAccessPath('/admin/settings') ? '/admin/settings' : undefined"
            class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
            :class="
              maintenanceActive
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-border bg-muted/40 text-muted-foreground'
            "
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="maintenanceActive ? 'bg-destructive' : 'bg-emerald-500'"
              aria-hidden="true"
            />
            {{ maintenanceActive ? '維護中' : '運作正常' }}
            <span class="text-muted-foreground">·</span>
            {{ maintenanceDetail }}
          </component>
        </div>
        <div>
          <h1 class="text-4xl font-black tracking-tight">後台總覽</h1>
          <p class="mt-2 text-muted-foreground">
            上半是現在要處理的事，下半是平台目前的規模與趨勢。
          </p>
        </div>
      </div>
      <Button variant="outline" @click="resetOpen = true">
        <RotateCcw class="mr-1 h-4 w-4" />
        重置示範資料
      </Button>
    </div>

    <!-- 一 · 巡邏：矮卡、左側色帶、可點 -->
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <PatrolMetricCard
        v-for="metric in patrolMetrics"
        :key="metric.key"
        :label="metric.label"
        :value="metric.value"
        :unit="metric.unit"
        :caption="metric.caption"
        :to="metric.to"
        tone="alert"
      />
    </section>

    <!-- 二 · 主趨勢：2:1 -->
    <section class="grid gap-4 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <TrendAreaCard
          title="報修工單趨勢"
          description="近 12 週每週新增件數"
          :points="ticketTrend"
          :summary="ticketTrendSummary"
          height="h-72"
        />
      </div>
      <CategoryBarCard
        title="報修分類分布"
        description="全部工單依問題類型"
        :items="categoryItems"
        to="/admin/maintenance-tickets"
      />
    </section>

    <!-- 三 · 規模與組成：1.4:1:1 -->
    <section
      class="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      <TrendAreaCard
        title="使用者成長"
        description="近 12 個月累計人數"
        :points="userGrowth"
        :summary="userGrowthSummary"
        height="h-48"
        :tension="0.25"
      />
      <DonutStatCard
        title="使用者組成"
        to="/admin/users"
        :center-value="users.length"
        center-label="位使用者"
        :segments="roleSegments"
        :note="suspendedNote"
      />
      <DonutStatCard
        title="押金對帳結果"
        to="/admin/users?alert=deposit-mismatch"
        :center-value="depositRecords.length"
        center-label="筆記錄"
        :segments="depositSegments"
        :note="`房東聲明總額 NT$${depositStats.declaredTotal.toLocaleString('zh-TW')}`"
      />
    </section>

    <!-- 四 · 待辦與額度：1.2:1 -->
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card class="rounded-3xl">
        <CardHeader class="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>待辦佇列</CardTitle>
            <CardDescription>需要處理的項目，點擊直接前往當事人或案件。</CardDescription>
          </div>
          <Badge v-if="queueCount > 0" variant="destructive" class="shrink-0">
            {{ queueCount }} 項
          </Badge>
        </CardHeader>
        <CardContent class="space-y-2">
          <RouterLink
            v-for="item in queueItems"
            :key="item.id"
            :to="item.to"
            class="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
          >
            <span class="min-w-0 truncate">{{ item.label }}</span>
            <Badge variant="outline" class="shrink-0">{{ queueKindLabels[item.kind] }}</Badge>
          </RouterLink>
          <p
            v-if="queueItems.length === 0"
            class="py-8 text-center text-sm text-muted-foreground"
          >
            目前沒有待辦事項。
          </p>
          <p
            v-else-if="queueCount > queueItems.length"
            class="pt-1 text-center text-xs text-muted-foreground"
          >
            另有 {{ queueCount - queueItems.length }} 項，可到各模組查看
          </p>
        </CardContent>
      </Card>

      <QuotaProgressCard
        title="AI 額度用量"
        to="/admin/ai-usage"
        :items="usageBars"
        :corner-text="alertCount > 0 ? `${alertCount} 項告急` : '額度充足'"
        :corner-variant="alertCount > 0 ? 'destructive' : 'secondary'"
      />
    </section>

    <!-- 五 · 稽核：整頁最後一塊，滿版收尾 -->
    <section>
      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle>最新稽核事件</CardTitle>
          <CardDescription>最近 6 筆，完整紀錄請到稽核紀錄查詢。</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="event in events.slice(0, 6)"
            :key="event.id"
            class="rounded-xl border bg-muted/20 p-3"
          >
            <p class="font-medium">{{ event.detail }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatDateTime(event.at) }}｜{{ event.actor }}
            </p>
          </div>
          <p
            v-if="events.length === 0"
            class="py-6 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3"
          >
            尚無稽核事件。
          </p>
        </CardContent>
      </Card>
    </section>

    <Dialog v-model:open="resetOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置示範資料</DialogTitle>
          <DialogDescription>
            所有後台模組會回到初始的示範狀態，包含使用者、工單、押金與設定。此操作無法復原。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="resetOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmReset">確認重置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

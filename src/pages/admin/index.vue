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
import { ArrowUpRight, RotateCcw } from 'lucide-vue-next'
import CategoryBarCard from '@/src/components/admin/CategoryBarCard.vue'
import DonutStatCard from '@/src/components/admin/DonutStatCard.vue'
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
import { formatDateTime } from '@/src/utils/admin-format'
import { isMaintenanceActive } from '@/src/utils/maintenance'
import { maintenanceCategoryLabels, type MaintenanceCategory } from '@/src/utils/admin-maintenance'
import { depositMatchLabels } from '@/src/utils/admin-deposit'
import {
  buildQueueGroups,
  depositMatchDistribution,
  monthlyUserGrowth,
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
const { tickets, ticketViews, stats: maintenanceStats } = useAdminMaintenance()
const { records: depositRecords, stats: depositStats } = useAdminDeposits()

const resetOpen = ref(false)

// 開關打開不代表此刻生效，排程可能尚未開始或已結束
const maintenanceActive = computed(() => isMaintenanceActive(settings.value))

const maintenanceDetail = computed(() => {
  if (maintenanceActive.value) return '一般使用者目前看到維護頁'
  if (settings.value.maintenanceMode) return '維護模式已開啟，依排程此刻尚未生效'
  return '所有功能開放中'
})

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

const queueGroups = computed(() =>
  buildQueueGroups(
    ticketViews.value.map((ticket) => ({
      id: ticket.id,
      address: ticket.address,
      tenantName: ticket.tenantName,
      status: ticket.status,
    })),
    alerts.value.map((usage) => ({
      id: `ai-${usage.provider.id}`,
      label:
        usage.daysLeft === null
          ? `${usage.provider.label}（已用 ${usage.percent}%）`
          : `${usage.provider.label}（預估 ${usage.daysLeft} 天後用盡）`,
    })),
    3,
  ),
)

const queueCount = computed(() => queueTotal(queueGroups.value))

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

    <!--
      一 · 待辦與額度。
      刻意不放一排指標卡 —— 那些數字下面的佇列已經在講了，
      並排四張只是把同一件事包裝成很多卡來填版面。
    -->
    <!-- items-start：額度卡只有兩條進度條，被待辦佇列撐到等高會留下半張空白 -->
    <section class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <!-- min-w-0：grid 子項預設 min-width:auto，長地址會把整個 track 撐爆容器 -->
      <Card class="min-w-0 rounded-3xl">
        <CardHeader class="flex flex-row items-start justify-between space-y-0">
          <div class="min-w-0">
            <CardTitle>待辦佇列</CardTitle>
            <CardDescription>只列後台做得了事的項目，點進去可直接處理。</CardDescription>
          </div>
          <Badge v-if="queueCount > 0" variant="destructive" class="shrink-0">
            {{ queueCount }} 件
          </Badge>
        </CardHeader>

        <CardContent class="space-y-5">
          <div v-for="group in queueGroups" :key="group.kind" class="space-y-2">
            <div class="flex items-baseline justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold">
                  {{ group.label }}
                  <span class="ml-1.5 text-muted-foreground">{{ group.count }} 件</span>
                </p>
                <p class="truncate text-xs text-muted-foreground">{{ group.hint }}</p>
              </div>
              <RouterLink
                :to="group.to"
                class="shrink-0 whitespace-nowrap text-xs text-primary hover:underline"
              >
                查看全部
              </RouterLink>
            </div>

            <RouterLink
              v-for="item in group.items"
              :key="item.id"
              :to="item.to"
              class="flex min-w-0 items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <ArrowUpRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </RouterLink>

            <p v-if="group.count > group.items.length" class="text-xs text-muted-foreground">
              還有 {{ group.count - group.items.length }} 件
            </p>
          </div>

          <p v-if="queueGroups.length === 0" class="py-10 text-center text-sm text-muted-foreground">
            目前沒有待辦事項。
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

    <!-- 二 · 平台規模與組成：1.4:1:1 -->
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

    <!-- 三 · 報修案件流動：1:2 -->
    <section class="grid gap-4 lg:grid-cols-3">
      <CategoryBarCard
        title="報修分類分布"
        description="全部工單依問題類型"
        :items="categoryItems"
        to="/admin/maintenance-tickets"
      />
      <div class="lg:col-span-2">
        <TrendAreaCard
          title="報修工單趨勢"
          description="近 12 週每週新增件數"
          :points="ticketTrend"
          :summary="ticketTrendSummary"
          height="h-72"
        />
      </div>
    </section>

    <!-- 四 · 稽核：整頁最後一塊，滿版收尾 -->
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

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
import BarStatCard from '@/src/components/admin/BarStatCard.vue'
import DonutStatCard from '@/src/components/admin/DonutStatCard.vue'
import QuotaProgressCard, { type QuotaProgressItem } from '@/src/components/admin/QuotaProgressCard.vue'
import StatusCard from '@/src/components/admin/StatusCard.vue'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { useAdminAiUsage } from '@/src/composables/admin/useAdminAiUsage'
import { adminRoleLabels, useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { useAdminRbac } from '@/src/composables/admin/useAdminRbac'
import { resetAdminData } from '@/src/composables/admin/useAdminStore'
import { useAdminMaintenance } from '@/src/composables/admin/useAdminMaintenance'
import { useAdminDeposits } from '@/src/composables/admin/useAdminDeposits'
import { formatDateTime } from '@/src/utils/admin-format'
import { formatCurrency } from '@/src/utils/rent-format'
import { isMaintenanceActive } from '@/src/utils/maintenance'
import { maintenanceCategoryLabels, type MaintenanceCategory } from '@/src/utils/admin-maintenance'
import type { AdminUserRole } from '@/src/mocks/admin-seed'

const CHART_INDIGO = '#5660D6'
const CHART_TEAL = '#0E9488'
const CHART_AMBER = '#D97706'
const CHART_INDIGO_MUTED = '#B4B9EE'
const CHART_ROSE = '#DC2626'
const CHART_SLATE = '#64748B'

const { users } = useAdminUsers()
const { usages, alerts, alertCount } = useAdminAiUsage()
const { events, logAction } = useAdminAudit()
const { settings } = useAdminSettings()
const { canAccessPath } = useAdminRbac()
const { stats: maintenanceStats } = useAdminMaintenance()
const { stats: depositStats } = useAdminDeposits()

const resetOpen = ref(false)

// 開關打開不代表此刻生效，排程可能尚未開始或已結束
const maintenanceActive = computed(() => isMaintenanceActive(settings.value))

const maintenanceDetail = computed(() => {
  if (maintenanceActive.value) return '一般使用者目前看到維護頁'
  if (settings.value.maintenanceMode) return '維護模式已開啟，但依排程此刻尚未生效'
  return '所有功能開放中'
})

const todayEventCount = computed(() => {
  const today = new Date().toDateString()
  return events.value.filter((event) => new Date(event.at).toDateString() === today).length
})

const roleColors: Record<AdminUserRole, string> = {
  user: CHART_INDIGO,
  landlord: CHART_TEAL,
  admin: CHART_AMBER,
}

const roleSegments = computed(() =>
  (Object.keys(roleColors) as AdminUserRole[]).map((role) => ({
    label: adminRoleLabels[role],
    value: users.value.filter((user) => user.role === role).length,
    color: roleColors[role],
  })),
)

const suspendedNote = computed(() => {
  const suspended = users.value.filter((user) => user.status === 'suspended').length
  return suspended > 0 ? `停用中 ${suspended} 筆` : '目前沒有停用帳號'
})

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

const trendDays = computed(() => {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    return date
  })
})

const trendLabels = computed(() =>
  trendDays.value.map((date, index) =>
    index === 6 ? '今天' : `${date.getMonth() + 1}/${date.getDate()}`,
  ),
)

const trendValues = computed(() =>
  trendDays.value.map((date) => {
    const dayString = date.toDateString()
    return events.value.filter((event) => new Date(event.at).toDateString() === dayString).length
  }),
)

const trendColors = computed(() =>
  trendDays.value.map((_, index) => (index === 6 ? CHART_INDIGO : CHART_INDIGO_MUTED)),
)

const queueItems = computed(() =>
  alerts.value.map((usage) => ({
    id: `quota-${usage.provider.id}`,
    label:
      usage.daysLeft === null
        ? `${usage.provider.label} 額度告急（已用 ${usage.percent}%）`
        : `${usage.provider.label} 額度告急（預估 ${usage.daysLeft} 天後用盡）`,
    to: '/admin/ai-usage',
    tag: 'AI額度',
  })),
)

const maintenanceCategoryColors: Record<MaintenanceCategory, string> = {
  leak: CHART_INDIGO,
  appliance: CHART_TEAL,
  lock: CHART_AMBER,
  pipe: CHART_ROSE,
  other: CHART_SLATE,
}

const maintenanceCategoryKeys = Object.keys(maintenanceCategoryLabels) as MaintenanceCategory[]

const maintenanceCategoryChartLabels = computed(() =>
  maintenanceCategoryKeys.map((category) => maintenanceCategoryLabels[category]),
)

const maintenanceCategoryChartValues = computed(() =>
  maintenanceCategoryKeys.map((category) => maintenanceStats.value.byCategory[category]),
)

const maintenanceCategoryChartColors = computed(() =>
  maintenanceCategoryKeys.map((category) => maintenanceCategoryColors[category]),
)

const maintenanceOverdueDetail = computed(
  () => `處理中 ${maintenanceStats.value.processing} 件・共 ${maintenanceStats.value.total} 件`,
)

const depositProcessingDetail = computed(() => `處理中 ${depositStats.value.processing} 案`)

function confirmReset(): void {
  resetAdminData()
  logAction('系統', '示範資料', '重置所有後台示範資料')
  resetOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-3">
        <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 px-4 py-1.5 text-primary">
          Admin Console
        </Badge>
        <div>
          <h1 class="text-4xl font-black tracking-tight">後台總覽</h1>
          <p class="mt-2 text-muted-foreground">
            集中掌握使用者狀態、AI 額度與稽核事件。
          </p>
        </div>
      </div>
      <Button variant="outline" @click="resetOpen = true">
        <RotateCcw class="mr-1 h-4 w-4" />
        重置示範資料
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatusCard
        title="維護狀態"
        :to="canAccessPath('/admin/settings') ? '/admin/settings' : undefined"
        :status="maintenanceActive ? '維護中' : '運作正常'"
        :tone="maintenanceActive ? 'alert' : 'ok'"
        :detail="maintenanceDetail"
        corner-text="本機設定"
      />
      <DonutStatCard
        title="使用者組成"
        to="/admin/users"
        :center-value="users.length"
        center-label="位使用者"
        :segments="roleSegments"
        :note="suspendedNote"
      />
      <QuotaProgressCard
        title="AI 額度用量"
        to="/admin/ai-usage"
        :items="usageBars"
        :corner-text="alertCount > 0 ? `${alertCount} 項告急` : '額度充足'"
        :corner-variant="alertCount > 0 ? 'destructive' : 'secondary'"
      />
      <BarStatCard
        title="稽核事件趨勢"
        to="/admin/audit"
        :labels="trendLabels"
        :values="trendValues"
        :colors="trendColors"
        :corner-text="`今日 ${todayEventCount} 筆`"
      />
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Card class="rounded-[1.75rem]">
        <CardHeader>
          <CardTitle>待辦佇列</CardTitle>
          <CardDescription>需要管理員處理的項目，點擊前往對應模組。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <RouterLink
            v-for="item in queueItems"
            :key="item.id"
            :to="item.to"
            class="flex items-center justify-between rounded-2xl border bg-muted/20 p-4 text-sm transition-colors hover:bg-muted/40"
          >
            <span>{{ item.label }}</span>
            <Badge variant="outline">{{ item.tag }}</Badge>
          </RouterLink>
          <p v-if="queueItems.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            目前沒有待辦事項 🎉
          </p>
        </CardContent>
      </Card>

      <Card class="rounded-[1.75rem]">
        <CardHeader>
          <CardTitle>最新稽核事件</CardTitle>
          <CardDescription>最近 5 筆，完整紀錄請到稽核紀錄查詢。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <div v-for="event in events.slice(0, 5)" :key="event.id" class="rounded-2xl border bg-muted/20 p-3">
            <p class="font-medium">{{ event.detail }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatDateTime(event.at) }}｜{{ event.actor }}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <div class="space-y-4">
      <div>
        <h2 class="text-xl font-bold tracking-tight">報修工單與押金退還</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          點擊卡片前往對應模組查看詳情。
        </p>
      </div>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatusCard
          title="報修逾期件數"
          to="/admin/maintenance-tickets"
          :status="`${maintenanceStats.overdue} 件`"
          :tone="maintenanceStats.overdue > 0 ? 'alert' : 'ok'"
          :detail="maintenanceOverdueDetail"
          corner-text="報修工單"
        />
        <BarStatCard
          title="報修分類分布"
          to="/admin/maintenance-tickets"
          :labels="maintenanceCategoryChartLabels"
          :values="maintenanceCategoryChartValues"
          :colors="maintenanceCategoryChartColors"
          :corner-text="`逾期 ${maintenanceStats.overdue} 件`"
          :corner-variant="maintenanceStats.overdue > 0 ? 'destructive' : 'secondary'"
        />
        <StatusCard
          title="持有押金總額"
          to="/admin/deposits"
          :status="formatCurrency(depositStats.heldTotal)"
          tone="ok"
          :detail="depositProcessingDetail"
          corner-text="押金退還"
        />
        <StatusCard
          title="押金超收警示"
          to="/admin/deposits"
          :status="`${depositStats.overCollectedCount} 件`"
          :tone="depositStats.overCollectedCount > 0 ? 'alert' : 'ok'"
          detail="押金超過月租一定倍數視為超收"
          corner-text="押金退還"
        />
        <StatusCard
          title="押金爭議件數"
          to="/admin/deposits"
          :status="`${depositStats.disputedCount} 件`"
          :tone="depositStats.disputedCount > 0 ? 'alert' : 'ok'"
          detail="租客對扣款項目提出異議的案件"
          corner-text="押金退還"
        />
      </div>
    </div>

    <Dialog v-model:open="resetOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置示範資料？</DialogTitle>
          <DialogDescription>
            所有後台模組的資料會還原成種子狀態，先前的操作紀錄將被清除。此動作無法復原。
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

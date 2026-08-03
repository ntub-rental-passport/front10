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
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { useAdminAiUsage } from '@/src/composables/admin/useAdminAiUsage'
import { adminRoleLabels, useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { resetAdminData } from '@/src/composables/admin/useAdminStore'
import { formatDateTime } from '@/src/utils/admin-format'
import type { AdminUserRole } from '@/src/mocks/admin-seed'

const CHART_INDIGO = '#5660D6'
const CHART_TEAL = '#0E9488'
const CHART_AMBER = '#D97706'
const CHART_RED = '#DC2626'
const CHART_INDIGO_MUTED = '#B4B9EE'

const { users } = useAdminUsers()
const { usages, alerts, alertCount } = useAdminAiUsage()
const { events, logAction } = useAdminAudit()

const resetOpen = ref(false)

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

const usageLabels = computed(() => usages.value.map((usage) => usage.provider.label))

const usageValues = computed(() => usages.value.map((usage) => usage.percent))

const usageColors = computed(() =>
  usages.value.map((usage) =>
    usage.level === 'critical' ? CHART_RED : usage.level === 'warn' ? CHART_AMBER : CHART_INDIGO,
  ),
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
            集中掌握使用者狀態、AI 品質與稽核事件。
          </p>
        </div>
      </div>
      <Button variant="outline" @click="resetOpen = true">
        <RotateCcw class="mr-1 h-4 w-4" />
        重置示範資料
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <DonutStatCard
        title="使用者組成"
        to="/admin/users"
        :center-value="users.length"
        center-label="位使用者"
        :segments="roleSegments"
        :note="suspendedNote"
      />
      <BarStatCard
        title="AI 額度用量"
        to="/admin/ai-usage"
        :labels="usageLabels"
        :values="usageValues"
        :colors="usageColors"
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

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar/index'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { AlertTriangle, ArrowUpRight, ListChecks, Megaphone, Send, Users, Wrench } from 'lucide-vue-next'
import AdminLoadNotice from '@/src/components/admin/AdminLoadNotice.vue'
import AiQuotaRing from '@/src/components/admin/AiQuotaRing.vue'
import CategoryBarCard from '@/src/components/admin/CategoryBarCard.vue'
import DonutStatCard from '@/src/components/admin/DonutStatCard.vue'
import FeatureOutageBanner from '@/src/components/admin/FeatureOutageBanner.vue'
import QuotaProgressCard, { type QuotaProgressItem } from '@/src/components/admin/QuotaProgressCard.vue'
import StatTile from '@/src/components/admin/StatTile.vue'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import InlineStat from '@/src/components/admin/InlineStat.vue'
import SubscriptionOverviewCard from '@/src/components/admin/SubscriptionOverviewCard.vue'
import { adminSubscriptionCollection } from '@/src/composables/admin/useAdminSubscription'
import TrendAreaCard from '@/src/components/admin/TrendAreaCard.vue'
import { useAuditLog } from '@/src/composables/admin/useAuditLog'
import { loadAiUsage, useAdminAiUsage } from '@/src/composables/admin/useAdminAiUsage'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import { adminRoleLabels } from '@/src/composables/admin/useAdminUsers'
import { activeWindowDays, countActiveUsers } from '@/src/utils/admin-activity'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { useAdminMaintenance } from '@/src/composables/admin/useAdminMaintenance'
import { useAdminDeposits } from '@/src/composables/admin/useAdminDeposits'
import { useSystemHealth } from '@/src/composables/admin/useSystemHealth'
import { buildHealthBarItems } from '@/src/utils/admin-health-bar'
import { formatDateTime } from '@/src/utils/admin-format'
import { isMaintenanceActive } from '@/src/utils/maintenance'
import { maintenanceCategoryLabels, type MaintenanceCategory } from '@/src/utils/admin-maintenance'
import { depositMatchLabels } from '@/src/utils/admin-deposit'
import {
  depositMatchDistribution,
  latestChangePercent,
  monthlyUserGrowth,
  weeklyTicketTrend,
} from '@/src/utils/admin-overview'
import { useAdminQueue } from '@/src/composables/admin/useAdminQueue'
import { recentLogins } from '@/src/utils/admin-recent-logins'
import { chartColor } from '@/src/constants/admin-chart'
import type { AdminUserRole } from '@/src/mocks/admin-seed'

const { usages, alerts, alertCount, loadState: aiUsageState } = useAdminAiUsage()
// 每次打開首頁都重讀一次 AI 用量（見 useAdminAiUsage 的說明）
void loadAiUsage()
const { rows: events, loading: auditLoading, serverFailed: auditFailed, reload: reloadAudit } = useAuditLog()
const { settings } = useAdminSettings()
const { tickets, ticketViews, stats: maintenanceStats } = useAdminMaintenance()
const { records: depositRecords, stats: depositStats, loadState: depositsState, reload: reloadDeposits } = useAdminDeposits()

// ── 真實來源：使用者目錄、系統健康條 ────────────────────────────────
//
// 使用者與押金在本地疊加展示資料，正式站只有後端資料；報修工單也已讀後端。
const { rows: directoryRows, realAccounts, realAccountsLoading, realAccountsError, reloadRealAccounts } = useAdminDirectory()
const users = computed(() => directoryRows.value.map((row) => row.user))
const usersState = computed(() => realAccountsError.value ? 'error' : realAccountsLoading.value ? 'loading' : 'ready')
const { dbPool, requests, services, serverNow } = useSystemHealth()

// 開關打開不代表此刻生效，排程可能尚未開始或已結束
const maintenanceActive = computed(() => isMaintenanceActive(settings.value))

const maintenanceDetail = computed(() => {
  if (maintenanceActive.value) return '一般使用者目前看到維護頁'
  if (settings.value.maintenanceMode) return '維護模式已開啟，依排程此刻尚未生效'
  // 這顆膠囊講的只有「全站維護模式」，措辭要留在自己的範圍內。
  // 原本寫「所有功能開放中」，但個別功能可以被功能開關單獨關掉，
  // 那時膠囊會和正下方的維護橫幅直接互相打臉。
  return '一般使用者可正常進入'
})

// ── 規模與趨勢 ────────────────────────────────────────────────────

const ticketTrend = computed(() => weeklyTicketTrend(tickets.value, 12))
const ticketTrendSummary = computed(() => `本週 ${ticketTrend.value.at(-1)?.value ?? 0} 件`)

const userGrowth = computed(() => monthlyUserGrowth(users.value, 12))
const userGrowthSummary = computed(() => {
  const points = userGrowth.value
  const gained = (points.at(-1)?.value ?? 0) - (points.at(-2)?.value ?? 0)
  return gained > 0 ? `本月 +${gained}` : '本月持平'
})

// ── 組成 ────────────────────────────────────────────────────

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

/*
 * 「近 N 天活躍」而不是「在線人數」：本專案沒有 session heartbeat、沒有連線數、
 * 也沒有後端 access log，即時人數只能用編的。這個數字數的是實際登入過的帳號，
 * 是現有資料撐得起的最強說法。
 */
const activeUserCount = computed(() => countActiveUsers(users.value, activeWindowDays))

const suspendedNote = computed(() => {
  const suspended = users.value.filter((user) => user.status === 'suspended').length
  const active = `近 ${activeWindowDays} 天活躍 ${activeUserCount.value} 位`
  return suspended > 0 ? `${active} · 停用中 ${suspended} 筆` : active
})

const depositSegments = computed(() =>
  (depositStats.value === null ? [] : depositMatchDistribution(depositRecords.value)).map((entry) => ({
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
        : `剩餘 ${usage.remaining.toLocaleString('zh-TW')}・預估可撐 ${usage.daysLeft === 0 ? '不到 1' : usage.daysLeft} 天`,
  })),
)

// ── 待辦 ──────────────────────────────────────────────────────────

// 佇列清單本身已經搬到頂部列的待辦抽屜（QueueDrawer），每一頁都叫得出來。
// 這裡只還需要總數給主角卡「今日待處理」用——兩邊共用 useAdminQueue，
// 所以抽屜徽章與主角卡的數字不可能對不起來。
const { count: queueCount } = useAdminQueue()

// ── 系統健康條（真實資料）──────────────────────────────────────────
//
// 資料來源 src/services/adminMetricsApi.ts 打的 /api/admin/metrics（dbPool、
// requests），門檻判斷沿用既有的 src/utils/admin-monitoring.ts。LLM provider
// 目前沒有對應的後端端點，buildHealthBarItems 會用 pendingMonitor 佔位，
// 誠實顯示「無法取得」而不是假綠燈——見 admin-health-bar.ts 的說明。
const healthBarItems = computed(() =>
  buildHealthBarItems(dbPool.value, requests.value, services.value, serverNow()),
)

// ── 最近登入的使用者（真實資料）──────────────────────────────────────
//
// 直接用 realAccounts（useAdminDirectory 回傳的原始 AdminAccount[]，來自後端
// /api/admin/users）。展示資料沒有人真正登入過，不能混進這張卡片。
const recentLoginEntries = computed(() => recentLogins(realAccounts.value))

// ── KPI 卡的 sparkline／trend（沿用目錄與後端工單的成長曲線）───────────
const userGrowthSpark = computed(() => userGrowth.value.map((point) => point.value))
const userGrowthTrendPercent = computed(() => latestChangePercent(userGrowth.value))
const ticketTrendSpark = computed(() => ticketTrend.value.map((point) => point.value))
const ticketTrendPercent = computed(() => latestChangePercent(ticketTrend.value))
const weeklyTicketCount = computed(() => ticketTrend.value.at(-1)?.value ?? 0)
</script>

<template>
  <div class="space-y-6">
    <!--
      ⚠️ 資料標記約定見 src/utils/admin-data-marking.md。
      一句話：標的是「真實」不是「展示」—— 真實區塊加 data-real="true"，
      正式站只有真實來源的區塊標記 data-real，本地開發可疊加展示資料。
    -->

    <!--
      一橫列：左邊放動作、右邊放四個 KPI。justify-between 讓它們各自靠邊，
      中間的空白隨視窗寬度伸縮。1280 以上同一列，以下換行。

      頁面標題已經移到頂部列（見 src/utils/admin-page-title.ts），所以這一列
      現在是內容區的第一個東西。

      押金不符正式站只計真實押金，本地開發才疊加展示押金。
      「今日待處理」與頂部列待辦抽屜的徽章同一個來源（useAdminQueue），
      不會對不起來。押金不符沒有 trend —— 押金資料沒有歷史快照可以比，
      寧可留白也不假造一個趨勢。
    -->
    <div>
      <div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <!--
          這一頁原本只能看、不能做任何事 —— 進來之後想做事得先找到導覽列、
          再點進對應的頁面。

          兩顆按鈕直接導向通知管理與內容管理，讓管理員能從總覽開始操作。
        -->
        <div class="flex flex-wrap items-center gap-2">
          <Button
            as-child
            size="sm"
            class="rounded-full"
          >
            <RouterLink to="/admin/notifications">
              <Send class="size-4" aria-hidden="true" />
              發送通知
            </RouterLink>
          </Button>
          <Button
            as-child
            size="sm"
            variant="outline"
            class="rounded-full"
          >
            <RouterLink to="/admin/content">
              <Megaphone class="size-4" aria-hidden="true" />
              發布公告
            </RouterLink>
          </Button>
        </div>

        <div class="grid w-full grid-cols-2 gap-x-2 gap-y-1 sm:w-auto sm:grid-cols-4">
          <InlineStat
            :icon="ListChecks"
            label="今日待處理"
            :value="queueCount"
            hero
          />
          <InlineStat
            :icon="Users"
            data-real="true"
            label="使用者總數"
            :value="usersState === 'ready' ? users.length : usersState === 'error' ? '讀不到帳號資料' : '讀取中'"
            :trend="usersState === 'ready' ? userGrowthTrendPercent : undefined"
            trend-period="month"
            to="/admin/users"
          />
          <InlineStat
            :icon="Wrench"
            label="本週新增工單"
            :value="weeklyTicketCount"
            :trend="ticketTrendPercent"
            trend-period="week"
            to="/admin/maintenance-tickets"
          />
          <InlineStat
            :icon="AlertTriangle"
            data-real="true"
            label="押金不符"
            :value="depositStats?.mismatchedCount ?? (depositsState === 'error' ? '讀不到真實資料' : '讀取中')"
            to="/admin/users?alert=deposit-mismatch"
          />
        </div>
      </div>
    </div>

    <FeatureOutageBanner />

    <!--
      系統健康條：真實資料，來自 adminMetricsApi.ts 打的 /api/admin/metrics
      （dbPool、requests、後端背景迴圈探測的 AI 模型），判定沿用
      src/utils/admin-monitoring.ts，跟系統監控頁同一套。
      讀不到就說讀不到、沒設定就說未設定，不放假的綠燈——見 src/utils/admin-health-bar.ts。
    -->
    <Card data-real="true" class="rounded-3xl">
      <CardContent class="px-5 pb-5 flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
        <p class="shrink-0 text-sm font-medium text-muted-foreground">系統健康</p>
        <div v-for="item in healthBarItems" :key="item.id" class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ item.name }}</span>
          <StatusDot :tone="item.tone" :label="item.statusText" emphasize />
        </div>
      </CardContent>
    </Card>

    <!--
      人數沿用 useAdminDirectory（正式站真實、本地疊加展示帳號）。
      收款尚未串接金流，只在本地由展示訂閱推算，正式站顯示無收款紀錄。
    -->
    <SubscriptionOverviewCard v-if="usersState === 'ready'" :rows="directoryRows" :subscriptions="adminSubscriptionCollection" />

    <!-- 平台規模與組成 -->
    <section
      class="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      <TrendAreaCard
        v-if="usersState === 'ready'"
        data-real="true"
        title="使用者成長"
        description="近 12 個月累計人數"
        :points="userGrowth"
        :summary="userGrowthSummary"
        height="h-48"
        :tension="0.25"
      />
      <DonutStatCard
        v-if="usersState === 'ready'"
        data-real="true"
        title="使用者組成"
        to="/admin/users"
        :center-value="users.length"
        center-label="位使用者"
        :segments="roleSegments"
        :note="suspendedNote"
      />
      <Card v-if="usersState !== 'ready'" data-real="true" class="rounded-3xl md:col-span-2">
        <CardHeader class="p-5 pb-2">
          <CardTitle class="text-sm font-medium">使用者成長與組成</CardTitle>
        </CardHeader>
        <CardContent class="px-5 pb-5">
          <AdminLoadNotice :state="usersState" what="帳號資料" @retry="reloadRealAccounts" />
        </CardContent>
      </Card>
      <!-- 押金對帳正式站只含真實來源；讀不到時不拿本地展示數字充當總計。 -->
      <DonutStatCard
        v-if="depositStats"
        data-real="true"
        title="押金對帳結果"
        to="/admin/users?alert=deposit-mismatch"
        :center-value="depositRecords.length"
        center-label="筆記錄"
        :segments="depositSegments"
        :note="`房東聲明總額 NT$${depositStats.declaredTotal.toLocaleString('zh-TW')}`"
      />
      <Card v-else data-real="true" class="rounded-3xl">
        <CardHeader class="p-5 pb-2">
          <CardTitle class="text-sm font-medium">押金對帳結果</CardTitle>
        </CardHeader>
        <CardContent class="px-5 pb-5">
          <AdminLoadNotice :state="depositsState" what="真實押金資料" @retry="reloadDeposits" />
        </CardContent>
      </Card>
    </section>

    <!-- 報修案件流動 -->
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

    <!--
      AI 額度：真實資料。百分比來自 useAdminAiUsage()——OCR 服務回報的 Google Vision
      頁數（/api/admin/ai-usage），對照系統設定的額度上限算出來。讀不到時換成提示，
      不顯示 0%、額度充足。
    -->
    <AdminLoadNotice
      v-if="aiUsageState !== 'ready'"
      :state="aiUsageState"
      what="AI 用量"
      @retry="loadAiUsage"
    />
    <section v-else data-real="true" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card class="flex h-full flex-col rounded-3xl">
        <CardHeader class="p-5 pb-2">
          <CardTitle class="text-sm font-medium">AI 額度一覽</CardTitle>
        </CardHeader>
        <CardContent class="px-5 pb-5 flex flex-1 items-center justify-around gap-2">
          <AiQuotaRing
            v-for="usage in usages"
            :key="usage.provider.id"
            :label="usage.provider.label"
            :percent="usage.percent"
            :unset="usage.unset"
          />
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

    <!--
      底部兩張清單卡：性質一樣（都是時間序的「最近發生什麼」），並排比
      各自佔一整列緊湊。正式站兩者皆為真實來源，本地稽核另疊加瀏覽器紀錄。
    -->
    <section class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <!--
        最近登入：真實資料，直接用 realAccounts（useAdminDirectory 回傳的原始
        AdminAccount[]，來自後端 /api/admin/users），依 lastLoginAt 排序取前 5。
        沒有頭像可用（avatar_url 多半是 null），用姓名／email 首字做文字圓形，
        不放灰色人像佔位圖——見 src/utils/admin-recent-logins.ts。
      -->
      <Card data-real="true" class="rounded-3xl">
        <CardHeader class="p-5">
          <CardTitle>最近登入</CardTitle>
          <CardDescription>依最後登入時間排序，最多 5 筆。</CardDescription>
        </CardHeader>
        <CardContent class="px-5 pb-5 space-y-2.5">
          <div
            v-for="entry in recentLoginEntries"
            :key="entry.id"
            class="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2"
          >
            <Avatar size="sm" shape="circle" class="h-9 w-9 shrink-0 bg-primary/10 text-primary">
              <AvatarFallback class="bg-transparent text-sm font-semibold">
                {{ entry.initial }}
              </AvatarFallback>
            </Avatar>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ entry.name }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ entry.email }}</p>
            </div>
            <p class="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {{ formatDateTime(entry.lastLoginAt) }}
            </p>
          </div>

          <p v-if="realAccountsLoading" class="py-6 text-center text-sm text-muted-foreground">
            帳號讀取中…
          </p>
          <p
            v-else-if="realAccountsError"
            class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
          >
            {{ realAccountsError }}
          </p>
          <p
            v-else-if="recentLoginEntries.length === 0"
            class="py-6 text-center text-sm text-muted-foreground"
          >
            尚無登入紀錄。
          </p>
        </CardContent>
      </Card>

      <!--
        與稽核頁共用 useAuditLog：後端稽核＋監控事件，本地開發才疊加本機紀錄。
      -->
      <Card data-real="true" class="rounded-3xl">
        <CardHeader class="p-5">
          <CardTitle>最新稽核事件</CardTitle>
          <CardDescription>最近 5 筆，完整紀錄請到稽核紀錄查詢。</CardDescription>
        </CardHeader>
        <CardContent class="px-5 pb-5 space-y-2.5 text-sm">
          <AdminLoadNotice
            :state="auditLoading ? 'loading' : auditFailed ? 'error' : 'ready'"
            what="稽核紀錄"
            @retry="reloadAudit"
          />
          <div
            v-for="event in events.slice(0, 5)"
            :key="event.id"
            class="min-w-0 rounded-xl border bg-muted/20 p-3"
          >
            <p class="font-medium">{{ event.detail }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatDateTime(event.at) }}｜{{ event.actor }}
            </p>
          </div>
          <p v-if="!auditLoading && !auditFailed && events.length === 0" class="py-6 text-center text-muted-foreground">
            尚無稽核事件。
          </p>
        </CardContent>
      </Card>
    </section>
  </div>
</template>

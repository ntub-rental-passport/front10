<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar/index'
import { Badge } from '@/components/ui/badge/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { ArrowUpRight } from 'lucide-vue-next'
import AiQuotaRing from '@/src/components/admin/AiQuotaRing.vue'
import CategoryBarCard from '@/src/components/admin/CategoryBarCard.vue'
import DonutStatCard from '@/src/components/admin/DonutStatCard.vue'
import FeatureOutageBanner from '@/src/components/admin/FeatureOutageBanner.vue'
import QuotaProgressCard, { type QuotaProgressItem } from '@/src/components/admin/QuotaProgressCard.vue'
import StatTile from '@/src/components/admin/StatTile.vue'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import TrendAreaCard from '@/src/components/admin/TrendAreaCard.vue'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { useAdminAiUsage } from '@/src/composables/admin/useAdminAiUsage'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import { adminRoleLabels, useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { activeWindowDays, countActiveUsers } from '@/src/utils/admin-activity'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { useAdminRbac } from '@/src/composables/admin/useAdminRbac'
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

const { users } = useAdminUsers()
const { usages, alerts, alertCount } = useAdminAiUsage()
const { events } = useAdminAudit()
const { settings } = useAdminSettings()
const { canAccessPath } = useAdminRbac()
const { tickets, ticketViews, stats: maintenanceStats } = useAdminMaintenance()
const { records: depositRecords, stats: depositStats } = useAdminDeposits()

// ── 真實資料：系統健康條、最近登入 ──────────────────────────────────
//
// 這兩個是本頁唯一打真實後端的區塊（其餘都是展示資料，見下方個別區塊的註解）。
const { realAccounts, realAccountsLoading, realAccountsError } = useAdminDirectory()
const { dbPool, requests } = useSystemHealth()

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
const healthBarItems = computed(() => buildHealthBarItems(dbPool.value, requests.value))

// ── 最近登入的使用者（真實資料）──────────────────────────────────────
//
// 直接用 realAccounts（useAdminDirectory 回傳的原始 AdminAccount[]，來自後端
// /api/admin/users）。展示資料沒有人真正登入過，不能混進這張卡片。
const recentLoginEntries = computed(() => recentLogins(realAccounts.value))

// ── KPI 卡的 sparkline／trend（展示資料，沿用既有的 userGrowth／ticketTrend）──
const userGrowthSpark = computed(() => userGrowth.value.map((point) => point.value))
const userGrowthTrendPercent = computed(() => latestChangePercent(userGrowth.value))
const ticketTrendSpark = computed(() => ticketTrend.value.map((point) => point.value))
const ticketTrendPercent = computed(() => latestChangePercent(ticketTrend.value))
const weeklyTicketCount = computed(() => ticketTrend.value.at(-1)?.value ?? 0)
</script>

<template>
  <div class="space-y-8">
    <!--
      ⚠️ 這一頁的資料標記約定：標的是「真實」，不是「展示」。

      後台絕大多數數字目前都是 src/mocks 的種子資料，真的接到後端的只有系統
      健康條與最近登入兩塊。標少數比標多數可靠：漏標一個展示區塊，預設會把它
      當成真的（危險）；漏標一個真實區塊，預設會把它當成假的（保守但安全）。

      所以真實資料區塊加 data-real="true"，其餘一律視為展示資料。稽核時：

          grep -rn 'data-real' src/pages/admin/ src/components/admin/

      畫面上刻意不出現「展示」字樣。
    -->

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
            <!--
              用 StatusDot 而非自己寫一顆點：原本是寫死的 bg-emerald-500，
              跟正下方健康條的 ok 燈（bg-primary）在同一個畫面上呈現兩種
              「正常」的顏色。這裡不給 label——StatusDot 的 label 是 text-sm，
              這顆徽章是 text-xs。

              文案從「運作正常」改成「服務中」：這個徽章只反映
              settings.maintenanceMode，它不知道資料庫、API 或 LLM 的狀況。
              「運作正常」是個它擔不起的全域宣告，而且就掛在一條正在回報
              「LLM Provider 無法取得」的健康條上方。
            -->
            <StatusDot :tone="maintenanceActive ? 'danger' : 'ok'" />
            {{ maintenanceActive ? '維護中' : '服務中' }}
            <span class="text-muted-foreground">·</span>
            {{ maintenanceDetail }}
          </component>
        </div>
        <div>
          <h1 class="text-4xl font-black tracking-tight">後台總覽</h1>
          <p class="mt-2 text-muted-foreground">
            平台目前的規模與案件流動，以及需要你處理的事。
          </p>
        </div>
      </div>
    </div>

    <FeatureOutageBanner />

    <!--
      系統健康條：真實資料，來自 adminMetricsApi.ts 打的 /api/admin/metrics
      （dbPool、requests），門檻判斷沿用 src/utils/admin-monitoring.ts。
      讀不到或尚未接上（LLM provider）一律顯示「無法取得」，不放假的綠燈——
      見 src/utils/admin-health-bar.ts。
    -->
    <Card data-real="true" class="rounded-3xl">
      <CardContent class="flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
        <p class="shrink-0 text-sm font-medium text-muted-foreground">系統健康</p>
        <div v-for="item in healthBarItems" :key="item.id" class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ item.name }}</span>
          <StatusDot :tone="item.tone" :label="item.statusText" />
        </div>
      </CardContent>
    </Card>

    <!--
      展示資料（無 data-real）。主角卡「今日待處理」用的是 useAdminQueue 的
      總數，與頂部列待辦抽屜的徽章同一個來源，不會對不起來。沒有加鑽取箭頭
      ——這個數字橫跨工單與 AI 額度告急兩種待辦，沒有單一個「點進去就是這個
      數字」的目的地，硬加箭頭反而是誤導。

      三張 KPI 卡的數字、sparkline、trend 都是 src/mocks 種子資料算出來的，
      不是資料庫裡的真實統計。押金不符沒有 trend／spark——這批種子資料沒有
      歷史快照可以比較，寧可留白也不假造一個歷史趨勢。
    -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="今日待處理" :value="queueCount" sublabel="待辦佇列目前總數" hero />
      <StatTile
        label="使用者總數"
        :value="users.length"
        sublabel="平台累計註冊"
        :trend="userGrowthTrendPercent"
        :spark="userGrowthSpark"
        to="/admin/users"
      />
      <StatTile
        label="本週新增工單"
        :value="weeklyTicketCount"
        sublabel="近 7 天報修申請"
        :trend="ticketTrendPercent"
        :spark="ticketTrendSpark"
        to="/admin/maintenance-tickets"
      />
      <StatTile
        label="押金不符"
        :value="depositStats.mismatchedCount"
        sublabel="待處理的聲明落差"
        to="/admin/users?alert=deposit-mismatch"
      />
    </section>

    <!-- 平台規模與組成 -->
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
      展示資料：AI 額度一覽的進度環。百分比來自 useAdminAiUsage()
      （src/mocks/admin/ai-usage.ts 產生的每日用量種子資料，對照系統設定的
      額度上限算出來），不是真的 API 呼叫量統計。
    -->
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card class="flex h-full flex-col rounded-3xl">
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium">AI 額度一覽</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-1 items-center justify-around gap-2">
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
      各自佔一整列緊湊。左邊是真實資料、右邊是展示資料，所以只有左邊有
      data-real——約定見本頁最上方的說明。
    -->
    <section class="grid items-start gap-4 lg:grid-cols-2">
      <!--
        最近登入：真實資料，直接用 realAccounts（useAdminDirectory 回傳的原始
        AdminAccount[]，來自後端 /api/admin/users），依 lastLoginAt 排序取前 5。
        沒有頭像可用（avatar_url 多半是 null），用姓名／email 首字做文字圓形，
        不放灰色人像佔位圖——見 src/utils/admin-recent-logins.ts。
      -->
      <Card data-real="true" class="rounded-3xl">
        <CardHeader>
          <CardTitle>最近登入</CardTitle>
          <CardDescription>真實帳號依最後登入時間排序，最多 5 筆。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2.5">
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
            真實帳號讀取中…
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
        展示資料（無 data-real）：事件來自 createAdminCollection('audit',
        seedAuditEvents)，是本機種子資料加上這個瀏覽器自己產生的操作紀錄，
        不是後端的稽核表。
      -->
      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle>最新稽核事件</CardTitle>
          <CardDescription>最近 5 筆，完整紀錄請到稽核紀錄查詢。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2.5 text-sm">
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
          <p v-if="events.length === 0" class="py-6 text-center text-muted-foreground">
            尚無稽核事件。
          </p>
        </CardContent>
      </Card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Textarea } from '@/components/ui/textarea/index'
import { Progress } from '@/components/ui/progress/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { ArrowLeft, BadgeCheck, ChevronDown, ExternalLink, Plus, Send, ShieldAlert } from 'lucide-vue-next'
import FeatureOutageBanner from '@/src/components/admin/FeatureOutageBanner.vue'
import TicketDetailPanel from '@/src/components/admin/TicketDetailPanel.vue'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import {
  adminRoleLabels,
  useAdminUsers,
} from '@/src/composables/admin/useAdminUsers'
import { useAdminSubscription } from '@/src/composables/admin/useAdminSubscription'
import {
  useAdminMaintenance,
  type MaintenanceTicketView,
} from '@/src/composables/admin/useAdminMaintenance'
import {
  caseSideLabels,
  type UserDepositView,
} from '@/src/utils/admin-user-directory'
import { depositMatchLabels } from '@/src/utils/admin-deposit'
import { useAdminHandover } from '@/src/composables/admin/useAdminHandover'
import {
  handoverItemLabel,
  handoverOutcome,
  handoverOutcomeLabels,
  type HandoverItem,
} from '@/src/utils/admin-handover'
import {
  demoHandoverViews,
  realDepositView,
  type HandoverView,
  type UserRecords,
} from '@/src/utils/admin-user-records'
import { fetchUserRecords } from '@/src/services/adminUserRecordsApi'
import AdminLoadNotice from '@/src/components/admin/AdminLoadNotice.vue'
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceStatusTone,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { formatDate, formatDateTime } from '@/src/utils/admin-format'
import { NO_LOGIN_RECORD_HINT, lastLoginText } from '@/src/utils/admin-user-list'
import {
  accountStatusTone,
  depositMatchTone,
  handoverOutcomeTone,
  handoverResultTone,
  subscriptionFlags,
} from '@/src/utils/admin-user-detail'
import { useNow } from '@/src/composables/useNow'
import type { AdminUserRole, PlanId } from '@/src/mocks/admin-seed'
import type { Subscription, SubscriptionPlan } from '@/src/mocks/admin/subscription'
import {
  PLAN_FEATURES,
  PLAN_FEATURE_KEYS,
  effectivePlanId,
  isInTrial,
  isMetered,
  type PlanFeatureKey,
} from '@/src/utils/admin-entitlements'
import { useRegisterAdminPageTitle } from '@/src/composables/admin/useAdminPageTitle'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { fetchAdminAudit, type ServerAuditEvent } from '@/src/services/adminAuditApi'
import { latestSuspension, suspensionNote } from '@/src/utils/admin-audit-sources'
import { planInclusions } from '@/src/utils/admin-plan-summary'

const route = useRoute()
const router = useRouter()

const { rowOf, setRealAccountStatus } = useAdminDirectory()
const { setStatus, setRole } = useAdminUsers()
const { plans, planOf, changePlan, grantCredits, isExpiringSoon } = useAdminSubscription()
const { ticketViews } = useAdminMaintenance()
const { records: handoverRecords } = useAdminHandover()

const userId = computed(() => String(route.params.id ?? ''))
const row = computed(() => rowOf(userId.value))

// 必須放在 row 之後：watcher 是 immediate，setup 當下就會讀 row.value
useRegisterAdminPageTitle(
  computed(() => route.path),
  computed(() => row.value?.user.nickname ?? row.value?.user.email ?? null),
)

/**
 * 這一頁看的是不是資料庫裡真的存在的人。
 *
 * 真實帳號與展示資料走的是完全不同的路：停用真實帳號要打後端 API，
 * 展示資料只改 localStorage。這一頁原本不分，一律呼叫展示資料的
 * setStatus —— 它只在 localStorage 裡找人，找不到 real-2 這種 id 就直接
 * return。結果真實帳號的「停用帳號」按了沒有任何作用、也沒有任何錯誤：
 * 管理員以為停用了，對方其實還登得進來。
 */
const isReal = computed(() => row.value?.realAccountId !== undefined)

const now = useNow()

const subscriptionStatusFlags = computed(() => {
  const current = row.value
  if (!current?.subscription) return []
  return subscriptionFlags({
    active: current.subscription.active,
    expiringSoon: isExpiringSoon(current.subscription),
    quotaExhausted: current.quotaExhausted,
  })
})

// ── 押金對帳、點交存證 ─────────────────────────────────────────────
//
// 真實帳號讀後端：房東的租約對上租客的合約、租客點交的 AI 比對結果（見
// backend/admin/user_records.py）。展示帳號用瀏覽器裡的示範資料。兩種整理成
// 同一種形狀（admin-user-records.ts），下面的畫面只有一條路徑。
const realRecords = ref<UserRecords | null>(null)
const recordsState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

async function loadRecords(): Promise<void> {
  const id = row.value?.realAccountId
  if (id === undefined) {
    realRecords.value = null
    recordsState.value = 'idle'
    return
  }
  // 先清掉：從一個人的頁面切到另一個人時，讀到之前不能還顯示上一個人的押金與點交
  realRecords.value = null
  recordsState.value = 'loading'
  const result = await fetchUserRecords(id)
  // 讀的途中換到別人的頁面，這份結果就不是現在這個人的
  if (row.value?.realAccountId !== id) return
  realRecords.value = result
  recordsState.value = result ? 'ready' : 'error'
}

// 放在 row 之後：immediate 的 watcher 在 setup 當下就會執行
watch(() => row.value?.realAccountId, () => void loadRecords(), { immediate: true })

/** 真實帳號還沒讀到（或讀不到）時不能顯示「0 筆」，那會看起來像真的沒有 */
const recordsReady = computed(() => !isReal.value || recordsState.value === 'ready')

const depositViews = computed<UserDepositView[]>(() =>
  isReal.value ? (realRecords.value?.deposits.map(realDepositView) ?? []) : (row.value?.deposits ?? []),
)

const mismatchedDepositCount = computed(
  () => depositViews.value.filter((deposit) => deposit.match === 'mismatched').length,
)

// 同一筆案件會同時掛在房東與租客兩邊，詳情頁依身分拆成兩區，空的那區不顯示
const depositGroups = computed(() =>
  (['tenant', 'landlord'] as const)
    .map((side) => ({ side, items: depositViews.value.filter((d) => d.side === side) }))
    .filter((group) => group.items.length > 0),
)

const ticketGroups = computed(() =>
  (['tenant', 'landlord'] as const)
    .map((side) => ({ side, items: row.value?.tickets.filter((t) => t.side === side) ?? [] }))
    .filter((group) => group.items.length > 0),
)

const handoverViews = computed<HandoverView[]>(() =>
  isReal.value
    ? (realRecords.value?.handovers ?? [])
    : demoHandoverViews(handoverRecords.value, userId.value),
)

// 點交紀錄同樣兩造都掛，依這個人是房東還是租客分開列
const handoverGroups = computed(() =>
  (['tenant', 'landlord'] as const)
    .map((side) => ({ side, items: handoverViews.value.filter((record) => record.side === side) }))
    .filter((group) => group.items.length > 0),
)

const handoverDamagedCount = computed(
  () => handoverViews.value.filter((record) => handoverOutcome(record.items) === 'damaged').length,
)

function confidenceText(item: HandoverItem): string {
  return item.confidence === null ? '' : `AI 信心 ${Math.round(item.confidence * 100)}%`
}


const selectedTicketId = ref<string | null>(null)
const selectedTicket = computed<MaintenanceTicketView | null>(
  () => ticketViews.value.find((ticket) => ticket.id === selectedTicketId.value) ?? null,
)

function formatMoney(amount: number): string {
  return `NT$${amount.toLocaleString('zh-TW')}`
}

function storageLabel(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`
}

function usagePercent(used: number, quota: number): number {
  if (quota <= 0) return 0
  return Math.min(100, Math.round((used / quota) * 100))
}

// ── 試用 ────────────────────────────────────────────────────────

const inTrial = computed(
  () => !!row.value?.subscription && isInTrial(row.value.subscription.trialEndsAt),
)

/** 試用期間實際生效的方案，可能與他名下掛的不同 */
/*
 * 「方案包含什麼」：方案內容只由程式定義（系統設定頁不再能改），需要查的時機
 * 是處理某個人的時候 —— 所以放在他的方案旁邊，連他用了多少一起講。
 * 逐人用量目前只有契約分析有記錄，其他功能只列上限。
 */
const planDetailsOpen = ref(false)
const planItems = computed(() => {
  const subscription = row.value?.subscription
  const plan = effectivePlan.value
  if (!subscription || !plan) return []
  return planInclusions(plan.features, {
    used: { 'contract-analysis': subscription.aiUsed },
    extraCredits: subscription.extraCredits,
  })
})

const effectivePlan = computed<SubscriptionPlan | null>(() => {
  const subscription = row.value?.subscription
  if (!subscription) return null
  const planId = effectivePlanId(subscription.planId, subscription.trialEndsAt)
  return plans.value.find((plan) => plan.id === planId) ?? planOf(subscription)
})

const trialDaysLeft = computed(() => {
  const endsAt = row.value?.subscription?.trialEndsAt
  if (!endsAt) return 0
  const ms = new Date(endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
})

// ── 單次加購 ────────────────────────────────────────────────────

const meteredKeys = PLAN_FEATURE_KEYS.filter(isMetered)

const creditOpen = ref(false)
const creditKey = ref<PlanFeatureKey>('contract-analysis')
const creditAmount = ref(10)

const creditsInUse = computed(() =>
  meteredKeys
    .map((key) => ({ key, amount: row.value?.subscription?.extraCredits[key] ?? 0 }))
    .filter((item) => item.amount > 0),
)

function openCreditDialog(): void {
  creditKey.value = 'contract-analysis'
  creditAmount.value = 10
  creditOpen.value = true
}

function confirmCredit(): void {
  if (!row.value?.subscription) return
  grantCredits(row.value.subscription.id, creditKey.value, creditAmount.value)
  creditOpen.value = false
}

/** 契約分析的可用次數，含單次加購。無上限時顯示「無上限」而不是一個假的大數字。 */
function analysisAllowance(subscription: Subscription, plan: SubscriptionPlan): number | null {
  const rule = plan.features['contract-analysis']
  if (!rule.enabled) return 0
  if (rule.limit === null) return null
  return rule.limit + (subscription.extraCredits['contract-analysis'] ?? 0)
}

function analysisLimitLabel(subscription: Subscription, plan: SubscriptionPlan): string {
  const allowance = analysisAllowance(subscription, plan)
  return allowance === null ? '無上限' : String(allowance)
}

/** 無上限時進度條固定為 0 —— 沒有分母就沒有百分比可言 */
function analysisPercent(subscription: Subscription, plan: SubscriptionPlan): number {
  const allowance = analysisAllowance(subscription, plan)
  if (allowance === null) return 0
  return usagePercent(subscription.aiUsed, allowance)
}


// 身分只對展示資料開放。真實帳號在畫面上是唯讀的（見 template），
// 這裡再擋一次：後端沒有改角色的 API，就算有人繞過畫面呼叫到這裡，
// 也不能讓它「看起來改了」。
function handleRoleChange(value: unknown): void {
  if (!row.value || isReal.value) return
  setRole(row.value.user.id, value as AdminUserRole)
}

const statusBusy = ref(false)
const statusError = ref('')
/** 停用走確認框（跟列表頁同一種），可以附原因；啟用是把權限還回去，維持一鍵 */
const suspendOpen = ref(false)
const suspendReason = ref('')

function toggleStatus(): void {
  const current = row.value
  if (!current) return
  if (current.user.status === 'active') {
    suspendReason.value = ''
    suspendOpen.value = true
    return
  }
  void applyStatus('active')
}

async function confirmSuspend(): Promise<void> {
  suspendOpen.value = false
  await applyStatus('suspended', suspendReason.value)
}

async function applyStatus(next: 'active' | 'suspended', reason?: string): Promise<void> {
  const current = row.value
  if (!current) return

  if (!isReal.value) {
    setStatus(current.user.id, next, reason)
    return
  }

  // 真實帳號走後端，跟列表頁的停用同一條路。後端的拒絕理由
  // （不能停用自己、這是最後一位管理員）要原樣顯示，靜靜失敗最糟。
  statusError.value = ''
  statusBusy.value = true
  try {
    await setRealAccountStatus(current, next, reason)
    await loadStatusHistory()
  } catch (error) {
    statusError.value = error instanceof Error ? error.message : '操作失敗，請稍後再試。'
  } finally {
    statusBusy.value = false
  }
}

/*
 * 「停用中」旁邊的那一句：最近一次停用的原因、誰停的、什麼時候。
 * 真實帳號讀後端的稽核紀錄；展示帳號的停用本來就只記在這台瀏覽器，讀本機那份。
 * 這個功能上線前就被停用的帳號沒有紀錄，就不顯示，不編一句出來。
 */
const { events: localAuditEvents } = useAdminAudit()
const serverStatusHistory = ref<ServerAuditEvent[]>([])

async function loadStatusHistory(): Promise<void> {
  const id = row.value?.realAccountId
  if (id === undefined) {
    serverStatusHistory.value = []
    return
  }
  serverStatusHistory.value = (await fetchAdminAudit({ subject: `user:${id}`, limit: 50 })) ?? []
}

// 放在 row、isReal 之後：immediate 的 watcher 在 setup 當下就會執行
watch(() => row.value?.realAccountId, () => void loadStatusHistory(), { immediate: true })

const suspensionText = computed(() => {
  const current = row.value
  if (!current || current.user.status !== 'suspended') return null
  const latest = isReal.value
    ? latestSuspension(serverStatusHistory.value)
    : latestSuspension(localAuditEvents.value.filter((event) => event.target === current.user.email))
  return latest ? suspensionNote(latest) : null
})

function handlePlanChange(value: unknown): void {
  if (!row.value?.subscription) return
  changePlan(row.value.subscription.id, value as PlanId)
}

function goToTickets(): void {
  void router.push({ path: '/admin/maintenance-tickets', query: { user: userId.value } })
}

// ── 發送通知 ────────────────────────────────────────────────────
// 發送流程整個搬到 /admin/notifications/compose（整頁編輯器）。
//
// 原本刻意留在本頁顯示提示、不導頁，理由是「管理員多半要接著看下一列」。
// 那個取捨在對話框時代成立；整頁編輯器帶得動預覽、收件人試算與排程，
// 留一個縮水版的對話框在這裡只會讓兩套組字邏輯繼續漂移。
// 編輯器送完會導回通知管理，要回到這一頁按瀏覽器上一頁即可。

function openSendDialog(): void {
  if (!row.value) return
  void router.push({
    path: '/admin/notifications/compose',
    query: { to: row.value.user.email },
  })
}
</script>

<template>
  <div v-if="row" class="space-y-4">
    <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/admin/users')">
      <ArrowLeft class="mr-1 h-4 w-4" />
      返回使用者列表
    </Button>

    <!--
      左右兩欄：左邊是固定的個人資料卡（這是誰、能對他做什麼），右邊是
      他在各模組的資料。原本一欄到底，展示帳號的頁面高 1515px，往下看押金
      或工單時，身分與操作按鈕早就捲出畫面了。

      左欄 sticky 時限制高度並允許內部捲動 —— sticky 元素比視窗高的話，
      它的下半部在頁面捲到底之前永遠看不到（sticky 的已知陷阱）。
    -->
    <div class="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside
        class="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
      >
        <div class="space-y-5 rounded-3xl border bg-card p-5 shadow-sm">
          <!--
            名字已經在頂部列的麵包屑（useRegisterAdminPageTitle），這裡放的是
            辨識這個帳號用的資料：Email 與暱稱。
          -->
          <div class="space-y-1">
            <div class="flex items-center gap-1.5">
              <span class="break-all font-semibold">{{ row.user.email }}</span>
              <span :title="row.user.emailVerified ? 'Email 已驗證' : 'Email 未驗證'">
                <!-- 跟列表頁同一組：--accent 是填色不是文字色，未驗證的圖示包在實心琥珀小圓裡 -->
                <BadgeCheck v-if="row.user.emailVerified" class="h-4 w-4 shrink-0 text-success" />
                <span v-else class="inline-flex rounded-full bg-accent p-0.5">
                  <ShieldAlert class="h-3 w-3 text-accent-foreground" />
                </span>
                <span class="sr-only">{{ row.user.emailVerified ? 'Email 已驗證' : 'Email 未驗證' }}</span>
              </span>
            </div>
            <p class="text-sm text-muted-foreground">{{ row.user.nickname ?? '沒有暱稱' }}</p>
          </div>

          <!--
            狀態用 StatusDot：正常是安靜的綠點，停用才整顆上色。原本「正常」是
            Badge 的 default variant —— 實心紫，整頁最搶眼的反而是沒事的狀態。
            身分不是狀態，改成純文字。
          -->
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm">
            <dt class="text-foreground/70">狀態</dt>
            <dd>
              <StatusDot
                :tone="accountStatusTone(row.user.status)"
                :label="row.user.status === 'active' ? '正常' : '停用'"
                emphasize
              />
              <p v-if="suspensionText" class="mt-1.5 text-xs text-foreground/70">{{ suspensionText }}</p>
            </dd>

            <dt class="text-foreground/70">身分</dt>
            <dd>
              <Select
                v-if="!isReal"
                :model-value="row.user.role"
                @update:model-value="handleRoleChange"
              >
                <SelectTrigger class="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">租客</SelectItem>
                  <SelectItem value="landlord">房東</SelectItem>
                  <SelectItem value="admin">管理員</SelectItem>
                </SelectContent>
              </Select>
              <span v-else class="font-medium">{{ adminRoleLabels[row.user.role] }}</span>
            </dd>

            <dt class="text-foreground/70">註冊於</dt>
            <dd>{{ formatDate(row.user.registeredAt) }}</dd>

            <dt class="text-foreground/70">最後登入</dt>
            <dd
              :title="row.user.lastLoginAt ? formatDateTime(row.user.lastLoginAt) : NO_LOGIN_RECORD_HINT"
              :class="row.user.lastLoginAt ? '' : 'text-muted-foreground'"
            >
              {{ lastLoginText(row.user.lastLoginAt, now) }}
            </dd>
          </dl>

          <!--
            真實帳號的角色不開放從網頁改：後端沒有這支 API，而且這是刻意的 ——
            管理員只能由能登入伺服器的人用 manage_admin.py 授予（見 admin.py）。
          -->
          <p v-if="isReal" class="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            身分在這裡是唯讀，需要由系統管理者在伺服器上調整。
          </p>

          <p
            v-if="statusError"
            class="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {{ statusError }}
          </p>

          <div class="flex flex-col gap-2">
            <!--
              跟列表頁同一條規則：只有真實帳號能發通知。對展示帳號發通知會產生
              一筆「已送達給不存在的人」的紀錄，看起來跟真的一模一樣。
            -->
            <Button v-if="isReal" @click="openSendDialog">
              <Send class="mr-1.5 h-4 w-4" />
              發送通知
            </Button>
            <Button
              :variant="row.user.status === 'active' ? 'destructive' : 'outline'"
              :disabled="statusBusy"
              @click="toggleStatus"
            >
              {{ statusBusy ? '處理中…' : row.user.status === 'active' ? '停用帳號' : '啟用帳號' }}
            </Button>
          </div>
        </div>

        <!--
          原本頂部那四張 text-2xl 的大卡片。它們是「這個人的資料」而不是頁面
          等級的 KPI，所以併進左欄，用跟工單詳情同一種重點資料格。
          異常才上色：不符、逾期用實心紅 chip，其餘安靜。
        -->
        <dl class="grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-muted/40 p-5 text-sm">
          <div class="space-y-0.5">
            <dt class="text-xs text-foreground/70">AI 用量</dt>
            <dd class="font-semibold tabular-nums">
              <template v-if="row.subscription && effectivePlan">
                {{ row.subscription.aiUsed }} / {{ analysisLimitLabel(row.subscription, effectivePlan) }}
              </template>
              <span v-else class="font-normal text-muted-foreground">—</span>
            </dd>
          </div>
          <div class="space-y-0.5">
            <dt class="text-xs text-foreground/70">儲存用量</dt>
            <dd class="font-semibold tabular-nums">
              <template v-if="row.subscription">{{ storageLabel(row.subscription.storageUsedMb) }}</template>
              <span v-else class="font-normal text-muted-foreground">—</span>
            </dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs text-foreground/70">押金對帳</dt>
            <dd class="font-semibold tabular-nums">
              <template v-if="recordsReady">{{ depositViews.length }} 筆</template>
              <span v-else class="font-normal text-muted-foreground">—</span>
            </dd>
            <dd v-if="mismatchedDepositCount > 0">
              <StatusDot tone="danger" :label="`${mismatchedDepositCount} 筆不符`" emphasize />
            </dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs text-foreground/70">工單待處理</dt>
            <dd class="font-semibold tabular-nums">{{ row.openTicketCount }} 件</dd>
            <dd v-if="row.overdueTicketCount > 0">
              <StatusDot tone="danger" :label="`${row.overdueTicketCount} 件逾期`" emphasize />
            </dd>
          </div>
        </dl>
      </aside>

      <div class="min-w-0 space-y-6">
        <!-- 訂閱與容量 -->
        <Card class="rounded-3xl">
          <CardHeader class="p-5"><CardTitle>訂閱與容量</CardTitle></CardHeader>
          <CardContent class="px-5 pb-5">
            <!--
              真實帳號永遠沒有訂閱資料（後端沒有訂閱功能），畫面上跟沒訂閱的展示帳號寫法一樣：
              網站目前不對外開放，後台不再區分真實帳號與展示資料（2026-09-28 決定）。
            -->
            <p v-if="!row.subscription" class="text-muted-foreground">此帳號尚未訂閱任何方案。</p>

            <div v-else-if="effectivePlan" class="space-y-4">
              <div class="flex flex-wrap items-start gap-6">
                <div class="space-y-1.5">
                  <p class="text-sm text-muted-foreground">方案</p>
                  <Select :model-value="row.subscription.planId" @update:model-value="handlePlanChange">
                    <SelectTrigger class="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">免費方案</SelectItem>
                      <SelectItem value="plus">進階方案</SelectItem>
                      <SelectItem value="pro">專業方案</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-1.5">
                  <p class="text-sm text-muted-foreground">到期日</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium">{{ formatDate(row.subscription.expiresAt) }}</span>
                    <!-- 即將到期、額度已用滿是列表的警示條件（warn）；已停用是既成事實（idle） -->
                    <StatusDot
                      v-for="flag in subscriptionStatusFlags"
                      :key="flag.label"
                      :tone="flag.tone"
                      :label="flag.label"
                      emphasize
                    />
                  </div>
                </div>
                <div v-if="inTrial" class="space-y-1.5">
                  <p class="text-sm text-muted-foreground">限時試用</p>
                  <!-- 試用天數是資訊不是狀態，不需要膠囊 -->
                  <p class="text-sm">
                    <span class="font-medium">還有 {{ trialDaysLeft }} 天</span>
                    <span class="text-muted-foreground">
                      ，期間享 {{ effectivePlan.name }}權益，到期自動回到{{ planOf(row.subscription).name }}
                    </span>
                  </p>
                </div>
              </div>

              <div class="rounded-2xl border">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/40"
                  :aria-expanded="planDetailsOpen"
                  @click="planDetailsOpen = !planDetailsOpen"
                >
                  <span>
                    {{ effectivePlan.name }}包含什麼
                    <span v-if="inTrial" class="font-normal text-muted-foreground">（試用中）</span>
                  </span>
                  <ChevronDown
                    class="h-4 w-4 shrink-0 transition-transform"
                    :class="planDetailsOpen ? 'rotate-180' : ''"
                    aria-hidden="true"
                  />
                </button>
                <dl
                  v-if="planDetailsOpen"
                  class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-t px-4 py-3 text-sm"
                >
                  <template v-for="item in planItems" :key="item.key">
                    <dt class="text-foreground/70">{{ item.label }}</dt>
                    <dd :class="item.included ? 'font-medium' : 'text-muted-foreground'">{{ item.text }}</dd>
                  </template>
                </dl>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">AI 分析</span>
                    <span class="tabular-nums">
                      {{ row.subscription.aiUsed }} /
                      {{ analysisLimitLabel(row.subscription, effectivePlan) }} 次
                    </span>
                  </div>
                  <Progress :model-value="analysisPercent(row.subscription, effectivePlan)" />
                </div>
                <div class="space-y-1.5">
                  <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">儲存空間</span>
                    <span class="tabular-nums">
                      {{ storageLabel(row.subscription.storageUsedMb) }} /
                      {{ storageLabel(effectivePlan.storageMb) }}
                    </span>
                  </div>
                  <Progress
                    :model-value="usagePercent(row.subscription.storageUsedMb, effectivePlan.storageMb)"
                  />
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/40 p-4">
                <div class="space-y-1">
                  <p class="text-sm font-medium">單次加購額度</p>
                  <p v-if="creditsInUse.length === 0" class="text-sm text-muted-foreground">
                    尚未加購，目前只使用方案內建的額度。
                  </p>
                  <p v-else class="text-sm text-muted-foreground">
                    <span v-for="(item, index) in creditsInUse" :key="item.key">
                      <span v-if="index > 0">、</span>
                      {{ PLAN_FEATURES[item.key].label }} +{{ item.amount }}
                      {{ PLAN_FEATURES[item.key].unit }}
                    </span>
                  </p>
                </div>
                <Button variant="outline" size="sm" @click="openCreditDialog">
                  <Plus class="mr-1 h-4 w-4" />
                  加購額度
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!--
          押金對帳：真實帳號是真實資料（/api/admin/users/{id}/records），展示帳號是示範資料。
          讀不到時換成提示，不顯示「沒有相關的押金記錄」。
        -->
        <Card :data-real="isReal ? 'true' : undefined" class="rounded-3xl">
          <CardHeader class="p-5">
            <CardTitle>押金對帳</CardTitle>
            <p class="text-sm text-muted-foreground">
              平台不經手押金，只比對兩邊寫的金額：房東在 RentMate 建的租約，對上租客自己存的合約。
            </p>
          </CardHeader>
          <CardContent class="space-y-6 px-5 pb-5">
            <AdminLoadNotice
              v-if="!recordsReady"
              :state="recordsState"
              what="押金與點交資料"
              @retry="loadRecords"
            />
            <p v-else-if="depositViews.length === 0" class="text-muted-foreground">沒有相關的押金記錄。</p>

            <div v-for="group in depositGroups" :key="group.side" class="space-y-2">
              <h3 class="text-xs font-semibold tracking-wide text-foreground/70">
                以{{ caseSideLabels[group.side] }}身分
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="min-w-[10rem]">地址</TableHead>
                    <TableHead class="whitespace-nowrap">月租</TableHead>
                    <TableHead class="whitespace-nowrap">房東聲明已收</TableHead>
                    <TableHead class="whitespace-nowrap">租客聲明已付</TableHead>
                    <TableHead class="whitespace-nowrap">對帳結果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="deposit in group.items" :key="deposit.id">
                    <TableCell>{{ deposit.address }}</TableCell>
                    <TableCell class="whitespace-nowrap tabular-nums">{{ formatMoney(deposit.monthlyRent) }}</TableCell>
                    <TableCell class="whitespace-nowrap tabular-nums">
                      {{ formatMoney(deposit.landlordDeclared) }}
                    </TableCell>
                    <TableCell class="whitespace-nowrap tabular-nums">
                      <span v-if="deposit.tenantDeclared === null" class="text-muted-foreground">未聲明</span>
                      <span v-else>{{ formatMoney(deposit.tenantDeclared) }}</span>
                    </TableCell>
                    <!--
                      表格裡原則上不開 emphasize（一整欄實心色塊很難掃）。這裡開，是因為
                      只有「不符」會變成實心，其餘都是小圓點 —— 一欄裡偶爾一顆紅，正是要它跳出來。
                    -->
                    <TableCell class="whitespace-nowrap">
                      <div class="flex items-center gap-2">
                        <StatusDot
                          :tone="depositMatchTone(deposit.match)"
                          :label="depositMatchLabels[deposit.match]"
                          emphasize
                        />
                        <span v-if="deposit.gap > 0" class="text-sm text-destructive">
                          差 {{ formatMoney(deposit.gap) }}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <!--
          點交存證：租客拍的入住、退租照片由 AI 逐項比對（backend/routers/inspection.py）。
          真實帳號是真實資料，展示帳號是示範資料。後台只顯示比對結果，不顯示照片（2026-09-30 決定）。
        -->
        <Card v-if="handoverGroups.length > 0" :data-real="isReal ? 'true' : undefined" class="rounded-3xl">
          <CardHeader class="p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>點交存證</CardTitle>
              <StatusDot
                v-if="handoverDamagedCount > 0"
                tone="danger"
                :label="`${handoverDamagedCount} 份有損壞`"
                emphasize
              />
            </div>
            <p class="text-sm text-muted-foreground">
              租客拍的入住、退租照片由 AI 逐項比對。這裡只顯示比對結果，不顯示照片。
            </p>
          </CardHeader>

          <CardContent class="space-y-6 px-5 pb-5">
            <FeatureOutageBanner feature-key="handover" />

            <div v-for="group in handoverGroups" :key="group.side" class="space-y-3">
              <h3 class="text-xs font-semibold tracking-wide text-foreground/70">
                以{{ caseSideLabels[group.side] }}身分
              </h3>

              <div
                v-for="record in group.items"
                :key="record.id"
                class="space-y-2 rounded-2xl border p-4"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ record.address }}</p>
                    <p class="text-xs text-muted-foreground">
                      最後更新 {{ formatDate(record.updatedAt) }}・共 {{ record.items.length }} 項
                    </p>
                  </div>
                  <StatusDot
                    :tone="handoverOutcomeTone(handoverOutcome(record.items))"
                    :label="handoverOutcomeLabels[handoverOutcome(record.items)]"
                    emphasize
                  />
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="whitespace-nowrap">位置</TableHead>
                      <TableHead class="whitespace-nowrap">品項</TableHead>
                      <TableHead class="whitespace-nowrap">AI 比對</TableHead>
                      <TableHead class="min-w-[12rem]">說明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="item in record.items" :key="item.id">
                      <TableCell class="whitespace-nowrap text-muted-foreground">{{ item.room }}</TableCell>
                      <!-- 品項名稱都很短，讓說明欄去換行；不然窄的時候「冷氣」會被擠成一字一行 -->
                      <TableCell class="whitespace-nowrap">{{ item.name }}</TableCell>
                      <!-- 跟押金一樣開 emphasize：只有損壞、無法判斷會變實心，一欄裡偶爾幾顆才跳得出來 -->
                      <TableCell class="whitespace-nowrap">
                        <StatusDot
                          :tone="handoverResultTone(item.result)"
                          :label="handoverItemLabel(item)"
                          emphasize
                        />
                      </TableCell>
                      <TableCell>
                        <template v-if="item.summary">
                          <p>{{ item.summary }}</p>
                          <p v-if="item.confidence !== null" class="text-xs text-muted-foreground">
                            {{ confidenceText(item) }}
                          </p>
                        </template>
                        <span v-else class="text-muted-foreground">—</span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 報修工單 -->
        <Card class="rounded-3xl">
          <CardHeader class="p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>報修工單</CardTitle>
              <!-- 真實帳號在工單頁也查不到任何東西（原因見下方說明），不給一顆會帶到空頁的按鈕 -->
              <Button v-if="!isReal" variant="outline" size="sm" @click="goToTickets">
                在工單頁查看全部
                <ExternalLink class="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent class="space-y-6 px-5 pb-5">
            <!--
              注意：這裡的「沒有」不代表對方沒報修過。前台（租客端與房東端）的報修
              自 2026-09-30 起存在資料庫（repair_tickets／repair_ticket_events／
              repair_ticket_photos，API 見 backend/routers/repairs.py），但後台工單頁讀的
              仍是另一份 adminMaintenanceCollection，兩邊還沒接起來。
              畫面上不說明這件事（2026-09-28 決定）。
            -->
            <p v-if="row.tickets.length === 0" class="text-muted-foreground">沒有相關的報修工單。</p>

            <div v-for="group in ticketGroups" :key="group.side" class="space-y-2">
              <h3 class="text-xs font-semibold tracking-wide text-foreground/70">
                以{{ caseSideLabels[group.side] }}身分
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="whitespace-nowrap">編號</TableHead>
                    <TableHead class="min-w-[10rem]">地址</TableHead>
                    <TableHead class="whitespace-nowrap">分類</TableHead>
                    <TableHead class="whitespace-nowrap">狀態</TableHead>
                    <TableHead class="whitespace-nowrap">建立日</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="ticket in group.items"
                    :key="ticket.id"
                    class="cursor-pointer"
                    @click="selectedTicketId = ticket.id"
                  >
                    <TableCell class="whitespace-nowrap font-medium">{{ ticket.id }}</TableCell>
                    <TableCell>{{ ticket.address }}</TableCell>
                    <TableCell class="whitespace-nowrap">
                      {{ maintenanceCategoryLabels[ticket.category] }}
                    </TableCell>
                    <TableCell class="whitespace-nowrap">
                      <!-- 與工單頁共用同一套顏色對應 -->
                      <StatusDot
                        :tone="maintenanceStatusTone(ticket.status)"
                        :label="maintenanceStatusLabels[ticket.status]"
                      />
                    </TableCell>
                    <TableCell class="whitespace-nowrap">{{ formatDate(ticket.createdAt) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <Dialog
      :open="selectedTicket !== null"
      @update:open="(open: boolean) => { if (!open) selectedTicketId = null }"
    >
      <DialogContent v-if="selectedTicket" class="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>工單詳情 · {{ selectedTicket.id }}</DialogTitle>
          <DialogDescription>{{ selectedTicket.address }}</DialogDescription>
        </DialogHeader>
        <TicketDetailPanel :ticket="selectedTicket" />
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="suspendOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>停用「{{ row?.user.nickname?.trim() || row?.user.email }}」？</DialogTitle>
          <DialogDescription>
            停用會立刻生效：對方馬上就登不進來，直到你再把這個帳號啟用。
          </DialogDescription>
        </DialogHeader>

        <!-- 原因選填：寫進稽核紀錄，也會顯示在這一頁的「停用」旁邊 -->
        <div class="space-y-2">
          <Label for="detail-suspend-reason">停用原因（選填）</Label>
          <Textarea
            id="detail-suspend-reason"
            v-model="suspendReason"
            rows="2"
            maxlength="200"
            placeholder="例如：多次發布不當內容"
          />
          <p class="text-xs text-muted-foreground">只寫進稽核紀錄，對方看不到。</p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="suspendOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmSuspend">確認停用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="creditOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>加購單次額度</DialogTitle>
          <DialogDescription>
            加購的額度疊加在方案上限之上，本期未用完不會退回。
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label>功能</Label>
            <Select v-model="creditKey">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="key in meteredKeys" :key="key" :value="key">
                  {{ PLAN_FEATURES[key].label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="creditAmount">加購數量（{{ PLAN_FEATURES[creditKey].unit }}）</Label>
            <Input id="creditAmount" v-model.number="creditAmount" type="number" min="1" />
          </div>
          <p class="text-sm text-muted-foreground">
            這裡只記錄方案權益，不含付款資訊。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="creditOpen = false">取消</Button>
          <Button :disabled="!(creditAmount > 0)" @click="confirmCredit">確認加購</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>

  <div v-else class="space-y-4 py-16 text-center">
    <p class="text-muted-foreground">找不到這個使用者。</p>
    <Button variant="outline" @click="router.push('/admin/users')">返回使用者列表</Button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { ArrowLeft, BadgeCheck, ExternalLink, Plus, Send, ShieldAlert } from 'lucide-vue-next'
import FeatureOutageBanner from '@/src/components/admin/FeatureOutageBanner.vue'
import TicketDetailPanel from '@/src/components/admin/TicketDetailPanel.vue'
import SendNotificationDialog from '@/src/components/admin/notifications/SendNotificationDialog.vue'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import {
  adminRoleLabels,
  getCurrentAdminRole,
  useAdminUsers,
} from '@/src/composables/admin/useAdminUsers'
import { useAdminSubscription } from '@/src/composables/admin/useAdminSubscription'
import {
  useAdminMaintenance,
  type MaintenanceTicketView,
} from '@/src/composables/admin/useAdminMaintenance'
import { ADMIN_ROLES, adminRoleLabels as rbacRoleLabels, type AdminRole } from '@/src/utils/admin-rbac'
import {
  caseSideLabels,
  type UserDepositView,
} from '@/src/utils/admin-user-directory'
import { depositMatchLabels } from '@/src/utils/admin-deposit'
import { useAdminHandover } from '@/src/composables/admin/useAdminHandover'
import {
  handoverAgreementLabels,
  handoverAgreementOf,
  handoverVerdictLabels,
  overallAgreement,
  summarizeHandover,
  type HandoverAgreement,
} from '@/src/utils/admin-handover'
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { formatDate } from '@/src/utils/admin-format'
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

const route = useRoute()
const router = useRouter()

const { rowOf } = useAdminDirectory()
const { setStatus, setRole, setAdminRole } = useAdminUsers()
const { plans, planOf, changePlan, grantCredits, isExpiringSoon } = useAdminSubscription()
const { ticketViews } = useAdminMaintenance()
const { records: handoverRecords } = useAdminHandover()

const userId = computed(() => String(route.params.id ?? ''))
const row = computed(() => rowOf(userId.value))

// 停用帳號與調整角色屬於高風險操作，維持只有超級管理員能執行
const isSuper = computed(() => getCurrentAdminRole() === 'super')

// 同一筆案件會同時掛在房東與租客兩邊，詳情頁依身分拆成兩區，空的那區不顯示
const depositGroups = computed(() =>
  (['tenant', 'landlord'] as const)
    .map((side) => ({ side, items: row.value?.deposits.filter((d) => d.side === side) ?? [] }))
    .filter((group) => group.items.length > 0),
)

const ticketGroups = computed(() =>
  (['tenant', 'landlord'] as const)
    .map((side) => ({ side, items: row.value?.tickets.filter((t) => t.side === side) ?? [] }))
    .filter((group) => group.items.length > 0),
)

// 點交紀錄同樣兩造都掛，依這個人是房東還是租客分開列
const handoverGroups = computed(() =>
  (['tenant', 'landlord'] as const)
    .map((side) => ({
      side,
      items: handoverRecords.value.filter((record) =>
        side === 'tenant'
          ? record.tenantUserId === userId.value
          : record.landlordUserId === userId.value,
      ),
    }))
    .filter((group) => group.items.length > 0),
)

const handoverDisputedCount = computed(
  () =>
    handoverRecords.value.filter(
      (record) =>
        (record.tenantUserId === userId.value || record.landlordUserId === userId.value) &&
        overallAgreement(record.items) === 'disputed',
    ).length,
)

function agreementVariant(agreement: HandoverAgreement): 'default' | 'secondary' | 'destructive' {
  if (agreement === 'disputed') return 'destructive'
  if (agreement === 'pending') return 'secondary'
  return 'default'
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

function matchVariant(deposit: UserDepositView): 'default' | 'secondary' | 'destructive' {
  if (deposit.match === 'mismatched') return 'destructive'
  if (deposit.match === 'pending') return 'secondary'
  return 'default'
}

function statusBadgeVariant(status: MaintenanceStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'overdue' || status === 'disputed') return 'destructive'
  if (status === 'completed' || status === 'closed') return 'secondary'
  return 'default'
}

function handleRoleChange(value: unknown): void {
  if (!row.value) return
  setRole(row.value.user.id, value as AdminUserRole)
}

function handleAdminRoleChange(value: unknown): void {
  if (!row.value) return
  setAdminRole(row.value.user.id, value as AdminRole)
}

function toggleStatus(): void {
  if (!row.value) return
  setStatus(row.value.user.id, row.value.user.status === 'active' ? 'suspended' : 'active')
}

function handlePlanChange(value: unknown): void {
  if (!row.value?.subscription) return
  changePlan(row.value.subscription.id, value as PlanId)
}

function goToTickets(): void {
  void router.push({ path: '/admin/maintenance-tickets', query: { user: userId.value } })
}

// ── 發送通知 ────────────────────────────────────────────────────

const sendDialogOpen = ref(false)
const sentMessage = ref('')
const presetEmails = computed(() => (row.value ? [row.value.user.email] : []))

function openSendDialog(): void {
  sentMessage.value = ''
  sendDialogOpen.value = true
}

// 發完留在原頁顯示提示，不導頁——管理員多半是看完這個人的資料才想到要發通知，
// 導走反而要重新導航回來。
function onSent(payload: { count: number; recipientNames: string[] }): void {
  const name = payload.recipientNames[0] ?? row.value?.user.nickname ?? row.value?.user.email
  sentMessage.value = name ? `已發送給 ${name}。` : `已成功發送給 ${payload.count} 位使用者。`
}
</script>

<template>
  <div v-if="row" class="space-y-6">
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/admin/users')">
          <ArrowLeft class="mr-1 h-4 w-4" />
          返回使用者列表
        </Button>
        <Button size="sm" @click="openSendDialog">
          <Send class="mr-1 h-4 w-4" />
          發送通知
        </Button>
      </div>

      <p v-if="sentMessage" class="text-sm font-medium text-emerald-600">{{ sentMessage }}</p>

      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-3xl font-black tracking-tight">
          {{ row.user.nickname ?? row.user.email }}
        </h1>
        <Badge :variant="row.user.status === 'active' ? 'default' : 'destructive'">
          {{ row.user.status === 'active' ? '正常' : '停用' }}
        </Badge>
        <Badge variant="secondary">{{ adminRoleLabels[row.user.role] }}</Badge>
      </div>

      <div class="flex items-center gap-1.5 text-muted-foreground">
        <span>{{ row.user.email }}</span>
        <span :title="row.user.emailVerified ? 'Email 已驗證' : 'Email 未驗證'">
          <BadgeCheck v-if="row.user.emailVerified" class="h-4 w-4 text-emerald-600" />
          <ShieldAlert v-else class="h-4 w-4 text-amber-600" />
        </span>
        <span class="mx-1">·</span>
        <span>註冊於 {{ formatDate(row.user.registeredAt) }}</span>
      </div>
    </div>

    <!-- 摘要 -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card class="rounded-3xl">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">AI 用量</p>
          <p class="text-2xl font-black">
            <template v-if="row.subscription && effectivePlan">
              {{ row.subscription.aiUsed }} /
              {{ analysisLimitLabel(row.subscription, effectivePlan) }}
            </template>
            <span v-else class="text-muted-foreground">—</span>
          </p>
        </CardContent>
      </Card>
      <Card class="rounded-3xl">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">儲存用量</p>
          <p class="text-2xl font-black">
            <template v-if="row.subscription">
              {{ storageLabel(row.subscription.storageUsedMb) }}
            </template>
            <span v-else class="text-muted-foreground">—</span>
          </p>
        </CardContent>
      </Card>
      <Card class="rounded-3xl">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">押金對帳</p>
          <p
            class="text-2xl font-black"
            :class="row.mismatchedDepositCount > 0 ? 'text-destructive' : ''"
          >
            {{ row.deposits.length }} 筆
          </p>
          <p v-if="row.mismatchedDepositCount > 0" class="text-sm text-destructive">
            {{ row.mismatchedDepositCount }} 筆金額不符
          </p>
        </CardContent>
      </Card>
      <Card class="rounded-3xl">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">工單待處理</p>
          <p
            class="text-2xl font-black"
            :class="row.overdueTicketCount > 0 ? 'text-destructive' : ''"
          >
            {{ row.openTicketCount }} 件
          </p>
          <p v-if="row.overdueTicketCount > 0" class="text-sm text-destructive">
            {{ row.overdueTicketCount }} 件逾期
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- 權限與帳號 -->
    <Card class="rounded-3xl">
      <CardHeader><CardTitle>權限與帳號</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <p v-if="!isSuper" class="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
          調整角色與停用帳號僅限超級管理員，以下為唯讀。
        </p>

        <div class="flex flex-wrap items-center gap-6">
          <div class="space-y-1.5">
            <p class="text-sm text-muted-foreground">身分</p>
            <Select
              v-if="isSuper"
              :model-value="row.user.role"
              @update:model-value="handleRoleChange"
            >
              <SelectTrigger class="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">租客</SelectItem>
                <SelectItem value="landlord">房東</SelectItem>
                <SelectItem value="admin">管理員</SelectItem>
              </SelectContent>
            </Select>
            <p v-else class="font-medium">{{ adminRoleLabels[row.user.role] }}</p>
          </div>

          <div v-if="row.user.role === 'admin'" class="space-y-1.5">
            <p class="text-sm text-muted-foreground">權限角色</p>
            <Select
              v-if="isSuper"
              :model-value="row.user.adminRole ?? 'super'"
              @update:model-value="handleAdminRoleChange"
            >
              <SelectTrigger class="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="adminRole in ADMIN_ROLES" :key="adminRole" :value="adminRole">
                  {{ rbacRoleLabels[adminRole] }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-else class="font-medium">{{ rbacRoleLabels[row.user.adminRole ?? 'super'] }}</p>
          </div>

          <div v-if="isSuper" class="space-y-1.5">
            <p class="text-sm text-muted-foreground">帳號</p>
            <Button
              :variant="row.user.status === 'active' ? 'destructive' : 'default'"
              size="sm"
              @click="toggleStatus"
            >
              {{ row.user.status === 'active' ? '停用帳號' : '啟用帳號' }}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 訂閱與容量 -->
    <Card class="rounded-3xl">
      <CardHeader><CardTitle>訂閱與容量</CardTitle></CardHeader>
      <CardContent>
        <p v-if="!row.subscription" class="text-muted-foreground">此帳號尚未訂閱任何方案。</p>

        <div v-else-if="effectivePlan" class="space-y-4">
          <div class="flex flex-wrap items-center gap-6">
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
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ formatDate(row.subscription.expiresAt) }}</span>
                <Badge v-if="isExpiringSoon(row.subscription)" variant="destructive">
                  即將到期
                </Badge>
                <Badge v-else-if="!row.subscription.active" variant="secondary">已停用</Badge>
              </div>
            </div>
            <div v-if="inTrial" class="space-y-1.5">
              <p class="text-sm text-muted-foreground">限時試用</p>
              <div class="flex items-center gap-2">
                <Badge>還有 {{ trialDaysLeft }} 天</Badge>
                <span class="text-sm text-muted-foreground">
                  期間享 {{ effectivePlan.name }}權益，到期自動回到{{ planOf(row.subscription).name }}
                </span>
              </div>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">AI 分析</span>
                <span>
                  {{ row.subscription.aiUsed }} /
                  {{ analysisLimitLabel(row.subscription, effectivePlan) }} 次
                </span>
              </div>
              <Progress :model-value="analysisPercent(row.subscription, effectivePlan)" />
            </div>
            <div class="space-y-1.5">
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">儲存空間</span>
                <span>
                  {{ storageLabel(row.subscription.storageUsedMb) }} /
                  {{ storageLabel(effectivePlan.storageMb) }}
                </span>
              </div>
              <Progress
                :model-value="usagePercent(row.subscription.storageUsedMb, effectivePlan.storageMb)"
              />
            </div>
          </div>

          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/20 p-4"
          >
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

    <!-- 押金對帳 -->
    <Card class="rounded-3xl">
      <CardHeader>
        <CardTitle>押金對帳</CardTitle>
        <p class="text-sm text-muted-foreground">
          平台不經手押金，這裡只比對租約雙方各自聲明的金額。
        </p>
      </CardHeader>
      <CardContent class="space-y-6">
        <p v-if="row.deposits.length === 0" class="text-muted-foreground">沒有相關的押金記錄。</p>

        <div v-for="group in depositGroups" :key="group.side" class="space-y-2">
          <p class="font-semibold">以{{ caseSideLabels[group.side] }}身分</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>地址</TableHead>
                <TableHead class="whitespace-nowrap">月租</TableHead>
                <TableHead class="whitespace-nowrap">房東聲明已收</TableHead>
                <TableHead class="whitespace-nowrap">租客聲明已付</TableHead>
                <TableHead class="whitespace-nowrap">對帳結果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="deposit in group.items" :key="deposit.id">
                <TableCell>{{ deposit.address }}</TableCell>
                <TableCell class="whitespace-nowrap">{{ formatMoney(deposit.monthlyRent) }}</TableCell>
                <TableCell class="whitespace-nowrap">
                  {{ formatMoney(deposit.landlordDeclared) }}
                </TableCell>
                <TableCell class="whitespace-nowrap">
                  <span v-if="deposit.tenantDeclared === null" class="text-muted-foreground">
                    未聲明
                  </span>
                  <span v-else>{{ formatMoney(deposit.tenantDeclared) }}</span>
                </TableCell>
                <TableCell class="whitespace-nowrap">
                  <Badge :variant="matchVariant(deposit)">
                    {{ depositMatchLabels[deposit.match] }}
                  </Badge>
                  <span v-if="deposit.gap > 0" class="ml-2 text-sm text-destructive">
                    差 {{ formatMoney(deposit.gap) }}
                  </span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- 點交存證：與押金對帳同一種「兩造各自認定、比對是否一致」的模式 -->
    <Card v-if="handoverGroups.length > 0" class="rounded-3xl">
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>點交存證</CardTitle>
          <Badge v-if="handoverDisputedCount > 0" variant="destructive">
            {{ handoverDisputedCount }} 份有爭議
          </Badge>
        </div>
        <p class="text-sm text-muted-foreground">
          比對房東與租客對每個品項的認定。存證照片留在使用者端，後台不顯示。
        </p>
      </CardHeader>

      <CardContent class="space-y-6">
        <FeatureOutageBanner feature-key="handover" />

        <div v-for="group in handoverGroups" :key="group.side" class="space-y-3">
          <p class="font-semibold">以{{ caseSideLabels[group.side] }}身分</p>

          <div
            v-for="record in group.items"
            :key="record.id"
            class="space-y-2 rounded-xl border p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-medium">{{ record.address }}</p>
                <p class="text-xs text-muted-foreground">
                  點交於 {{ formatDate(record.inspectedAt) }}・共
                  {{ summarizeHandover(record.items).total }} 項
                </p>
              </div>
              <Badge :variant="agreementVariant(overallAgreement(record.items))">
                {{ handoverAgreementLabels[overallAgreement(record.items)] }}
              </Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="whitespace-nowrap">位置</TableHead>
                  <TableHead>品項</TableHead>
                  <TableHead class="whitespace-nowrap">房東認定</TableHead>
                  <TableHead class="whitespace-nowrap">租客認定</TableHead>
                  <TableHead class="whitespace-nowrap">比對</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="item in record.items" :key="item.id">
                  <TableCell class="whitespace-nowrap text-muted-foreground">
                    {{ item.room }}
                  </TableCell>
                  <TableCell>{{ item.name }}</TableCell>
                  <TableCell class="whitespace-nowrap">
                    {{ handoverVerdictLabels[item.landlordVerdict] }}
                  </TableCell>
                  <TableCell class="whitespace-nowrap">
                    <span v-if="item.tenantVerdict === null" class="text-muted-foreground">
                      未確認
                    </span>
                    <span v-else>{{ handoverVerdictLabels[item.tenantVerdict] }}</span>
                  </TableCell>
                  <TableCell class="whitespace-nowrap">
                    <Badge
                      :variant="
                        agreementVariant(handoverAgreementOf(item.landlordVerdict, item.tenantVerdict))
                      "
                    >
                      {{
                        handoverAgreementLabels[
                          handoverAgreementOf(item.landlordVerdict, item.tenantVerdict)
                        ]
                      }}
                    </Badge>
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
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>報修工單</CardTitle>
          <Button variant="outline" size="sm" @click="goToTickets">
            在工單頁查看全部
            <ExternalLink class="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <p v-if="row.tickets.length === 0" class="text-muted-foreground">沒有相關的報修工單。</p>

        <div v-for="group in ticketGroups" :key="group.side" class="space-y-2">
          <p class="font-semibold">以{{ caseSideLabels[group.side] }}身分</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="whitespace-nowrap">編號</TableHead>
                <TableHead>地址</TableHead>
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
                <TableCell class="font-medium">{{ ticket.id }}</TableCell>
                <TableCell>{{ ticket.address }}</TableCell>
                <TableCell class="whitespace-nowrap">
                  {{ maintenanceCategoryLabels[ticket.category] }}
                </TableCell>
                <TableCell>
                  <Badge :variant="statusBadgeVariant(ticket.status)">
                    {{ maintenanceStatusLabels[ticket.status] }}
                  </Badge>
                </TableCell>
                <TableCell class="whitespace-nowrap">{{ formatDate(ticket.createdAt) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

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
            平台尚未接金流，這裡只記權益不記付款；實際收款流程接上後再補金額欄位。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="creditOpen = false">取消</Button>
          <Button :disabled="!(creditAmount > 0)" @click="confirmCredit">確認加購</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <SendNotificationDialog v-model:open="sendDialogOpen" :preset-emails="presetEmails" @sent="onSent" />
  </div>

  <div v-else class="space-y-4 py-16 text-center">
    <p class="text-muted-foreground">找不到這個使用者。</p>
    <Button variant="outline" @click="router.push('/admin/users')">返回使用者列表</Button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import { Checkbox } from '@/components/ui/checkbox/index'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  MailWarning,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-vue-next'
import AdminRoleCountCard from '@/src/components/admin/AdminRoleCountCard.vue'
import CategoryBarCard from '@/src/components/admin/CategoryBarCard.vue'
import InlineStat from '@/src/components/admin/InlineStat.vue'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import AdminRowActions from '@/src/components/admin/AdminRowActions.vue'
import PlanDistributionCard from '@/src/components/admin/PlanDistributionCard.vue'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import { adminRoleLabels } from '@/src/composables/admin/useAdminUsers'
import { userAlertLabels, userDirectoryRoles, type UserAlert } from '@/src/utils/admin-user-directory'
import { userPlan } from '@/src/utils/admin-plans'
import { subscriptionPlans } from '@/src/utils/subscription-plans'
import { realAccountStats, registrationSources } from '@/src/utils/admin-real-accounts'
import type {
  PlanDistributionSegment,
  UserDirectoryRow,
} from '@/src/utils/admin-user-directory'
import { chartColor, chartSeries } from '@/src/constants/admin-chart'
import { useNow } from '@/src/composables/useNow'
import { formatDateTime } from '@/src/utils/admin-format'
import {
  NO_LOGIN_RECORD_HINT,
  isBulkSelectable,
  lastLoginText,
  paginate,
  planBulkStatus,
  runBulkStatus,
  sortUserRows,
  summarizeBulk,
  type SortDir,
  type UserSortKey,
} from '@/src/utils/admin-user-list'

const route = useRoute()
const router = useRouter()

const {
  rows,
  filteredRows,
  filter,
  filterActive,
  clearFilter,
  planSegments,
  planRole,
  adminTotal,
  realAccounts,
  depositsState,
  ticketsState,
  realAccountsLoading,
  realAccountsError,
  reloadRealAccounts,
  setRealAccountStatus,
} = useAdminDirectory()

const planColors = computed(() => [
  chartColor('series-3'),
  chartColor('series-2'),
  chartColor('series-1'),
])

const listCard = ref<HTMLElement | null>(null)
function handlePlanSelect(planKey: PlanDistributionSegment['planKey']): void {
  const plan = `${planRole.value}-${planKey}` as const
  filter.value.role = planRole.value === 'landlord' ? 'landlord' : 'user'
  filter.value.plan = filter.value.plan === plan ? 'all' : plan
  listCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(
  () => route.query.alert,
  (value) => {
    if (typeof value === 'string' && value in userAlertLabels) {
      filter.value.alert = value as UserAlert
    }
  },
  { immediate: true },
)

// 訂閱總覽帶角色與方案進來；只接受列表已有的篩選值，避免無效 query 清空結果。
watch(
  () => route.query.role,
  (value) => {
    if (value === 'landlord' || value === 'user' || value === 'admin' || value === 'all') {
      filter.value.role = value
      if (value === 'landlord' || value === 'user') {
        planRole.value = value === 'landlord' ? 'landlord' : 'tenant'
      }
    }
  },
  { immediate: true },
)
watch(
  () => route.query.plan,
  (value) => {
    if (value === 'all') filter.value.plan = value
    for (const role of ['landlord', 'tenant'] as const) {
      for (const plan of subscriptionPlans[role]) {
        const key = `${role}-${plan.key}` as const
        if (value === key) filter.value.plan = key
      }
    }
  },
  { immediate: true },
)

const alertOptions = Object.keys(userAlertLabels) as UserAlert[]

/* 統計只計 realAccounts，不可混入表格中的展示資料。 */
const accountStats = computed(() => realAccountStats(realAccounts.value))
const sourceSegments = computed(() =>
  registrationSources(realAccounts.value).map((s) => ({ label: s.label, value: s.count })),
)

// 只有真實帳號能停用，展示資料沒有可停用的對象。

const statusBusyId = ref<number | null>(null)
const statusError = ref('')

async function toggleStatus(row: UserDirectoryRow): Promise<void> {
  if (row.realAccountId === undefined) return
  if (row.user.status === 'active') {
    openSingleSuspend(row)
    return
  }
  statusError.value = ''
  statusBusyId.value = row.realAccountId
  try {
    await setRealAccountStatus(row, 'active')
  } catch (error) {
    // 後端的拒絕理由要讓操作者看到（不能停用自己、這是最後一位管理員）
    statusError.value = error instanceof Error ? error.message : '操作失敗，請稍後再試。'
  } finally {
    statusBusyId.value = null
  }
}

function depositLabel(row: UserDirectoryRow): string {
  if (row.realAccountId !== undefined && depositsState.value !== 'ready') {
    return depositsState.value === 'error' ? '讀不到押金資料' : '讀取中'
  }
  if (row.deposits.length === 0) return '—'
  if (row.mismatchedDepositCount > 0) return `${row.mismatchedDepositCount} 筆不符`
  const pending = row.deposits.filter((item) => item.match === 'pending').length
  if (pending > 0) return `${pending} 筆待補`
  return `${row.deposits.length} 筆相符`
}

function openDetail(row: UserDirectoryRow): void {
  void router.push(`/admin/users/${row.user.id}`)
}

function handleFilterChange<K extends keyof typeof filter.value>(
  key: K,
  value: unknown,
): void {
  filter.value[key] = value as (typeof filter.value)[K]
}

function openSend(row: UserDirectoryRow): void {
  void router.push({
    path: '/admin/notifications/compose',
    query: { to: row.user.email },
  })
}

const now = useNow()

const sortKey = ref<UserSortKey | null>(null)
const sortDir = ref<SortDir>('asc')
const FIRST_DIR: Record<UserSortKey, SortDir> = {
  user: 'asc',
  role: 'asc',
  lastLogin: 'desc',
  status: 'asc',
}

function toggleSort(key: UserSortKey): void {
  if (sortKey.value !== key) {
    sortKey.value = key
    sortDir.value = FIRST_DIR[key]
    return
  }
  if (sortDir.value === FIRST_DIR[key]) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = null
}

function sortIcon(key: UserSortKey) {
  if (sortKey.value !== key) return ArrowUpDown
  return sortDir.value === 'asc' ? ArrowUp : ArrowDown
}

function ariaSort(key: UserSortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

const sortedRows = computed(() =>
  sortKey.value ? sortUserRows(filteredRows.value, sortKey.value, sortDir.value) : filteredRows.value,
)

const page = ref(1)
const pageData = computed(() => paginate(sortedRows.value, page.value))
watch([filter, sortKey, sortDir], () => (page.value = 1), { deep: true })

function goToPage(target: number): void {
  page.value = target
}

// 僅真實且非管理員的帳號可勾選，換頁或篩選仍保留選取，確認框須列出完整名單。

const selectedIds = ref<Set<string>>(new Set())

const selectedRows = computed(() =>
  rows.value.filter((row) => selectedIds.value.has(row.user.id) && isBulkSelectable(row)),
)

const pageSelectable = computed(() => pageData.value.items.filter(isBulkSelectable))

const pageSelectState = computed<boolean | 'indeterminate'>(() => {
  const picked = pageSelectable.value.filter((row) => selectedIds.value.has(row.user.id)).length
  if (picked === 0) return false
  return picked === pageSelectable.value.length ? true : 'indeterminate'
})

function setRowSelected(row: UserDirectoryRow, on: boolean): void {
  const next = new Set(selectedIds.value)
  if (on) next.add(row.user.id)
  else next.delete(row.user.id)
  selectedIds.value = next
}

function setPageSelected(on: boolean): void {
  const next = new Set(selectedIds.value)
  for (const row of pageSelectable.value) {
    if (on) next.add(row.user.id)
    else next.delete(row.user.id)
  }
  selectedIds.value = next
}

function clearSelection(): void {
  selectedIds.value = new Set()
}

const bulkPlan = computed(() => planBulkStatus(selectedRows.value))

function bulkSend(): void {
  void router.push({
    path: '/admin/notifications/compose',
    query: { to: selectedRows.value.map((row) => row.user.email).join(',') },
  })
}

// 確認框開啟時須凍結名單，避免執行停用後 computed 名單逐筆縮短。

type BulkAction = 'suspend' | 'activate'

const bulkAction = ref<BulkAction | null>(null)
const bulkTargets = ref<UserDirectoryRow[]>([])
const bulkRunning = ref(false)
/** 停用原因，選填，只寫進稽核紀錄。批次停用時所有人共用這一句 */
const suspendReason = ref('')
/**
 * 確認框是從批次列打開的，還是從單筆的「停用」按鈕。
 * 單筆停用完不該順手清掉使用者另外勾好的批次選取。
 */
const bulkFromSelection = ref(true)
const bulkResult = ref<{
  action: BulkAction
  succeeded: number
  failed: { name: string; reason: string }[]
} | null>(null)

function openBulk(action: BulkAction): void {
  bulkResult.value = null
  bulkTargets.value = [...(action === 'suspend' ? bulkPlan.value.suspend : bulkPlan.value.activate)]
  bulkFromSelection.value = true
  suspendReason.value = ''
  bulkAction.value = action
}

function openSingleSuspend(row: UserDirectoryRow): void {
  bulkResult.value = null
  bulkTargets.value = [row]
  bulkFromSelection.value = false
  suspendReason.value = ''
  bulkAction.value = 'suspend'
}

function closeBulk(): void {
  if (bulkRunning.value) return
  bulkAction.value = null
}

async function confirmBulk(): Promise<void> {
  const action = bulkAction.value
  if (!action) return
  bulkRunning.value = true
  const reason = action === 'suspend' ? suspendReason.value : undefined
  const outcomes = await runBulkStatus(bulkTargets.value, (row) =>
    setRealAccountStatus(row, action === 'suspend' ? 'suspended' : 'active', reason),
  )
  bulkResult.value = { action, ...summarizeBulk(outcomes) }
  bulkRunning.value = false
  bulkAction.value = null
  if (bulkFromSelection.value) clearSelection()
}

function displayName(row: UserDirectoryRow): string {
  return row.user.nickname?.trim() || row.user.email
}
</script>

<template>
  <div class="space-y-6">

    <div
      v-if="realAccountsError"
      class="rounded-xl border border-accent/60 bg-accent/20 px-4 py-3 text-sm"
    >
      <p class="font-medium">{{ realAccountsError }}</p>
      <Button variant="outline" size="sm" class="mt-2" @click="reloadRealAccounts">
        <RefreshCw class="mr-1 h-3.5 w-3.5" />
        重新讀取
      </Button>
    </div>

    <p
      v-if="statusError"
      class="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
    >
      {{ statusError }}
    </p>

    <!-- KPI 只計真實帳號，不含展示資料；沒有歷史快照，不能提供 trend。 -->
    <div data-real="true" class="grid grid-cols-2 gap-x-2 gap-y-1 lg:grid-cols-4">
      <InlineStat :icon="Users" label="註冊帳號" :value="accountStats.total" hero />
      <InlineStat :icon="UserPlus" label="本週新增" :value="accountStats.newThisWeek" />
      <InlineStat :icon="UserX" label="停用中" :value="accountStats.suspended" />
      <InlineStat :icon="MailWarning" label="未驗證信箱" :value="accountStats.unverified" />
    </div>

    <div ref="listCard" class="scroll-mt-4">
      <Card class="rounded-3xl">
        <CardContent class="space-y-4 px-5 pb-5 pt-6">
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative min-w-56 flex-1">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="filter.keyword" placeholder="搜尋 Email 或暱稱" class="pl-9" />
            </div>

            <Select
              :model-value="filter.role"
              @update:model-value="(value) => handleFilterChange('role', value)"
            >
              <SelectTrigger class="w-32"><SelectValue placeholder="身分" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部身分</SelectItem>
                <SelectItem value="user">租客</SelectItem>
                <SelectItem value="landlord">房東</SelectItem>
                <SelectItem value="admin">管理員</SelectItem>
              </SelectContent>
            </Select>

            <Select
              :model-value="filter.status"
              @update:model-value="(value) => handleFilterChange('status', value)"
            >
              <SelectTrigger class="w-32"><SelectValue placeholder="狀態" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="active">正常</SelectItem>
                <SelectItem value="suspended">停用</SelectItem>
              </SelectContent>
            </Select>

            <Select
              :model-value="filter.plan"
              @update:model-value="(value) => handleFilterChange('plan', value)"
            >
              <SelectTrigger class="w-32"><SelectValue placeholder="方案" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部方案</SelectItem>
                <SelectGroup v-for="role in (['landlord', 'tenant'] as const)" :key="role">
                  <SelectLabel>{{ role === 'landlord' ? '房東' : '租客' }}</SelectLabel>
                  <SelectItem v-for="plan in subscriptionPlans[role]" :key="plan.key" :value="`${role}-${plan.key}`">
                    {{ plan.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              :model-value="filter.alert"
              @update:model-value="(value) => handleFilterChange('alert', value)"
            >
              <SelectTrigger class="w-40"><SelectValue placeholder="案件警示" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部警示</SelectItem>
                <SelectItem v-for="alert in alertOptions" :key="alert" :value="alert">
                  {{ userAlertLabels[alert] }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Button v-if="filterActive" variant="outline" size="sm" @click="clearFilter">
              <X class="mr-1 h-3.5 w-3.5" />
              清除篩選
            </Button>

            <p class="whitespace-nowrap text-sm text-muted-foreground">
              共 {{ filteredRows.length }} 人
              <span v-if="realAccountsLoading">（帳號讀取中…）</span>
            </p>

            <p class="ml-auto whitespace-nowrap text-xs text-muted-foreground">
              點選任一列進入詳情
            </p>
          </div>

          <div
            v-if="selectedRows.length > 0"
            class="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm"
          >
            <span class="font-medium">已選 {{ selectedRows.length }} 位</span>
            <span class="text-xs text-muted-foreground">管理員帳號不能批次操作</span>
            <div class="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" @click="bulkSend">
                <Send class="mr-1.5 h-3.5 w-3.5" />
                發送通知
              </Button>
              <Button
                size="sm"
                variant="destructive"
                :disabled="bulkPlan.suspend.length === 0"
                @click="openBulk('suspend')"
              >
                停用（{{ bulkPlan.suspend.length }}）
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="bulkPlan.activate.length === 0"
                @click="openBulk('activate')"
              >
                啟用（{{ bulkPlan.activate.length }}）
              </Button>
              <Button size="sm" variant="ghost" @click="clearSelection">取消選取</Button>
            </div>
          </div>

          <div
            v-if="bulkResult"
            class="rounded-xl border px-4 py-3 text-sm"
            :class="bulkResult.failed.length > 0 ? 'border-destructive/50 bg-destructive/10' : 'border-success/40 bg-success/10'"
          >
            <div class="flex items-start gap-3">
              <div class="flex-1">
                <p class="font-medium">
                  已{{ bulkResult.action === 'suspend' ? '停用' : '啟用' }} {{ bulkResult.succeeded }} 位。
                  <template v-if="bulkResult.failed.length > 0">
                    {{ bulkResult.failed.length }} 位沒有成功：
                  </template>
                </p>
                <ul v-if="bulkResult.failed.length > 0" class="mt-1 list-disc space-y-0.5 pl-5">
                  <li v-for="item in bulkResult.failed" :key="item.name">
                    {{ item.name }} —— {{ item.reason }}
                  </li>
                </ul>
              </div>
              <Button size="sm" variant="ghost" @click="bulkResult = null">關閉</Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-10">
                  <Checkbox
                    :model-value="pageSelectState"
                    :disabled="pageSelectable.length === 0"
                    aria-label="選取本頁可以批次操作的帳號"
                    @update:model-value="(value) => setPageSelected(value === true)"
                  />
                </TableHead>
                <TableHead :aria-sort="ariaSort('user')">
                  <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('user')">
                    使用者
                    <component :is="sortIcon('user')" class="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead class="whitespace-nowrap" :aria-sort="ariaSort('role')">
                  <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('role')">
                    身分
                    <component :is="sortIcon('role')" class="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead class="whitespace-nowrap" :aria-sort="ariaSort('lastLogin')">
                  <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('lastLogin')">
                    最後登入
                    <component :is="sortIcon('lastLogin')" class="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead class="whitespace-nowrap">訂閱方案</TableHead>
                <TableHead class="whitespace-nowrap">押金對帳</TableHead>
                <TableHead class="whitespace-nowrap">工單待處理</TableHead>
                <TableHead class="whitespace-nowrap" :aria-sort="ariaSort('status')">
                  <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('status')">
                    狀態
                    <component :is="sortIcon('status')" class="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead class="text-right">操作</TableHead>
                <TableHead class="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="row in pageData.items"
                :key="row.user.id"
                class="cursor-pointer"
                :class="selectedIds.has(row.user.id) ? 'bg-primary/5' : ''"
                @click="openDetail(row)"
              >
                <!-- 勾選格要擋掉點擊冒泡，不然勾一下就被帶進詳情頁 -->
                <TableCell class="w-10" @click.stop>
                  <Checkbox
                    v-if="isBulkSelectable(row)"
                    :model-value="selectedIds.has(row.user.id)"
                    :aria-label="`選取 ${row.user.email}`"
                    @update:model-value="(value) => setRowSelected(row, value === true)"
                  />
                </TableCell>

                <TableCell>
                  <div class="flex items-center gap-1.5">
                    <span class="font-medium">{{ row.user.email }}</span>
                    <!-- --accent 直接作為圖示色在白底上對比不足，須搭配實心琥珀背景使用。 -->
                    <span :title="row.user.emailVerified ? 'Email 已驗證' : 'Email 未驗證'">
                      <BadgeCheck
                        v-if="row.user.emailVerified"
                        class="h-4 w-4 shrink-0 text-success"
                      />
                      <span v-else class="inline-flex rounded-full bg-accent p-0.5">
                        <ShieldAlert class="h-3 w-3 shrink-0 text-accent-foreground" />
                      </span>
                      <span class="sr-only">
                        {{ row.user.emailVerified ? 'Email 已驗證' : 'Email 未驗證' }}
                      </span>
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <p class="text-sm text-muted-foreground">{{ row.user.nickname ?? '—' }}</p>
                  </div>
                </TableCell>

                <TableCell class="whitespace-nowrap">
                  <div class="flex flex-wrap gap-2">
                    <span v-for="role in userDirectoryRoles(row)" :key="role">{{ adminRoleLabels[role] }}</span>
                  </div>
                </TableCell>

                <TableCell
                  class="whitespace-nowrap text-sm"
                  :title="row.user.lastLoginAt ? formatDateTime(row.user.lastLoginAt) : NO_LOGIN_RECORD_HINT"
                >
                  <span :class="row.user.lastLoginAt ? '' : 'text-muted-foreground'">
                    {{ lastLoginText(row.user.lastLoginAt, now) }}
                  </span>
                </TableCell>

                <TableCell class="whitespace-nowrap">
                  <span :class="row.user.role === 'admin' ? 'text-muted-foreground' : ''">{{ userPlan(row.user, row.subscription, now)?.name ?? '—' }}</span>
                  <div v-if="row.overLimit" class="mt-1">
                    <StatusDot tone="warn" :label="userAlertLabels['over-limit']" emphasize />
                  </div>
                </TableCell>

                <TableCell
                  class="whitespace-nowrap"
                  :class="row.mismatchedDepositCount > 0 ? 'font-semibold text-destructive' : ''"
                >
                  {{ depositLabel(row) }}
                </TableCell>

                <TableCell
                  class="whitespace-nowrap"
                  :class="row.overdueTicketCount > 0 ? 'font-semibold text-destructive' : ''"
                >
                  <span v-if="row.realAccountId !== undefined && ticketsState !== 'ready'" class="text-muted-foreground">
                    {{ ticketsState === 'error' ? '讀不到工單資料' : '讀取中' }}
                  </span>
                  <span v-else-if="row.openTicketCount === 0" class="text-muted-foreground">—</span>
                  <span v-else>
                    {{ row.openTicketCount }} 件
                    <template v-if="row.overdueTicketCount > 0">
                      （逾期 {{ row.overdueTicketCount }}）
                    </template>
                  </span>
                </TableCell>

                <TableCell>
                  <StatusDot
                    :tone="row.user.status === 'active' ? 'ok' : 'danger'"
                    :label="row.user.status === 'active' ? '正常' : '停用'"
                  />
                </TableCell>

                <TableCell class="text-right" @click.stop>
                  <AdminRowActions :actions="[]">
                    <!--
                      跟「停用」同一條守衛：只有真實帳號才給操作。

                      對展示資料發通知會產生一筆「已送達給某個不存在的人」
                      的紀錄，而那筆紀錄看起來跟真的一模一樣。
                    -->
                    <Button
                      v-if="row.realAccountId !== undefined"
                      variant="outline"
                      size="sm"
                      @click="openSend(row)"
                    >
                      發送通知
                    </Button>
                    <Button
                      v-if="row.realAccountId !== undefined"
                      :variant="row.user.status === 'active' ? 'destructive' : 'outline'"
                      size="sm"
                      :disabled="statusBusyId === row.realAccountId"
                      @click="toggleStatus(row)"
                    >
                      {{ row.user.status === 'active' ? '停用' : '啟用' }}
                    </Button>
                  </AdminRowActions>
                </TableCell>

                <!-- 此格須讓 click 冒泡到整列，才能點箭頭開啟詳情。 -->
                <TableCell class="w-10 text-right text-muted-foreground">
                  <ArrowUpRight :size="16" class="inline" aria-hidden="true" />
                </TableCell>
              </TableRow>

              <TableRow v-if="pageData.total === 0">
                <TableCell colspan="10" class="py-10 text-center text-muted-foreground">
                  <p>沒有符合條件的使用者。</p>
                  <Button v-if="filterActive" variant="outline" size="sm" class="mt-3" @click="clearFilter">
                    清除篩選
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div
            v-if="pageData.total > 0"
            class="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <p class="text-muted-foreground">
              第 {{ pageData.from }}–{{ pageData.to }} 筆，共 {{ pageData.total }} 筆
            </p>
            <div v-if="pageData.pageCount > 1" class="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                :disabled="pageData.page <= 1"
                @click="goToPage(pageData.page - 1)"
              >
                <ChevronLeft class="mr-1 h-4 w-4" />
                上一頁
              </Button>
              <span class="px-2 tabular-nums">{{ pageData.page }} / {{ pageData.pageCount }}</span>
              <Button
                variant="outline"
                size="sm"
                :disabled="pageData.page >= pageData.pageCount"
                @click="goToPage(pageData.page + 1)"
              >
                下一頁
                <ChevronRight class="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <CategoryBarCard
      v-if="sourceSegments.length"
      data-real="true"
      title="註冊來源"
      description="帳號的登入方式分布。「兩者皆有」是先用密碼註冊後再綁定 Google。"
      :items="sourceSegments"
    />

    <div class="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
      <PlanDistributionCard
        v-model="planRole"
        :segments="planSegments"
        :colors="planColors"
        :active-plan="filter.plan"
        @select="handlePlanSelect"
      />
      <AdminRoleCountCard :count="adminTotal" />
    </div>

    <Dialog :open="bulkAction !== null" @update:open="(open: boolean) => { if (!open) closeBulk() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {{ bulkAction === 'suspend' ? '停用' : '啟用' }} {{ bulkTargets.length }} 個帳號？
          </DialogTitle>
          <DialogDescription>
            <template v-if="bulkAction === 'suspend'">
              停用會立刻生效：這些人馬上就登不進來，直到你再把他們啟用。
            </template>
            <template v-else>啟用之後，這些人就可以重新登入。</template>
          </DialogDescription>
        </DialogHeader>
        <ul class="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border p-3 text-sm">
          <li
            v-for="row in bulkTargets"
            :key="row.user.id"
            class="flex items-baseline justify-between gap-3"
          >
            <span class="font-medium">{{ displayName(row) }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ row.user.email }}</span>
          </li>
        </ul>
        <div v-if="bulkAction === 'suspend'" class="space-y-2">
          <Label for="suspend-reason">停用原因（選填）</Label>
          <Textarea
            id="suspend-reason"
            v-model="suspendReason"
            rows="2"
            maxlength="200"
            placeholder="例如：多次發布不當內容"
          />
          <p class="text-xs text-muted-foreground">
            只寫進稽核紀錄，對方看不到。{{ bulkTargets.length > 1 ? '這幾個帳號共用這一句。' : '' }}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="bulkRunning" @click="closeBulk">取消</Button>
          <Button
            :variant="bulkAction === 'suspend' ? 'destructive' : 'default'"
            :disabled="bulkRunning"
            @click="confirmBulk"
          >
            {{ bulkRunning ? '處理中…' : bulkAction === 'suspend' ? '確認停用' : '確認啟用' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

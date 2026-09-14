<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
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
import { BadgeCheck, RefreshCw, Search, ShieldAlert, X } from 'lucide-vue-next'
import AdminRoleCountCard from '@/src/components/admin/AdminRoleCountCard.vue'
import AdminRowActions from '@/src/components/admin/AdminRowActions.vue'
import PlanDistributionCard from '@/src/components/admin/PlanDistributionCard.vue'
import SendNotificationDialog from '@/src/components/admin/notifications/SendNotificationDialog.vue'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import { adminRoleLabels } from '@/src/composables/admin/useAdminUsers'
import { userAlertLabels, type UserAlert } from '@/src/utils/admin-user-directory'
import type {
  PlanDistributionSegment,
  UserDirectoryRow,
} from '@/src/utils/admin-user-directory'
import type { AdminRole } from '@/src/utils/admin-rbac'
import { chartColor, chartSeries } from '@/src/constants/admin-chart'

const route = useRoute()
const router = useRouter()

const {
  rows,
  filteredRows,
  filter,
  filterActive,
  clearFilter,
  planSegments,
  adminCounts,
  realAccountsLoading,
  realAccountsError,
  reloadRealAccounts,
  setRealAccountStatus,
} = useAdminDirectory()

// 對應 planDistribution 的順序：免費、進階、專業、尚未訂閱。
// 用明度表達層級 —— 方案越高階顏色越深，未訂閱最淡。
const planColors = computed(() => [
  chartColor('series-3'),
  chartColor('series-2'),
  chartColor('series-1'),
  chartColor('series-5'),
])
const adminRoleColors = computed<Record<AdminRole, string>>(() => ({
  super: chartColor('series-1'),
  admin: chartColor('series-3'),
}))

// 再點一次同一個方案就取消篩選，不用特地跑去按「清除篩選」
function handlePlanSelect(planId: PlanDistributionSegment['planId']): void {
  filter.value.plan = filter.value.plan === planId ? 'all' : planId
}

// 總覽頁的 KPI 卡帶著 ?alert= 跳過來，預選對應的警示條件
watch(
  () => route.query.alert,
  (value) => {
    if (typeof value === 'string' && value in userAlertLabels) {
      filter.value.alert = value as UserAlert
    }
  },
  { immediate: true },
)

const alertOptions = Object.keys(userAlertLabels) as UserAlert[]

/**
 * 身分欄的文字。
 *
 * 「超級管理員」與一般管理員分開顯示：前者只能由能登入伺服器的人用
 * manage_admin.py 授予，權限與影響範圍完全不同，混用同一個標籤
 * 會讓人以為後台可以自己加。
 */
function roleLabel(row: UserDirectoryRow): string {
  if (row.user.role === 'admin' && row.user.adminRole === 'super') return '超級管理員'
  return adminRoleLabels[row.user.role]
}

// ── 停用／啟用真實帳號 ──────────────────────────────────────────
//
// 只有真實帳號有這個操作。展示資料沒有可以停用的對象 ——
// 給它一顆按不動的按鈕，只會讓人以為是壞掉了。

const statusBusyId = ref<number | null>(null)
const statusError = ref('')

async function toggleStatus(row: UserDirectoryRow): Promise<void> {
  if (row.realAccountId === undefined) return
  statusError.value = ''
  statusBusyId.value = row.realAccountId
  try {
    await setRealAccountStatus(row, row.user.status === 'active' ? 'suspended' : 'active')
  } catch (error) {
    // 後端的拒絕理由要讓操作者看到（不能停用自己、這是最後一位管理員）
    statusError.value = error instanceof Error ? error.message : '操作失敗，請稍後再試。'
  } finally {
    statusBusyId.value = null
  }
}

function depositLabel(row: UserDirectoryRow): string {
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

// ── 發送通知 ────────────────────────────────────────────────────

const sendTarget = ref<UserDirectoryRow | null>(null)
const sendDialogOpen = ref(false)
const sentMessage = ref('')
const presetEmails = computed(() => (sendTarget.value ? [sendTarget.value.user.email] : []))

function openSend(row: UserDirectoryRow): void {
  sendTarget.value = row
  sentMessage.value = ''
  sendDialogOpen.value = true
}

// 發完留在原頁顯示提示，不導頁——管理員多半是要接著看下一列，導走反而打斷篩選狀態。
function onSent(payload: { count: number; recipientNames: string[] }): void {
  const name = payload.recipientNames[0] ?? sendTarget.value?.user.nickname ?? sendTarget.value?.user.email
  sentMessage.value = name ? `已發送給 ${name}。` : `已成功發送給 ${payload.count} 位使用者。`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">使用者管理</h1>
      <p class="mt-1 text-muted-foreground">
        以使用者為中心檢視訂閱容量、押金對帳與報修工單，點選任一列進入詳情。
      </p>
      <p v-if="sentMessage" class="mt-2 text-sm font-medium text-emerald-600">{{ sentMessage }}</p>
    </div>

    <!--
      真實帳號與展示資料併在同一張表，真實的排在前面並帶「真實帳號」標記。
      標記不是裝飾：只有帶標記的列才有「停用」，而那個停用會讓對方
      立刻登不進來。看不出差別的話，管理員會分不清自己按的是哪一種。
    -->
    <div
      v-if="realAccountsError"
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <p class="font-medium text-amber-700 dark:text-amber-400">{{ realAccountsError }}</p>
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

    <!--
      甜甜圈要留白給外側標籤所以吃比較多寬度；管理員人數只有兩個數字，
      給它等寬只會空一大片。items-start 讓它照內容收高，不被甜甜圈撐平。
    -->
    <div class="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
      <PlanDistributionCard
        :segments="planSegments"
        :colors="planColors"
        :total="rows.length"
        :active-plan="filter.plan"
        @select="handlePlanSelect"
      />
      <AdminRoleCountCard :counts="adminCounts" :colors="adminRoleColors" />
    </div>

    <Card class="rounded-3xl">
      <CardContent class="space-y-4 pt-6">
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
              <SelectItem value="free">免費方案</SelectItem>
              <SelectItem value="plus">進階方案</SelectItem>
              <SelectItem value="pro">專業方案</SelectItem>
              <SelectItem value="none">尚未訂閱</SelectItem>
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
            <span v-if="realAccountsLoading">（真實帳號讀取中…）</span>
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>使用者</TableHead>
              <TableHead class="whitespace-nowrap">身分</TableHead>
              <TableHead class="whitespace-nowrap">訂閱方案</TableHead>
              <TableHead class="whitespace-nowrap">押金對帳</TableHead>
              <TableHead class="whitespace-nowrap">工單待處理</TableHead>
              <TableHead class="whitespace-nowrap">狀態</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="row in filteredRows"
              :key="row.user.id"
              class="cursor-pointer"
              @click="openDetail(row)"
            >
              <TableCell>
                <div class="flex items-center gap-1.5">
                  <span class="font-medium">{{ row.user.email }}</span>
                  <!-- 驗證狀態改用圖示：獨立成欄時中文標題會在 1280px 被壓成直排 -->
                  <span :title="row.user.emailVerified ? 'Email 已驗證' : 'Email 未驗證'">
                    <BadgeCheck
                      v-if="row.user.emailVerified"
                      class="h-4 w-4 shrink-0 text-emerald-600"
                    />
                    <ShieldAlert v-else class="h-4 w-4 shrink-0 text-amber-600" />
                    <span class="sr-only">
                      {{ row.user.emailVerified ? 'Email 已驗證' : 'Email 未驗證' }}
                    </span>
                  </span>
                </div>
                <div class="flex items-center gap-1.5">
                  <p class="text-sm text-muted-foreground">{{ row.user.nickname ?? '—' }}</p>
                  <!-- 只有真實帳號帶標記：帶標記的列，停用會讓對方真的登不進來 -->
                  <Badge v-if="row.realAccountId !== undefined" variant="outline" class="text-[10px]">
                    真實帳號
                  </Badge>
                </div>
              </TableCell>

              <TableCell class="whitespace-nowrap">{{ roleLabel(row) }}</TableCell>

              <TableCell class="whitespace-nowrap">
                <span v-if="row.plan">{{ row.plan.name }}</span>
                <span v-else class="text-muted-foreground">尚未訂閱</span>
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
                <span v-if="row.openTicketCount === 0" class="text-muted-foreground">—</span>
                <span v-else>
                  {{ row.openTicketCount }} 件
                  <template v-if="row.overdueTicketCount > 0">
                    （逾期 {{ row.overdueTicketCount }}）
                  </template>
                </span>
              </TableCell>

              <TableCell>
                <Badge
                  class="whitespace-nowrap"
                  :variant="row.user.status === 'active' ? 'default' : 'destructive'"
                >
                  {{ row.user.status === 'active' ? '正常' : '停用' }}
                </Badge>
              </TableCell>

              <TableCell class="text-right" @click.stop>
                <AdminRowActions :actions="[]">
                  <Button variant="outline" size="sm" @click="openSend(row)">發送通知</Button>
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
            </TableRow>

            <TableRow v-if="filteredRows.length === 0">
              <TableCell colspan="7" class="py-10 text-center text-muted-foreground">
                <p>沒有符合條件的使用者。</p>
                <Button v-if="filterActive" variant="outline" size="sm" class="mt-3" @click="clearFilter">
                  清除篩選
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <SendNotificationDialog v-model:open="sendDialogOpen" :preset-emails="presetEmails" @sent="onSent" />
  </div>
</template>

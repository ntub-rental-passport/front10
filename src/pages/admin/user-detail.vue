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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
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
import { ArrowLeft, BadgeCheck, ExternalLink, ShieldAlert } from 'lucide-vue-next'
import TicketDetailPanel from '@/src/components/admin/TicketDetailPanel.vue'
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
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { formatDate } from '@/src/utils/admin-format'
import type { AdminUserRole, PlanId } from '@/src/mocks/admin-seed'

const route = useRoute()
const router = useRouter()

const { rowOf } = useAdminDirectory()
const { setStatus, setRole, setAdminRole } = useAdminUsers()
const { planOf, changePlan, isExpiringSoon } = useAdminSubscription()
const { ticketViews } = useAdminMaintenance()

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
</script>

<template>
  <div v-if="row" class="space-y-6">
    <div class="space-y-3">
      <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/admin/users')">
        <ArrowLeft class="mr-1 h-4 w-4" />
        返回使用者列表
      </Button>

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
      <Card class="rounded-[1.5rem]">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">AI 用量</p>
          <p class="text-2xl font-black">
            <template v-if="row.subscription && row.plan">
              {{ row.subscription.aiUsed }} / {{ row.plan.aiQuota }}
            </template>
            <span v-else class="text-muted-foreground">—</span>
          </p>
        </CardContent>
      </Card>
      <Card class="rounded-[1.5rem]">
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
      <Card class="rounded-[1.5rem]">
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
      <Card class="rounded-[1.5rem]">
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
    <Card class="rounded-[1.5rem]">
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
    <Card class="rounded-[1.5rem]">
      <CardHeader><CardTitle>訂閱與容量</CardTitle></CardHeader>
      <CardContent>
        <p v-if="!row.subscription" class="text-muted-foreground">此帳號尚未訂閱任何方案。</p>

        <div v-else class="space-y-4">
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
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">AI 分析</span>
                <span>
                  {{ row.subscription.aiUsed }} / {{ planOf(row.subscription).aiQuota }} 次
                </span>
              </div>
              <Progress
                :model-value="usagePercent(row.subscription.aiUsed, planOf(row.subscription).aiQuota)"
              />
            </div>
            <div class="space-y-1.5">
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">儲存空間</span>
                <span>
                  {{ storageLabel(row.subscription.storageUsedMb) }} /
                  {{ storageLabel(planOf(row.subscription).storageMb) }}
                </span>
              </div>
              <Progress
                :model-value="
                  usagePercent(row.subscription.storageUsedMb, planOf(row.subscription).storageMb)
                "
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 押金對帳 -->
    <Card class="rounded-[1.5rem]">
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

    <!-- 報修工單 -->
    <Card class="rounded-[1.5rem]">
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
  </div>

  <div v-else class="space-y-4 py-16 text-center">
    <p class="text-muted-foreground">找不到這個使用者。</p>
    <Button variant="outline" @click="router.push('/admin/users')">返回使用者列表</Button>
  </div>
</template>

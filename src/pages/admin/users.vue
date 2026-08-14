<script setup lang="ts">
import { computed, watch } from 'vue'
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
import { BadgeCheck, Search, ShieldAlert, X } from 'lucide-vue-next'
import AdminRoleCountCard from '@/src/components/admin/AdminRoleCountCard.vue'
import PlanDistributionCard from '@/src/components/admin/PlanDistributionCard.vue'
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

const { rows, filteredRows, filter, filterActive, clearFilter, planSegments, adminCounts } =
  useAdminDirectory()

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
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">使用者管理</h1>
      <p class="mt-1 text-muted-foreground">
        以使用者為中心檢視訂閱容量、押金對帳與報修工單，點選任一列進入詳情。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
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
                <p class="text-sm text-muted-foreground">{{ row.user.nickname ?? '—' }}</p>
              </TableCell>

              <TableCell class="whitespace-nowrap">{{ adminRoleLabels[row.user.role] }}</TableCell>

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
            </TableRow>

            <TableRow v-if="filteredRows.length === 0">
              <TableCell colspan="6" class="py-10 text-center text-muted-foreground">
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
  </div>
</template>

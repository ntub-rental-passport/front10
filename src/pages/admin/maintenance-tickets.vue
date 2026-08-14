<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import { Search, X } from 'lucide-vue-next'
import TicketDetailPanel from '@/src/components/admin/TicketDetailPanel.vue'
import {
  maintenanceStatusTabs,
  useAdminMaintenance,
  type MaintenanceTicketView,
} from '@/src/composables/admin/useAdminMaintenance'
import { adminUsersCollection } from '@/src/composables/admin/useAdminUsers'
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  type MaintenanceCategory,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { userDisplayName } from '@/src/utils/admin-user-directory'
import { formatDate, formatDateTime } from '@/src/utils/admin-format'

const route = useRoute()
const router = useRouter()

const { ticketViews, statusTab, categoryFilter, keyword, userFilter, filteredTickets } =
  useAdminMaintenance()

const categoryOptions = Object.keys(maintenanceCategoryLabels) as MaintenanceCategory[]

// 從使用者詳情跳轉過來時預選該使用者，但只是初始值 —— 按「顯示全部使用者」就能解除
watch(
  () => route.query.user,
  (value) => {
    userFilter.value = typeof value === 'string' ? value : ''
  },
  { immediate: true },
)

// 總覽的待辦佇列用 ?tab= 指定要落在哪個狀態分頁
const validTabs = new Set(maintenanceStatusTabs.map((tab) => tab.value))
watch(
  () => route.query.tab,
  (value) => {
    if (typeof value === 'string' && validTabs.has(value as typeof statusTab.value)) {
      statusTab.value = value as typeof statusTab.value
    }
  },
  { immediate: true },
)

const filteredUserName = computed(() => {
  if (!userFilter.value) return ''
  const user = adminUsersCollection.value.find((item) => item.id === userFilter.value)
  return user ? userDisplayName(user) : userFilter.value
})

const selectedId = ref<string | null>(null)

// 待辦佇列的每一筆明細用 ?ticket= 直接把該工單的詳情打開，點進來就能動手
watch(
  () => route.query.ticket,
  (value) => {
    if (typeof value === 'string' && value) selectedId.value = value
  },
  { immediate: true },
)

// 用全量 ticketViews 而非 filteredTickets，避免篩選條件變動時詳情面板意外關閉
const selectedTicket = computed<MaintenanceTicketView | null>(
  () => ticketViews.value.find((ticket) => ticket.id === selectedId.value) ?? null,
)

function statusBadgeVariant(status: MaintenanceStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'overdue' || status === 'disputed') return 'destructive'
  if (status === 'completed' || status === 'closed') return 'secondary'
  return 'default'
}

function closeDetail(open: boolean): void {
  if (open) return
  selectedId.value = null
  // 關掉後把 ?ticket= 拿掉，否則重新整理又會自己打開
  if (route.query.ticket) {
    const { ticket: _removed, ...rest } = route.query
    void router.replace({ query: rest })
  }
}

function handleStatusTabChange(value: string): void {
  statusTab.value = value as typeof statusTab.value
}

function handleCategoryChange(value: unknown): void {
  categoryFilter.value = value as typeof categoryFilter.value
}

function clearUserFilter(): void {
  userFilter.value = ''
  void router.replace({ query: {} })
}

function clearFilters(): void {
  statusTab.value = 'all'
  categoryFilter.value = 'all'
  keyword.value = ''
  clearUserFilter()
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">報修工單追蹤</h1>
      <p class="mt-1 text-muted-foreground">
        追蹤租客報修進度，掌握逾期與爭議案件，並完整記錄每次狀態變更。
      </p>
    </div>

    <div
      v-if="userFilter"
      class="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <p class="text-sm">
        目前只顯示與
        <span class="font-semibold">{{ filteredUserName }}</span>
        相關的工單（房東或租客）。
      </p>
      <Button variant="outline" size="sm" @click="clearUserFilter">
        <X class="mr-1 h-3.5 w-3.5" />
        顯示全部使用者
      </Button>
    </div>

    <Tabs :model-value="statusTab" @update:model-value="handleStatusTabChange">
      <TabsList class="rounded-full bg-muted/60">
        <TabsTrigger
          v-for="tab in maintenanceStatusTabs"
          :key="tab.value"
          :value="tab.value"
          class="rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          {{ tab.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <Card class="rounded-3xl">
      <CardContent class="space-y-4 pt-6">
        <div class="flex flex-wrap items-center gap-3">
          <Select :model-value="categoryFilter" @update:model-value="handleCategoryChange">
            <SelectTrigger class="w-36">
              <SelectValue placeholder="分類" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分類</SelectItem>
              <SelectItem v-for="category in categoryOptions" :key="category" :value="category">
                {{ maintenanceCategoryLabels[category] }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="relative min-w-56 flex-1">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋工單編號、地址、租客或房東" class="pl-9" />
          </div>
          <p class="whitespace-nowrap text-sm text-muted-foreground">
            共 {{ filteredTickets.length }} 筆
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>工單編號</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>租客</TableHead>
              <TableHead>房東</TableHead>
              <TableHead>分類</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead class="whitespace-nowrap">建立日</TableHead>
              <TableHead class="whitespace-nowrap">已經過天數</TableHead>
              <TableHead class="whitespace-nowrap">最後更新</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="ticket in filteredTickets"
              :key="ticket.id"
              class="cursor-pointer"
              @click="selectedId = ticket.id"
            >
              <TableCell class="font-medium">{{ ticket.id }}</TableCell>
              <TableCell>{{ ticket.address }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ ticket.tenantName }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ ticket.landlordName }}</TableCell>
              <TableCell>{{ maintenanceCategoryLabels[ticket.category] }}</TableCell>
              <TableCell>
                <Badge :variant="statusBadgeVariant(ticket.status)">
                  {{ maintenanceStatusLabels[ticket.status] }}
                </Badge>
              </TableCell>
              <TableCell class="whitespace-nowrap">{{ formatDate(ticket.createdAt) }}</TableCell>
              <TableCell
                class="whitespace-nowrap"
                :class="ticket.status === 'overdue' ? 'font-semibold text-destructive' : ''"
              >
                {{ ticket.elapsed }} 天
              </TableCell>
              <TableCell class="whitespace-nowrap">
                {{ formatDateTime(ticket.lastUpdatedAt) }}
              </TableCell>
            </TableRow>
            <TableRow v-if="filteredTickets.length === 0">
              <TableCell colspan="9" class="py-10 text-center text-muted-foreground">
                <p>沒有符合條件的工單。</p>
                <Button variant="outline" size="sm" class="mt-3" @click="clearFilters">
                  清除篩選
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog :open="selectedTicket !== null" @update:open="closeDetail">
      <DialogContent v-if="selectedTicket" class="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>工單詳情 · {{ selectedTicket.id }}</DialogTitle>
          <DialogDescription>{{ selectedTicket.address }}</DialogDescription>
        </DialogHeader>
        <TicketDetailPanel :ticket="selectedTicket" />
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea/index'
import { Search } from 'lucide-vue-next'
import {
  maintenanceStatusTabs,
  useAdminMaintenance,
  type MaintenanceTicketView,
} from '@/src/composables/admin/useAdminMaintenance'
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceTransitions,
  type MaintenanceCategory,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { formatDate, formatDateTime } from '@/src/utils/admin-format'

const {
  ticketViews,
  statusTab,
  categoryFilter,
  keyword,
  filteredTickets,
  advanceStatus,
  saveAdminNote,
  error,
} = useAdminMaintenance()

const categoryOptions = Object.keys(maintenanceCategoryLabels) as MaintenanceCategory[]

const selectedId = ref<string | null>(null)
const changeNote = ref('')
const adminNoteDraft = ref('')

// 用全量 ticketViews 而非 filteredTickets，避免篩選條件變動時詳情面板意外關閉
const selectedTicket = computed<MaintenanceTicketView | null>(
  () => ticketViews.value.find((ticket) => ticket.id === selectedId.value) ?? null,
)

const nextStatuses = computed<MaintenanceStatus[]>(() =>
  selectedTicket.value ? maintenanceTransitions[selectedTicket.value.status] : [],
)

function statusBadgeVariant(status: MaintenanceStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'overdue' || status === 'disputed') return 'destructive'
  if (status === 'completed' || status === 'closed') return 'secondary'
  return 'default'
}

function openDetail(ticket: MaintenanceTicketView): void {
  selectedId.value = ticket.id
  changeNote.value = ''
  adminNoteDraft.value = ticket.adminNote
}

function closeDetail(open: boolean): void {
  if (!open) selectedId.value = null
}

function handleAdvance(next: MaintenanceStatus): void {
  if (!selectedTicket.value) return
  if (advanceStatus(selectedTicket.value.id, next, changeNote.value)) {
    changeNote.value = ''
  }
}

function handleSaveNote(): void {
  if (!selectedTicket.value) return
  saveAdminNote(selectedTicket.value.id, adminNoteDraft.value)
}

function handleStatusTabChange(value: string): void {
  statusTab.value = value as typeof statusTab.value
}

function handleCategoryChange(value: unknown): void {
  categoryFilter.value = value as typeof categoryFilter.value
}

function clearFilters(): void {
  statusTab.value = 'all'
  categoryFilter.value = 'all'
  keyword.value = ''
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

    <Card class="rounded-[1.5rem]">
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
            <Input v-model="keyword" placeholder="搜尋工單編號、地址或租客" class="pl-9" />
          </div>
          <p class="whitespace-nowrap text-sm text-muted-foreground">共 {{ filteredTickets.length }} 筆</p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>工單編號</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>租客</TableHead>
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
              @click="openDetail(ticket)"
            >
              <TableCell class="font-medium">{{ ticket.id }}</TableCell>
              <TableCell>{{ ticket.address }}</TableCell>
              <TableCell>{{ ticket.tenant }}</TableCell>
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
              <TableCell class="whitespace-nowrap">{{ formatDateTime(ticket.lastUpdatedAt) }}</TableCell>
            </TableRow>
            <TableRow v-if="filteredTickets.length === 0">
              <TableCell colspan="8" class="py-10 text-center text-muted-foreground">
                <p>沒有符合條件的工單。</p>
                <Button variant="outline" size="sm" class="mt-3" @click="clearFilters">清除篩選</Button>
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

        <div class="space-y-5 text-sm">
          <!-- 基本資訊 -->
          <div class="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4">
            <div>
              <p class="text-muted-foreground">租客</p>
              <p class="font-medium">{{ selectedTicket.tenant }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">分類</p>
              <p class="font-medium">{{ maintenanceCategoryLabels[selectedTicket.category] }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">狀態</p>
              <Badge :variant="statusBadgeVariant(selectedTicket.status)">
                {{ maintenanceStatusLabels[selectedTicket.status] }}
              </Badge>
            </div>
            <div>
              <p class="text-muted-foreground">建立日</p>
              <p class="font-medium">{{ formatDate(selectedTicket.createdAt) }}</p>
            </div>
          </div>

          <!-- 問題描述 -->
          <div>
            <p class="mb-1 font-semibold">問題描述</p>
            <p class="text-muted-foreground">{{ selectedTicket.description }}</p>
          </div>

          <!-- 狀態時間軸 -->
          <div>
            <p class="mb-2 font-semibold">狀態時間軸</p>
            <ol class="space-y-3 border-l border-border pl-4">
              <li v-for="(event, index) in selectedTicket.timeline" :key="index">
                <p class="text-xs text-muted-foreground">{{ formatDateTime(event.at) }} · {{ event.actor }}</p>
                <p>
                  {{ event.from ? maintenanceStatusLabels[event.from] : '建立' }}
                  <span class="text-muted-foreground">→</span>
                  {{ maintenanceStatusLabels[event.to] }}
                </p>
                <p v-if="event.note" class="text-muted-foreground">備註：{{ event.note }}</p>
              </li>
            </ol>
          </div>

          <!-- 依狀態機動態產生的推進按鈕 -->
          <div>
            <p class="mb-2 font-semibold">狀態推進</p>
            <Textarea v-model="changeNote" placeholder="變更備註（選填）" class="mb-2" />
            <div v-if="nextStatuses.length > 0" class="flex flex-wrap gap-2">
              <Button
                v-for="next in nextStatuses"
                :key="next"
                size="sm"
                @click="handleAdvance(next)"
              >
                推進至「{{ maintenanceStatusLabels[next] }}」
              </Button>
            </div>
            <p v-else class="text-muted-foreground">已是終態</p>
            <p v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</p>
          </div>

          <!-- 管理員註記 -->
          <div>
            <p class="mb-2 font-semibold">管理員註記</p>
            <Textarea v-model="adminNoteDraft" placeholder="填寫僅供內部檢視的備註" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="handleSaveNote">儲存管理員註記</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

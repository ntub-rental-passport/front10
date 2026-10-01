<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { AlertTriangle, ClipboardList, MessageSquareWarning, Search, Wrench, X } from 'lucide-vue-next'
import InlineStat from '@/src/components/admin/InlineStat.vue'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import { STATUS_CHIP_CLASS } from '@/src/components/admin/status-dot'
import AdminLoadNotice from '@/src/components/admin/AdminLoadNotice.vue'
import TicketDetailPanel from '@/src/components/admin/TicketDetailPanel.vue'
import {
  maintenanceQueueTab,
  maintenanceStatusTabs,
  useAdminMaintenance,
  type MaintenanceTicketView,
} from '@/src/composables/admin/useAdminMaintenance'
import { adminUsersCollection } from '@/src/composables/admin/useAdminUsers'
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceStatusTone,
  type MaintenanceCategory,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { userDisplayName } from '@/src/utils/admin-user-directory'
import { formatDate, formatDateTime } from '@/src/utils/admin-format'
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/src/components/admin/admin-tabs'

const route = useRoute()
const router = useRouter()

const {
  ticketViews,
  statusTab,
  categoryFilter,
  keyword,
  userFilter,
  filteredTickets,
  queueCount,
  stats, loadState, reload,
} = useAdminMaintenance()

const categoryOptions = Object.keys(maintenanceCategoryLabels) as MaintenanceCategory[]

// 從使用者詳情跳轉過來時預選該使用者，但只是初始值 —— 按「顯示全部使用者」就能解除
watch(
  () => route.query.user,
  (value) => {
    userFilter.value = typeof value === 'string' ? value : ''
  },
  { immediate: true },
)

// 總覽的待辦佇列用 ?tab= 指定要落在哪個狀態分頁；待處理不是狀態，要另外併入合法值
const validTabs = new Set([maintenanceQueueTab.value, ...maintenanceStatusTabs.map((tab) => tab.value)])
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
  <div class="space-y-6" data-real="true">
    <AdminLoadNotice :state="loadState" what="報修工單" @retry="reload" />
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

    <!--
      左邊頁籤、右邊 KPI 直向條列，併成同一條橫帶。

      原本 KPI 是橫跨整列的四張卡，佔掉約 70px 而且左右都很空。改成右側條列
      之後那塊垂直空間讓給了頁籤 —— 頁籤是這一頁最常點的東西，本來就該比
      「看一眼就好」的統計數字大。

      真實資料：stats 與工單清單來自 /api/admin/repairs。
      約定見 src/utils/admin-data-marking.md。
    -->
    <div class="flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
      <Tabs class="min-w-0 max-w-full" :model-value="statusTab" @update:model-value="handleStatusTabChange">
        <TabsList :class="ADMIN_TAB_LIST">
        <!--
          「待處理」不是工單狀態，是跨狀態的聚合（送出＋通報＋逾期＋爭議）。
          原本只靠一條分隔線跟後面七顆狀態頁籤區隔，但同樣大小、同樣顏色的
          膠囊排在一起，分隔線攔不住「這是第八種狀態」的直覺。

          所以它更大（py-2、字體加粗）而且用主色：未選時是淡色底＋主色字，
          選中時整顆填滿主色。後面七顆維持原本的白底浮起，兩者不會混淆。
        -->
        <TabsTrigger
          :value="maintenanceQueueTab.value"
          class="rounded-full bg-primary/10 px-6 py-2.5 text-base font-semibold text-primary data-[state=active]:bg-primary-surface data-[state=active]:text-primary-surface-foreground data-[state=active]:shadow-sm"
        >
          {{ maintenanceQueueTab.label }} {{ queueCount }}
        </TabsTrigger>
        <div class="mx-2 h-4 w-px bg-border" aria-hidden="true" />
          <TabsTrigger
            v-for="tab in maintenanceStatusTabs"
            :key="tab.value"
            :value="tab.value"
            :class="ADMIN_TAB_TRIGGER"
          >
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <!--
        右側統計條列。用 <dl> 而不是一堆 div：這就是「名稱／數值」的定義
        清單，語意對了螢幕閱讀器才唸得出配對關係。

        「逾期未回應」是這一頁唯一會叫人現在動手的數字，所以它要跳出來。
        但**不能把 destructive 拿來當文字色**：--destructive 是
        oklch(0.7 0.18 40)，偏亮，當文字踩在淺色卡上實測只有 2.61，遠低於
        AA —— status-dot.ts 的註解早就寫過這件事，這裡差點重蹈覆轍。

        改用實心填色（STATUS_CHIP_CLASS.danger），前景色是跟填色配對設計的，
        實測兩個模式都是 6.35。其餘三列維持中性，有色才有意義。
      -->
      <dl v-if="loadState === 'ready'" class="min-w-[13rem] divide-y divide-border text-sm">
        <div class="flex items-baseline justify-between gap-8 py-1.5">
          <dt class="text-foreground/70">逾期未回應</dt>
          <dd>
            <span
              :class="[
                'inline-flex min-w-9 justify-center rounded-full px-2 py-0.5 text-base font-bold tabular-nums',
                STATUS_CHIP_CLASS.danger,
              ]"
            >
              {{ stats.overdue }}
            </span>
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-8 py-1.5">
          <dt class="text-foreground/70">房東處理中</dt>
          <dd class="text-base font-bold tabular-nums">{{ stats.processing }}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-8 py-1.5">
          <dt class="text-foreground/70">爭議中</dt>
          <dd class="text-base font-bold tabular-nums">{{ stats.disputed }}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-8 py-1.5">
          <dt class="text-foreground/70">工單總數</dt>
          <dd class="text-base font-bold tabular-nums">{{ stats.total }}</dd>
        </div>
      </dl>
    </div>

    <Card class="rounded-3xl">
      <CardContent class="px-5 pb-5 space-y-4 pt-6">
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

        <Table v-if="loadState === 'ready'">
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">工單編號</TableHead>
              <TableHead class="min-w-[12rem]">地址</TableHead>
              <TableHead class="whitespace-nowrap">租客</TableHead>
              <TableHead class="whitespace-nowrap">房東</TableHead>
              <TableHead class="whitespace-nowrap">分類</TableHead>
              <TableHead class="whitespace-nowrap">狀態</TableHead>
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
              <TableCell class="whitespace-nowrap font-medium">{{ ticket.id }}</TableCell>
              <TableCell>{{ ticket.address }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ ticket.tenantName }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ ticket.landlordName }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ maintenanceCategoryLabels[ticket.category] }}</TableCell>
              <TableCell class="whitespace-nowrap">
                <!--
                  狀態用圓點不用徽章：圓點＝會變的狀態、徽章＝不會變的分類
                  （這一列左邊的「問題類型」仍然是徽章）。顏色對應與四分的
                  理由見 admin-maintenance.ts 的 maintenanceStatusTone。
                -->
                <StatusDot
                  :tone="ticket.awaitingInspection || ticket.status === 'submitted' || ticket.status === 'notified' ? 'idle' : maintenanceStatusTone(ticket.status)"
                  :label="ticket.awaitingInspection ? '待租客複驗' : maintenanceStatusLabels[ticket.status]"
                />
                <div class="mt-1 flex gap-1">
                  <span v-if="ticket.overdue" :class="['rounded-full px-2 text-xs', STATUS_CHIP_CLASS.danger]">逾期</span>
                  <span v-if="ticket.disputed" :class="['rounded-full px-2 text-xs', STATUS_CHIP_CLASS.danger]">爭議中</span>
                </div>
              </TableCell>
              <TableCell class="whitespace-nowrap">{{ formatDate(ticket.createdAt) }}</TableCell>
              <TableCell
                class="whitespace-nowrap"
                :class="ticket.overdue ? 'font-semibold text-destructive' : ''"
              >
                {{ ticket.elapsed }} 天
              </TableCell>
              <TableCell class="whitespace-nowrap">
                {{ formatDateTime(ticket.lastUpdatedAt) }}
              </TableCell>
            </TableRow>
            <TableRow v-if="loadState === 'ready' && filteredTickets.length === 0 && statusTab === 'queue'">
              <TableCell colspan="9" class="py-10 text-center text-muted-foreground">
                <p>目前沒有需要管理員處理的工單，租客與房東的報修流程都在正常進行。</p>
                <Button
                  variant="outline"
                  size="sm"
                  class="mt-3"
                  @click="handleStatusTabChange('all')"
                >
                  查看全部工單
                </Button>
              </TableCell>
            </TableRow>
            <TableRow v-else-if="loadState === 'ready' && filteredTickets.length === 0">
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

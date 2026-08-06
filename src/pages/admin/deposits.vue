<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
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
import { AlertTriangle, BadgeCheck, Search } from 'lucide-vue-next'
import {
  depositStatusTabs,
  useAdminDeposits,
  type DepositCaseView,
} from '@/src/composables/admin/useAdminDeposits'
import {
  deductionResponseLabels,
  depositCapMonths,
  depositStatusLabels,
  depositTransitions,
  type DeductionResponse,
  type DepositStatus,
} from '@/src/utils/admin-deposit'
import { formatDate } from '@/src/utils/admin-format'
import { formatCurrency } from '@/src/utils/rent-format'

const {
  caseViews,
  statusTab,
  onlyOverCollected,
  onlyDisputed,
  keyword,
  filteredCases,
  advanceStatus,
  openDispute,
  setDeductionResponse,
  error,
} = useAdminDeposits()

const selectedId = ref<string | null>(null)
const changeNote = ref('')

// 用全量 caseViews 而非 filteredCases，避免篩選條件變動時詳情面板意外關閉
const selectedCase = computed<DepositCaseView | null>(
  () => caseViews.value.find((item) => item.id === selectedId.value) ?? null,
)

// 一般推進按鈕不含「轉爭議」，轉爭議另外用專屬按鈕呈現
const nextStatuses = computed<DepositStatus[]>(() =>
  selectedCase.value
    ? depositTransitions[selectedCase.value.status].filter((status) => status !== 'disputed')
    : [],
)

const canDispute = computed(() =>
  selectedCase.value ? depositTransitions[selectedCase.value.status].includes('disputed') : false,
)

function statusBadgeVariant(status: DepositStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'disputed' || status === 'overdue') return 'destructive'
  if (status === 'refunded') return 'secondary'
  return 'default'
}

function responseBadgeVariant(response: DeductionResponse): 'default' | 'secondary' | 'destructive' {
  if (response === 'disputed') return 'destructive'
  if (response === 'agreed') return 'default'
  return 'secondary'
}

function openDetail(item: DepositCaseView): void {
  selectedId.value = item.id
  changeNote.value = ''
}

function closeDetail(open: boolean): void {
  if (!open) selectedId.value = null
}

function handleAdvance(next: DepositStatus): void {
  if (!selectedCase.value) return
  if (advanceStatus(selectedCase.value.id, next, changeNote.value)) {
    changeNote.value = ''
  }
}

function handleDispute(): void {
  if (!selectedCase.value) return
  if (openDispute(selectedCase.value.id, changeNote.value)) {
    changeNote.value = ''
  }
}

function handleSetResponse(deductionId: string, response: DeductionResponse): void {
  if (!selectedCase.value) return
  setDeductionResponse(selectedCase.value.id, deductionId, response)
}

function handleStatusTabChange(value: string): void {
  statusTab.value = value as typeof statusTab.value
}

function clearFilters(): void {
  statusTab.value = 'all'
  onlyOverCollected.value = false
  onlyDisputed.value = false
  keyword.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">押金退還追蹤</h1>
      <p class="mt-1 text-muted-foreground">
        掌握押金退還進度、超收與逾期案件，並檢核扣款是否符合法規。
      </p>
    </div>

    <Tabs :model-value="statusTab" @update:model-value="handleStatusTabChange">
      <TabsList class="rounded-full bg-muted/60">
        <TabsTrigger
          v-for="tab in depositStatusTabs"
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
        <div class="flex flex-wrap items-center gap-4">
          <div class="relative min-w-56 flex-1">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋編號、地址或租客" class="pl-9" />
          </div>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="onlyOverCollected" />
            只看超收
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="onlyDisputed" />
            只看爭議
          </label>
          <p class="whitespace-nowrap text-sm text-muted-foreground">共 {{ filteredCases.length }} 筆</p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>編號</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>租客</TableHead>
              <TableHead class="whitespace-nowrap">押金</TableHead>
              <TableHead class="whitespace-nowrap">月租金</TableHead>
              <TableHead class="whitespace-nowrap">超收</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead class="whitespace-nowrap">退還期限</TableHead>
              <TableHead class="whitespace-nowrap">逾期天數</TableHead>
              <TableHead class="whitespace-nowrap">預計退還</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="item in filteredCases"
              :key="item.id"
              class="cursor-pointer"
              @click="openDetail(item)"
            >
              <TableCell class="font-medium">{{ item.id }}</TableCell>
              <TableCell>{{ item.address }}</TableCell>
              <TableCell>{{ item.tenant }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ formatCurrency(item.depositAmount) }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ formatCurrency(item.monthlyRent) }}</TableCell>
              <TableCell class="whitespace-nowrap">
                <Badge v-if="item.overCollected" variant="destructive">超收</Badge>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell>
                <Badge :variant="statusBadgeVariant(item.status)">
                  {{ depositStatusLabels[item.status] }}
                </Badge>
              </TableCell>
              <TableCell class="whitespace-nowrap">
                {{ item.refundDueDate ? formatDate(item.refundDueDate) : '—' }}
              </TableCell>
              <TableCell
                class="whitespace-nowrap"
                :class="item.overdueDays > 0 ? 'font-semibold text-destructive' : ''"
              >
                {{ item.overdueDays > 0 ? `${item.overdueDays} 天` : '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap">{{ formatCurrency(item.expectedRefund) }}</TableCell>
            </TableRow>
            <TableRow v-if="filteredCases.length === 0">
              <TableCell colspan="10" class="py-10 text-center text-muted-foreground">
                <p>沒有符合條件的案件。</p>
                <Button variant="outline" size="sm" class="mt-3" @click="clearFilters">清除篩選</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog :open="selectedCase !== null" @update:open="closeDetail">
      <DialogContent v-if="selectedCase" class="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>押金案件詳情 · {{ selectedCase.id }}</DialogTitle>
          <DialogDescription>{{ selectedCase.address }}（{{ selectedCase.tenant }}）</DialogDescription>
        </DialogHeader>

        <div class="space-y-5 text-sm">
          <!-- 金額摘要 -->
          <div class="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-4">
            <div>
              <p class="text-muted-foreground">押金</p>
              <p class="font-medium">{{ formatCurrency(selectedCase.depositAmount) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">月租金</p>
              <p class="font-medium">{{ formatCurrency(selectedCase.monthlyRent) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">已同意扣款</p>
              <p class="font-medium">{{ formatCurrency(selectedCase.agreedDeductionTotal) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">預計退還</p>
              <p class="font-semibold text-primary">{{ formatCurrency(selectedCase.expectedRefund) }}</p>
            </div>
          </div>

          <!-- 法規檢核區塊 -->
          <div class="space-y-2">
            <p class="font-semibold">法規檢核</p>

            <div
              v-if="selectedCase.overCollected"
              class="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
            >
              <AlertTriangle class="h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p class="font-medium text-destructive">押金超收</p>
                <p class="text-muted-foreground">
                  押金金額 {{ formatCurrency(selectedCase.depositAmount) }}，上限金額
                  {{ formatCurrency(selectedCase.monthlyRent * depositCapMonths) }}，超收差額
                  {{ formatCurrency(selectedCase.overCollectedAmountValue) }}。依據：土地法第 99 條。
                </p>
              </div>
            </div>

            <div
              v-if="selectedCase.overdueDays > 0"
              class="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
            >
              <AlertTriangle class="h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p class="font-medium text-destructive">逾期未退</p>
                <p class="text-muted-foreground">已逾應退期限 {{ selectedCase.overdueDays }} 天。</p>
              </div>
            </div>

            <div
              v-if="!selectedCase.overCollected && selectedCase.overdueDays === 0"
              class="flex gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4"
            >
              <BadgeCheck class="h-5 w-5 shrink-0 text-emerald-600" />
              <p class="font-medium text-emerald-700">均符合規範</p>
            </div>
          </div>

          <!-- 扣款明細 -->
          <div>
            <p class="mb-2 font-semibold">扣款明細</p>
            <div v-if="selectedCase.deductions.length === 0" class="text-muted-foreground">
              房東尚未提出扣款項目。
            </div>
            <ul v-else class="space-y-2">
              <li
                v-for="deduction in selectedCase.deductions"
                :key="deduction.id"
                class="rounded-xl border border-border/70 p-3"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <p class="font-medium">{{ deduction.label }}</p>
                    <p class="text-muted-foreground">{{ formatCurrency(deduction.amount) }} · {{ deduction.basis }}</p>
                  </div>
                  <Badge :variant="responseBadgeVariant(deduction.tenantResponse)">
                    {{ deductionResponseLabels[deduction.tenantResponse] }}
                  </Badge>
                </div>
                <div class="mt-2 flex gap-2">
                  <Button
                    v-for="response in (['pending', 'agreed', 'disputed'] as DeductionResponse[])"
                    :key="response"
                    size="sm"
                    :variant="deduction.tenantResponse === response ? 'default' : 'outline'"
                    @click="handleSetResponse(deduction.id, response)"
                  >
                    {{ deductionResponseLabels[response] }}
                  </Button>
                </div>
              </li>
            </ul>
          </div>

          <!-- 依狀態機產生的推進按鈕 -->
          <div>
            <p class="mb-2 font-semibold">狀態推進</p>
            <Textarea v-model="changeNote" placeholder="變更備註（選填）" class="mb-2" />
            <div v-if="nextStatuses.length > 0 || canDispute" class="flex flex-wrap gap-2">
              <Button
                v-for="next in nextStatuses"
                :key="next"
                size="sm"
                @click="handleAdvance(next)"
              >
                推進至「{{ depositStatusLabels[next] }}」
              </Button>
              <Button v-if="canDispute" size="sm" variant="destructive" @click="handleDispute">
                一鍵轉爭議
              </Button>
            </div>
            <p v-else class="text-muted-foreground">已是終態</p>
            <p v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="closeDetail(false)">關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

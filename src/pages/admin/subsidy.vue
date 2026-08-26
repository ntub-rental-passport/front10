<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
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
import { CheckCircle2, PackageCheck, Search } from 'lucide-vue-next'
import FeatureOutageBanner from '@/src/components/admin/FeatureOutageBanner.vue'
import {
  subsidyTabs,
  useAdminSubsidy,
  type SubsidyApplicationView,
} from '@/src/composables/admin/useAdminSubsidy'
import {
  SUBSIDY_DOC_KEYS,
  subsidyDocLabels,
  subsidyStatusLabels,
  type SubsidyDocKey,
  type SubsidyStatus,
} from '@/src/utils/admin-subsidy'
import { formatDate } from '@/src/utils/admin-format'

const route = useRoute()

const {
  batches,
  applicationViews,
  filteredApplications,
  submittable,
  stats,
  tab,
  keyword,
  batchFilter,
  markMissingDocuments,
  reject,
  approve,
  createBatch,
  error,
} = useAdminSubsidy()

// 總覽或其他頁可用 ?tab= 直接落在某一籤
const validTabs = new Set(subsidyTabs.map((item) => item.value))
watch(
  () => route.query.tab,
  (value) => {
    if (typeof value === 'string' && validTabs.has(value as typeof tab.value)) {
      tab.value = value as typeof tab.value
    }
  },
  { immediate: true },
)

const selectedId = ref<string | null>(null)
const selected = computed<SubsidyApplicationView | null>(
  () => applicationViews.value.find((item) => item.id === selectedId.value) ?? null,
)

// 詳情裡的兩種退回動作各自的草稿
const missingKeys = ref<SubsidyDocKey[]>([])
const missingNote = ref('')
const rejectReason = ref('')

watch(selectedId, () => {
  missingKeys.value = []
  missingNote.value = ''
  rejectReason.value = ''
  error.value = ''
})

function statusVariant(status: SubsidyStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'rejected') return 'destructive'
  if (status === 'need-docs') return 'destructive'
  if (status === 'submitted') return 'secondary'
  return 'default'
}

function toggleMissing(key: SubsidyDocKey, checked: boolean): void {
  missingKeys.value = checked
    ? [...missingKeys.value, key]
    : missingKeys.value.filter((item) => item !== key)
}

function handleMarkMissing(): void {
  if (!selected.value) return
  if (markMissingDocuments(selected.value.id, missingKeys.value, missingNote.value)) {
    selectedId.value = null
  }
}

function handleReject(): void {
  if (!selected.value) return
  if (reject(selected.value.id, rejectReason.value)) selectedId.value = null
}

function handleApprove(): void {
  if (!selected.value) return
  if (approve(selected.value.id)) selectedId.value = null
}

// ── 送件批次 ──────────────────────────────────────────────────────

const batchOpen = ref(false)
const batchPicked = ref<string[]>([])
const batchNote = ref('')

function openBatch(): void {
  batchPicked.value = submittable.value.map((item) => item.id)
  batchNote.value = ''
  error.value = ''
  batchOpen.value = true
}

function toggleBatchPick(id: string, checked: boolean): void {
  batchPicked.value = checked
    ? [...batchPicked.value, id]
    : batchPicked.value.filter((item) => item !== id)
}

function handleCreateBatch(): void {
  if (createBatch(batchPicked.value, batchNote.value)) batchOpen.value = false
}

// 已送出的批次，新的在上面
const sentBatches = computed(() =>
  [...batches.value].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
)

function selectBatch(value: string): void {
  // 再點一次同一個就取消篩選
  batchFilter.value = batchFilter.value === value ? 'all' : value
}

function formatMoney(amount: number): string {
  return `NT$${amount.toLocaleString('zh-TW')}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- 送件的入口只留左欄草稿批次那一顆，標題列不再重複放一次 -->
    <div>
      <h1 class="text-3xl font-black tracking-tight">租金補貼審核</h1>
      <p class="mt-1 text-muted-foreground">
        審核通過的案件會落入左側草稿批次，確認後一次送出；送件後的政府端進度僅供查看。
      </p>
    </div>

    <FeatureOutageBanner feature-key="subsidy" />

    <!--
      左欄批次、右欄案件。
      「待送件」本身就是下一批的草稿 —— 審核通過即進入草稿，
      不需要另外建一個批次實體，只是先前沒把它畫成批次，才顯得多一道手續。
    -->
    <div class="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- 批次固定 280px：卡片內容是編號與日期，跟著螢幕變寬只會拉開空白 -->
      <aside class="space-y-3">
        <!-- 草稿批次：審核通過的案件直接落在這裡 -->
        <Card
          class="rounded-3xl border-primary/30 bg-primary/5"
          :class="batchFilter === 'draft' ? 'ring-2 ring-primary' : ''"
        >
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-medium">草稿批次</CardTitle>
            <p class="text-xs text-muted-foreground">審核通過的案件會落在這裡</p>
          </CardHeader>
          <CardContent class="space-y-3">
            <button
              type="button"
              class="flex w-full items-baseline gap-1.5 text-left"
              @click="selectBatch('draft')"
            >
              <span class="text-3xl font-black leading-none tabular-nums text-primary">
                {{ submittable.length }}
              </span>
              <span class="text-sm text-muted-foreground">件待送件</span>
            </button>
            <Button
              size="sm"
              class="w-full"
              :disabled="submittable.length === 0"
              @click="openBatch"
            >
              <PackageCheck class="mr-1 h-4 w-4" />
              送出這批
            </Button>
          </CardContent>
        </Card>

        <p class="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          已送出批次
        </p>

        <button
          v-for="batch in sentBatches"
          :key="batch.id"
          type="button"
          class="w-full rounded-2xl border p-3 text-left transition-colors hover:bg-muted/50"
          :class="batchFilter === batch.id ? 'border-primary bg-primary/5' : 'bg-background'"
          @click="selectBatch(batch.id)"
        >
          <p class="font-mono text-sm font-semibold">{{ batch.code }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ formatDate(batch.createdAt) }}・{{ batch.applicationIds.length }} 件
          </p>
        </button>

        <p v-if="sentBatches.length === 0" class="px-1 text-xs text-muted-foreground">
          尚未送出任何批次。
        </p>
      </aside>

      <div class="min-w-0 space-y-4">
        <div
          v-if="batchFilter !== 'all'"
          class="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm"
        >
          <span>
            目前只顯示
            <span class="font-semibold">
              {{
                batchFilter === 'draft'
                  ? '草稿批次'
                  : sentBatches.find((b) => b.id === batchFilter)?.code
              }}
            </span>
            的案件。
          </span>
          <Button variant="outline" size="sm" @click="batchFilter = 'all'">顯示全部批次</Button>
        </div>

      <Tabs :model-value="tab" @update:model-value="(value: string) => (tab = value as typeof tab)">
        <TabsList class="rounded-full bg-muted/60">
          <TabsTrigger
            v-for="item in subsidyTabs"
            :key="item.value"
            :value="item.value"
            class="rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {{ item.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card class="rounded-3xl">
        <CardContent class="space-y-4 pt-6">
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative min-w-56 flex-1">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="keyword" placeholder="搜尋申請編號、申請人或地址" class="pl-9" />
            </div>
            <p class="whitespace-nowrap text-sm text-muted-foreground">
              共 {{ filteredApplications.length }} 件・待審 {{ stats.pending }}・待送件 {{ stats.ready }}
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="whitespace-nowrap">編號</TableHead>
                <TableHead>申請人</TableHead>
                <!-- 中文可在任意字元換行，不給下限就會被擠成一字一行 -->
                <TableHead class="min-w-52">地址</TableHead>
                <TableHead class="whitespace-nowrap">狀態</TableHead>
                <TableHead class="whitespace-nowrap">文件</TableHead>
                <TableHead class="whitespace-nowrap">批次</TableHead>
                <TableHead class="whitespace-nowrap">申請日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="item in filteredApplications"
                :key="item.id"
                class="cursor-pointer"
                @click="selectedId = item.id"
              >
                <TableCell class="whitespace-nowrap font-medium">{{ item.id }}</TableCell>
                <TableCell class="whitespace-nowrap">{{ item.applicantName }}</TableCell>
                <TableCell>{{ item.address }}</TableCell>
                <TableCell>
                  <Badge :variant="statusVariant(item.status)" class="whitespace-nowrap">
                    {{ subsidyStatusLabels[item.status] }}
                  </Badge>
                </TableCell>
                <TableCell
                  class="whitespace-nowrap text-sm"
                  :class="item.documentsReady ? 'text-muted-foreground' : 'font-semibold text-destructive'"
                >
                  {{ item.documentsReady ? '齊備' : `缺 ${item.missingLabel}` }}
                </TableCell>
                <TableCell class="whitespace-nowrap font-mono text-xs">
                  {{ item.batchCode ?? '—' }}
                </TableCell>
                <TableCell class="whitespace-nowrap">{{ formatDate(item.submittedAt) }}</TableCell>
              </TableRow>
              <TableRow v-if="filteredApplications.length === 0">
                <TableCell colspan="7" class="py-10 text-center text-muted-foreground">
                  沒有符合條件的申請案件。
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>

    <!-- 詳情：第一層可操作，第二層唯讀 -->
    <Dialog
      :open="selected !== null"
      @update:open="(open: boolean) => { if (!open) selectedId = null }"
    >
      <DialogContent v-if="selected" class="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>補貼申請 · {{ selected.id }}</DialogTitle>
          <DialogDescription>
            {{ selected.applicantName }}・{{ selected.address }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-5 text-sm">
          <div class="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4">
            <div>
              <p class="text-muted-foreground">狀態</p>
              <Badge :variant="statusVariant(selected.status)" class="mt-1">
                {{ subsidyStatusLabels[selected.status] }}
              </Badge>
            </div>
            <div>
              <p class="text-muted-foreground">月租</p>
              <p class="font-medium">{{ formatMoney(selected.monthlyRent) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">申請日</p>
              <p class="font-medium">{{ formatDate(selected.submittedAt) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">送件批次</p>
              <p class="font-mono font-medium">{{ selected.batchCode ?? '尚未送件' }}</p>
            </div>
          </div>

          <div>
            <p class="mb-2 font-semibold">文件檢核</p>
            <ul class="space-y-1.5">
              <li
                v-for="doc in selected.documents"
                :key="doc.key"
                class="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <span>
                  {{ subsidyDocLabels[doc.key] }}
                  <span v-if="doc.hint" class="block text-xs text-muted-foreground">
                    {{ doc.hint }}
                  </span>
                </span>
                <Badge :variant="doc.status === 'approved' ? 'secondary' : 'destructive'">
                  {{ doc.status === 'approved' ? '已通過' : '缺件' }}
                </Badge>
              </li>
            </ul>
          </div>

          <div v-if="selected.reviewNote">
            <p class="mb-1 font-semibold">審核註記</p>
            <p class="text-muted-foreground">{{ selected.reviewNote }}</p>
          </div>

          <!-- 第二層：政府端進度，唯讀 -->
          <div v-if="selected.governmentSteps.length > 0">
            <p class="mb-2 font-semibold">政府端進度</p>
            <ol class="space-y-2 border-l border-border pl-4">
              <li v-for="step in selected.governmentSteps" :key="step.title">
                <p
                  :class="
                    step.status === 'active'
                      ? 'font-semibold text-primary'
                      : step.status === 'done'
                        ? ''
                        : 'text-muted-foreground'
                  "
                >
                  {{ step.title }}
                  <span v-if="step.date" class="ml-1 text-xs text-muted-foreground">
                    {{ formatDate(step.date) }}
                  </span>
                </p>
                <p v-if="step.note" class="text-xs text-muted-foreground">{{ step.note }}</p>
              </li>
            </ol>
            <p class="mt-2 text-xs text-muted-foreground">
              此段由政府受理系統回覆，後台僅同步顯示，無法在此變更。
            </p>
          </div>

          <!-- 第一層操作：只有還在後台手上的案件才顯示 -->
          <template v-if="selected.status === 'pending' || selected.status === 'need-docs'">
            <div class="space-y-2 rounded-xl border p-4">
              <p class="font-semibold">標記缺件</p>
              <p class="text-xs text-muted-foreground">勾選未通過的文件，說明會一併送給申請人。</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  v-for="key in SUBSIDY_DOC_KEYS"
                  :key="key"
                  class="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    :model-value="missingKeys.includes(key)"
                    @update:model-value="(value: boolean) => toggleMissing(key, value)"
                  />
                  {{ subsidyDocLabels[key] }}
                </label>
              </div>
              <Textarea v-model="missingNote" placeholder="補件說明" class="mt-2" />
              <Button variant="outline" size="sm" @click="handleMarkMissing">送出補件通知</Button>
            </div>

            <div class="space-y-2 rounded-xl border p-4">
              <p class="font-semibold">判定資格不符</p>
              <p class="text-xs text-muted-foreground">退件是終態，理由必填。</p>
              <Textarea v-model="rejectReason" placeholder="退件理由" />
              <Button variant="destructive" size="sm" @click="handleReject">退件</Button>
            </div>
          </template>

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        </div>

        <DialogFooter v-if="selected.status === 'pending' || selected.status === 'need-docs'">
          <Button @click="handleApprove">
            <CheckCircle2 class="mr-1 h-4 w-4" />
            審核通過，列入待送件
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 建立送件批次 -->
    <Dialog v-model:open="batchOpen">
      <DialogContent class="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>建立送件批次</DialogTitle>
          <DialogDescription>
            勾選這次要一起送出的案件。建立後狀態轉為已送件並鎖定，之後只更新政府端進度。
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3 text-sm">
          <p v-if="submittable.length === 0" class="py-6 text-center text-muted-foreground">
            目前沒有待送件且文件齊備的案件。
          </p>
          <label
            v-for="item in submittable"
            :key="item.id"
            class="flex items-start gap-3 rounded-xl border px-3 py-2"
          >
            <Checkbox
              :model-value="batchPicked.includes(item.id)"
              class="mt-0.5"
              @update:model-value="(value: boolean) => toggleBatchPick(item.id, value)"
            />
            <span class="min-w-0">
              <span class="block font-medium">{{ item.applicantName }}・{{ item.id }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ item.address }}</span>
            </span>
          </label>

          <Textarea v-if="submittable.length > 0" v-model="batchNote" placeholder="批次備註（選填）" />
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="batchOpen = false">取消</Button>
          <Button :disabled="batchPicked.length === 0" @click="handleCreateBatch">
            送出 {{ batchPicked.length }} 件
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

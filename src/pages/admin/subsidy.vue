<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
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
  subsidyQueueTab,
  subsidyTabs,
  type SubsidyApplicationView,
  useAdminSubsidy,
} from '@/src/composables/admin/useAdminSubsidy'
import {
  SUBSIDY_DOC_KEYS,
  governmentStepVisual,
  subsidyDocLabels,
  subsidyStatusLabels,
  subsidyStatusTone,
  type SubsidyDocKey,
  type SubsidyStatus,
} from '@/src/utils/admin-subsidy'
import { formatDate } from '@/src/utils/admin-format'
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/src/components/admin/admin-tabs'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import { STATUS_CHIP_CLASS } from '@/src/components/admin/status-dot'

const route = useRoute()

const {
  batches,
  applicationViews,
  filteredApplications,
  submittable,
  stats,
  queueCount,
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
    <FeatureOutageBanner feature-key="subsidy" />

    <!--
      左欄批次、右欄案件。
      「待送件」本身就是下一批的草稿 —— 審核通過即進入草稿，
      不需要另外建一個批次實體，只是先前沒把它畫成批次，才顯得多一道手續。
    -->
    <div class="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- 批次固定 280px：卡片內容是編號與日期，跟著螢幕變寬只會拉開空白 -->
      <aside class="space-y-3">
        <!--
          案件統計放在左欄最上方，草稿批次跟著下移。

          先「這頁有多少案子、幾件要我處理」，再「這批要送出的有幾件」——
          統計講的是案件、批次卡講的是批次，由廣到窄的順序比較好讀。

          原本放在頁籤列右端（同工單頁），但這一頁的右欄被左欄吃掉 280px，
          只剩 816px，條列得縮到 9.5rem 才排得進去。搬到左欄之後它有完整的
          280px 可用，反而更好讀。

          展示資料（無 data-real）：stats 來自 src/mocks 的補貼種子資料。
          約定見 src/utils/admin-data-marking.md。
        -->
        <div class="rounded-3xl border bg-card px-5 py-3">
          <dl class="divide-y divide-border text-sm">
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="text-foreground/70">待審核</dt>
              <dd>
                <span
                  :class="[
                    'inline-flex min-w-9 justify-center rounded-full px-2 py-0.5 text-base font-bold tabular-nums',
                    STATUS_CHIP_CLASS.warn,
                  ]"
                >
                  {{ stats.pending }}
                </span>
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="text-foreground/70">待補件</dt>
              <dd class="text-base font-bold tabular-nums">{{ stats.needDocs }}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="text-foreground/70">待送件</dt>
              <dd class="text-base font-bold tabular-nums">{{ stats.ready }}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="text-foreground/70">案件總數</dt>
              <dd class="text-base font-bold tabular-nums">{{ stats.total }}</dd>
            </div>
          </dl>
        </div>

        <!-- 草稿批次：審核通過的案件直接落在這裡 -->
        <Card
          class="rounded-3xl border-primary/30 bg-primary/5"
          :class="batchFilter === 'draft' ? 'ring-2 ring-primary' : ''"
        >
          <CardHeader class="p-5 pb-3">
            <CardTitle class="text-sm font-medium">草稿批次</CardTitle>
            <!--
              原本的頁面副標說「審核通過的案件會落入左側草稿批次，確認後一次
              送出」。這張卡本來就有半句了，補上「確認後一次送出」就完整 ——
              不需要再多一行重複的說明。
            -->
            <p class="text-xs text-muted-foreground">
              審核通過的案件會落在這裡，確認後一次送出
            </p>
          </CardHeader>
          <CardContent class="px-5 pb-5 space-y-3">
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

      <!--
        左邊頁籤、右邊統計條列，同一條橫帶（同工單頁）。

        統計原本擠在下方搜尋框旁邊的一行灰字，而且六個數字只露出兩個，
        也沒說為什麼是那兩個。

        展示資料（無 data-real）：stats 來自 src/mocks 的補貼種子資料。
        約定見 src/utils/admin-data-marking.md。
      -->
      <Tabs :model-value="tab" @update:model-value="(value: string) => (tab = value as typeof tab)">
          <TabsList :class="ADMIN_TAB_LIST">
            <!--
              「待我處理」是聚合不是狀態（待審核＋待送件），做得比後面那排大
              並且上主色，再加一條分隔線 —— 否則同樣大小的膠囊排在一起，
              它會被當成第六種狀態。
            -->
            <TabsTrigger
              :value="subsidyQueueTab.value"
              class="rounded-full bg-primary/10 px-6 py-2.5 text-base font-semibold text-primary data-[state=active]:bg-primary-surface data-[state=active]:text-primary-surface-foreground data-[state=active]:shadow-sm"
            >
              {{ subsidyQueueTab.label }} {{ queueCount }}
            </TabsTrigger>
            <div class="mx-2 h-4 w-px bg-border" aria-hidden="true" />
            <TabsTrigger
              v-for="item in subsidyTabs"
              :key="item.value"
              :value="item.value"
              :class="ADMIN_TAB_TRIGGER"
            >
              {{ item.label }}
            </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card class="rounded-3xl">
        <CardContent class="px-5 pb-5 space-y-4 pt-6">
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative min-w-56 flex-1">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="keyword" placeholder="搜尋申請編號、申請人或地址" class="pl-9" />
            </div>
            <!-- 統計移到上方條列了，這裡只留「目前這個篩選有幾筆」 -->
            <p class="whitespace-nowrap text-sm text-foreground/70">
              共 {{ filteredApplications.length }} 件
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
                  <!--
                    圓點＝會變的狀態、徽章＝不會變的分類，見 subsidyStatusTone。
                    whitespace-nowrap 不能少 —— 這一欄很窄，沒有它「待審核」
                    會被擠成一個字一行。
                  -->
                  <StatusDot
                    class="whitespace-nowrap"
                    :tone="subsidyStatusTone(item.status)"
                    :label="subsidyStatusLabels[item.status]"
                  />
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

        <!--
          段與段之間用分隔線，段內距拉大 —— 全部用同一個 space-y 的話段內與
          段間距離相同，眼睛分不出邊界（同工單詳情的處理）。
          小標降成 text-xs 的弱化標籤，不再與內文同樣粗。
        -->
        <div class="divide-y divide-border text-sm [&>section]:py-5 [&>section:last-child]:pb-0">
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-muted/40 p-5">
            <div>
              <dt class="text-xs text-foreground/70">狀態</dt>
              <dd class="mt-0.5">
                <StatusDot
                  :tone="subsidyStatusTone(selected.status)"
                  :label="subsidyStatusLabels[selected.status]"
                />
              </dd>
            </div>
            <div>
              <dt class="text-xs text-foreground/70">月租</dt>
              <dd class="mt-0.5 font-medium">{{ formatMoney(selected.monthlyRent) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-foreground/70">申請日</dt>
              <dd class="mt-0.5 font-medium">{{ formatDate(selected.submittedAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-foreground/70">送件批次</dt>
              <dd class="mt-0.5 font-mono font-medium">
                {{ selected.batchCode ?? '尚未送件' }}
              </dd>
            </div>
          </dl>

          <section>
            <h3 class="mb-2.5 text-xs font-semibold tracking-wide text-foreground/70">文件檢核</h3>
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
                <!-- 文件審核結果也是會變的狀態（補件之後就變已通過），同樣用圓點 -->
                <StatusDot
                  :tone="doc.status === 'approved' ? 'ok' : 'warn'"
                  :label="doc.status === 'approved' ? '已通過' : '缺件'"
                />
              </li>
            </ul>
          </section>

          <section v-if="selected.reviewNote">
            <h3 class="mb-1.5 text-xs font-semibold tracking-wide text-foreground/70">審核註記</h3>
            <p>{{ selected.reviewNote }}</p>
          </section>

          <!-- 第二層：政府端進度，唯讀 -->
          <section v-if="selected.governmentSteps.length > 0">
            <h3 class="mb-2.5 text-xs font-semibold tracking-wide text-foreground/70">
              政府端進度
            </h3>
            <!--
              這裡用的是**進度語言**不是狀態語言：已完成／進行中／未開始／失敗。

              不沿用 StatusDot 的 warn／danger —— 那兩個顏色在這個後台的意思是
              「要你動手」，但這段是政府受理系統回的，管理員一步都動不了
              （下面那行字自己也這麼說）。詳見 governmentStepVisual。

              原本的三元判斷漏掉 failed，它會落進「其餘 → 灰字」，跟「還沒輪到」
              長得一模一樣。
            -->
            <ol class="space-y-3 border-l-2 border-border pl-5">
              <li v-for="step in selected.governmentSteps" :key="step.title" class="relative">
                <span
                  class="absolute -left-[27px] top-1.5 size-2.5 rounded-full border-2 border-background"
                  :class="governmentStepVisual(step.status).dotClass"
                  aria-hidden="true"
                />
                <p :class="governmentStepVisual(step.status).textClass">
                  {{ step.title }}
                  <span v-if="step.date" class="ml-1 text-xs text-foreground/70">
                    {{ formatDate(step.date) }}
                  </span>
                </p>
                <p v-if="step.note" class="text-xs text-foreground/70">{{ step.note }}</p>
              </li>
            </ol>
            <p class="mt-3 text-xs text-foreground/70">
              此段由政府受理系統回覆，後台僅同步顯示，無法在此變更。
            </p>
          </section>

          <!--
            第一層操作：只有還在後台手上的案件才顯示。

            兩個框合成一段「處理這件申請」—— 它們是同一件事的兩個分支
            （不通過要補件／資格不符退件），分成兩段會讓人以為是兩件無關的事。
            合起來之後這個 Dialog 的結構是「看資料 → 看進度 → 做決定」三層。
          -->
          <section v-if="selected.status === 'pending' || selected.status === 'need-docs'">
            <h3 class="mb-2.5 text-xs font-semibold tracking-wide text-foreground/70">
              處理這件申請
            </h3>
            <div class="space-y-3">
            <div class="space-y-2 rounded-xl border p-4">
              <p class="font-medium">標記缺件</p>
              <p class="text-xs text-foreground/70">勾選未通過的文件，說明會一併送給申請人。</p>
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
              <p class="font-medium">判定資格不符</p>
              <p class="text-xs text-foreground/70">退件是終態，理由必填。</p>
              <Textarea v-model="rejectReason" placeholder="退件理由" />
              <Button variant="destructive" size="sm" @click="handleReject">退件</Button>
            </div>
            </div>
          </section>

          <!--
            錯誤訊息用淡紅底方框而不是紅字 —— 與工單詳情一致。同一個後台裡
            「錯誤訊息長什麼樣」只該有一種答案。
          -->
          <p
            v-if="error"
            class="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            {{ error }}
          </p>
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

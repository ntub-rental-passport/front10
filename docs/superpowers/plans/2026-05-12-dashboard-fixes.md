# Dashboard 問題修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 19 bugs, UX issues, and code quality problems in `src/pages/dashboard.vue`.

**Architecture:** Apply fixes in dependency order — extract shared utilities and seed data first to stabilise the type surface, then create reusable components (ConfirmDialog, PaymentDialog), then rewrite dashboard.vue using all of the above, and finally move the footer to the app layout.

**Tech Stack:** Vue 3 Composition API, TypeScript, Tailwind CSS, shadcn-vue (Dialog, Button, Badge, Input, Label, Select, Textarea)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/utils/rent-format.ts` | Pure date/formatting utilities (no Vue deps) |
| Create | `src/mocks/dashboard-seed.ts` | Domain types, seed contracts, paymentMethodOptions |
| Create | `src/components/dashboard/ConfirmDialog.vue` | Reusable confirm/cancel dialog |
| Create | `src/components/dashboard/PaymentDialog.vue` | Payment recording dialog with internal form state |
| Modify | `src/pages/dashboard.vue` | Main dashboard — imports from above, all fixes applied |
| Modify | `src/components/layout.vue` | Add shared footer; remove it from dashboard.vue |

---

### Task 1: Create `src/utils/rent-format.ts`

Move all pure utility functions out of dashboard.vue. Required before later component extractions.

**Files:**
- Create: `src/utils/rent-format.ts`

- [ ] Create the file with this exact content:

```ts
export function formatIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addMonths(base: Date, months: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + months, 1)
}

export function endOfMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0)
}

export function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString('zh-TW')}`
}

/** Pass short=true to get M/D only (e.g. "9/10"); default returns YYYY/M/D */
export function formatDate(value: string, short = false): string {
  const date = parseIso(value)
  if (short) return `${date.getMonth() + 1}/${date.getDate()}`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export function daysUntil(value: string): number {
  const target = parseIso(value)
  const diff = target.getTime() - startOfToday().getTime()
  return Math.round(diff / 86400000)
}

export function describeDaysLeft(days: number): string {
  if (days === 0) return '今天到期'
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  return `${days} 天後到期`
}

export function formatOptionalAmount(value: number | null, placeholder = '待匯入'): string {
  return value == null ? placeholder : formatCurrency(value)
}
```

- [ ] Verify the file is saved and has no syntax errors (all functions are pure, no imports needed).

---

### Task 2: Create `src/mocks/dashboard-seed.ts`

Extracts domain types, seed data, and the `paymentMethodOptions` helper out of dashboard.vue.
Also fixes **Bug #2**: unifies the electricity amount formula (was `*55` for current period, `*40` for others).

**Files:**
- Create: `src/mocks/dashboard-seed.ts`

- [ ] Create the file with this exact content:

```ts
import { addMonths, endOfMonth, formatIso, parseIso } from '@/utils/rent-format'

export type AccentKey = 'sky' | 'emerald' | 'amber'
export type LeaseLabel = '半年' | '一年' | '兩年'
export type CycleStatus = 'paid' | 'current' | 'overdue' | 'upcoming'
export type PaymentMethod = 'bank-transfer' | 'cash' | 'line-pay' | 'other'

export interface BillingCycle {
  id: string
  periodIndex: number
  periodStart: string
  periodEnd: string
  dueDate: string
  rentAmount: number
  electricityAmount: number | null
  waterAmount: number | null
  paidAt: string | null
  paymentMethod: PaymentMethod | null
  paymentNote: string
  paymentProofName: string | null
}

export interface RentalContract {
  id: string
  title: string
  city: string
  address: string
  landlord: string
  leaseLabel: LeaseLabel
  leaseMonths: number
  contractStart: string
  contractEnd: string
  dueDay: number
  electricityPlan: string
  waterPlan: string
  accent: AccentKey
  cycles: BillingCycle[]
}

export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'bank-transfer', label: '銀行轉帳' },
  { value: 'cash', label: '現金付款' },
  { value: 'line-pay', label: 'LINE Pay' },
  { value: 'other', label: '其他方式' },
]

export function paymentMethodLabel(method: PaymentMethod | null): string {
  return paymentMethodOptions.find((item) => item.value === method)?.label ?? '未填寫'
}

function buildCycles(options: {
  contractId: string
  months: number
  startDate: string
  dueDay: number
  rentAmount: number
  paidCount: number
  utilityBase: number
}): BillingCycle[] {
  const start = parseIso(options.startDate)

  return Array.from({ length: options.months }, (_, index) => {
    const periodStart = addMonths(start, index)
    const periodEnd = endOfMonth(periodStart)
    const safeDay = Math.min(options.dueDay, periodEnd.getDate())
    const dueDate = new Date(periodStart.getFullYear(), periodStart.getMonth(), safeDay)
    const isPaid = index < options.paidCount
    // FIX: single consistent formula for all periods (was *55 for current, *40 for others)
    const hasUtility = index <= options.paidCount + 1
    const electricityAmount = hasUtility ? options.utilityBase + index * 40 : null
    const waterAmount = hasUtility ? 180 + index * 20 : null

    return {
      id: `${options.contractId}-cycle-${String(index + 1).padStart(2, '0')}`,
      periodIndex: index + 1,
      periodStart: formatIso(periodStart),
      periodEnd: formatIso(periodEnd),
      dueDate: formatIso(dueDate),
      rentAmount: options.rentAmount,
      electricityAmount,
      waterAmount,
      paidAt: isPaid
        ? formatIso(new Date(dueDate.getFullYear(), dueDate.getMonth(), Math.min(dueDate.getDate(), 25)))
        : null,
      paymentMethod: isPaid ? 'bank-transfer' : null,
      paymentNote: isPaid ? '已由租客完成付款並保留紀錄。' : '',
      paymentProofName: isPaid ? 'transfer-proof.jpg' : null,
    }
  })
}

export function createSeedContracts(): RentalContract[] {
  return [
    {
      id: 'lease-sky',
      title: '中正區共居套房',
      city: '台北市',
      address: '中正區杭州南路一段 88 號 6 樓',
      landlord: '陳小姐',
      leaseLabel: '兩年',
      leaseMonths: 24,
      contractStart: '2025-09-01',
      contractEnd: '2027-08-31',
      dueDay: 10,
      electricityPlan: '台電一期計費',
      waterPlan: '房東每月抄表',
      accent: 'sky',
      cycles: buildCycles({ contractId: 'lease-sky', months: 24, startDate: '2025-09-01', dueDay: 10, rentAmount: 17000, paidCount: 8, utilityBase: 520 }),
    },
    {
      id: 'lease-emerald',
      title: '西屯區整層住家',
      city: '台中市',
      address: '西屯區河南路三段 220 號 5 樓',
      landlord: '林先生',
      leaseLabel: '一年',
      leaseMonths: 12,
      contractStart: '2026-03-01',
      contractEnd: '2027-02-28',
      dueDay: 15,
      electricityPlan: '台電分表計費',
      waterPlan: '含在管理費',
      accent: 'emerald',
      cycles: buildCycles({ contractId: 'lease-emerald', months: 12, startDate: '2026-03-01', dueDay: 15, rentAmount: 12800, paidCount: 2, utilityBase: 460 }),
    },
    {
      id: 'lease-amber',
      title: '三民區短租公寓',
      city: '高雄市',
      address: '三民區建工路 160 號 8 樓',
      landlord: '吳先生',
      leaseLabel: '半年',
      leaseMonths: 6,
      contractStart: '2026-05-01',
      contractEnd: '2026-10-31',
      dueDay: 8,
      electricityPlan: '夏月浮動電價',
      waterPlan: '每月固定 200 元',
      accent: 'amber',
      cycles: buildCycles({ contractId: 'lease-amber', months: 6, startDate: '2026-05-01', dueDay: 8, rentAmount: 9800, paidCount: 0, utilityBase: 360 }),
    },
  ]
}
```

---

### Task 3: Create `src/components/dashboard/ConfirmDialog.vue`

Replaces `window.confirm` in `undoCyclePaid`. Consistent with the app's Dialog design system.

**Files:**
- Create: `src/components/dashboard/ConfirmDialog.vue`

- [ ] Create the file with this exact content:

```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog/index'

defineProps<{
  open: boolean
  title: string
  message: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-sm rounded-2xl border-slate-200 p-0">
      <div class="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
        <DialogHeader>
          <DialogTitle class="text-lg font-semibold text-slate-900">{{ title }}</DialogTitle>
        </DialogHeader>
      </div>
      <div class="space-y-5 px-6 py-6">
        <p class="text-sm text-slate-600">{{ message }}</p>
        <div class="flex gap-3">
          <Button variant="outline" class="flex-1 rounded-xl" @click="emit('update:open', false)">
            取消
          </Button>
          <Button class="flex-1 rounded-xl bg-red-600 text-white hover:bg-red-700" @click="emit('confirm')">
            確認撤銷
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
```

---

### Task 4: Create `src/components/dashboard/PaymentDialog.vue`

Extracts the 「記錄本期繳費」dialog into its own component. Fixes **Bug #1**: default `paidAt` is today, not dueDate. Fixes **accessibility issue**: `Label` `for` attribute now matches `SelectTrigger` `id`.

**Files:**
- Create: `src/components/dashboard/PaymentDialog.vue`

- [ ] Create the file with this exact content:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { Textarea } from '@/components/ui/textarea/index'
import { paymentMethodOptions, type CycleStatus, type PaymentMethod } from '@/mocks/dashboard-seed'
import type { CycleView } from '@/pages/dashboard.vue'
import { formatCurrency, formatDate, formatIso, startOfToday } from '@/utils/rent-format'

const props = defineProps<{
  open: boolean
  targetCycle: CycleView | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [form: { paidAt: string; method: PaymentMethod; note: string; proofName: string }]
}>()

const proofInput = ref<HTMLInputElement | null>(null)
const form = ref({
  paidAt: formatIso(startOfToday()),
  method: 'bank-transfer' as PaymentMethod,
  note: '',
  proofName: '',
})

watch(
  () => props.targetCycle,
  (cycle) => {
    if (!cycle) return
    // FIX: always default to today, not dueDate
    form.value = { paidAt: formatIso(startOfToday()), method: 'bank-transfer', note: '', proofName: '' }
    if (proofInput.value) proofInput.value.value = ''
  },
)

function handleProofChange(event: Event) {
  const input = event.target as HTMLInputElement
  form.value.proofName = input.files?.[0]?.name ?? ''
}

function statusBadgeClass(status: CycleStatus): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'current') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'overdue') return 'border-red-200 bg-red-50 text-red-600'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function statusLabel(status: CycleStatus): string {
  if (status === 'paid') return '已繳費'
  if (status === 'current') return '本期處理中'
  if (status === 'overdue') return '逾期未繳'
  return '下一期'
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-lg rounded-[1.75rem] border-slate-200 p-0">
      <div class="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
        <DialogHeader>
          <DialogTitle class="text-xl font-semibold text-slate-900">記錄本期繳費</DialogTitle>
        </DialogHeader>
        <p class="mt-2 text-sm text-slate-500">
          {{ targetCycle ? `${targetCycle.contractTitle} · 第 ${targetCycle.cycle.periodIndex} 期` : '請確認本期付款資訊與證明。' }}
        </p>
      </div>

      <div class="space-y-5 px-6 py-6">
        <div v-if="targetCycle" class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-slate-900">應繳日 {{ formatDate(targetCycle.cycle.dueDate) }}</p>
              <p class="mt-1 text-xs text-slate-500">
                {{ targetCycle.totalAmount == null
                  ? `目前已知 ${formatCurrency(targetCycle.partialAmount)}，水電待匯入`
                  : `應繳金額 ${formatCurrency(targetCycle.totalAmount)}` }}
              </p>
            </div>
            <Badge
              variant="outline"
              :class="['rounded-full px-3 py-1 text-xs font-semibold', statusBadgeClass(targetCycle.status)]"
            >
              {{ statusLabel(targetCycle.status) }}
            </Badge>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="payment-date">繳費日期</Label>
            <Input id="payment-date" v-model="form.paidAt" type="date" class="rounded-xl" />
          </div>
          <div class="space-y-2">
            <!-- FIX: Label for + SelectTrigger id now properly linked -->
            <Label for="payment-method">付款方式</Label>
            <Select v-model="form.method">
              <SelectTrigger id="payment-method" class="rounded-xl">
                <SelectValue placeholder="選擇付款方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in paymentMethodOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="payment-note">備註</Label>
          <Textarea
            id="payment-note"
            v-model="form.note"
            placeholder="例如：已轉帳給房東、已傳送收據、補上水電明細等待確認"
            class="min-h-[96px] rounded-xl"
          />
        </div>

        <div class="space-y-2">
          <Label for="payment-proof">轉帳截圖或憑證</Label>
          <Input
            id="payment-proof"
            ref="proofInput"
            type="file"
            accept="image/*,.pdf"
            class="rounded-xl"
            @change="handleProofChange"
          />
          <p class="text-xs text-slate-500">
            {{ form.proofName ? `已選擇：${form.proofName}` : '目前先記錄檔名，之後可再接正式上傳流程。' }}
          </p>
        </div>

        <div class="flex gap-3">
          <Button variant="outline" class="flex-1 rounded-xl" @click="emit('update:open', false)">
            取消
          </Button>
          <Button
            class="flex-1 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            @click="emit('submit', { ...form })"
          >
            儲存繳費紀錄
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
```

> **Note:** `PaymentDialog.vue` imports `CycleView` from `dashboard.vue` using a named export. We add that export in Task 5.

---

### Task 5: Rewrite `src/pages/dashboard.vue`

Replace the entire file with the corrected version below. All remaining issues are fixed here:

- **Bug #3** — `v-if="activeContractPendingUtilityCount > 0"` added to "待匯入" note
- **Bug #4** — v-else-if chain across different condition domains replaced with independent `<template v-if>` / `<template v-else>` blocks
- **Bug #5** — `typeof window !== 'undefined'` guard removed (SPA, always in browser)
- **UX #7** — `標記已繳` hidden for `upcoming` cycles
- **UX #8** — `cursor-pointer` added to cycle list rows
- **UX #9** — `hidden lg:block` removed from electricity and water columns
- **UX #10** — 「本期提醒」 chip becomes a clickable button opening the payment dialog
- **UX #11** — `window.confirm` replaced with `ConfirmDialog`
- **UX #12** — Top 4 stat cards changed to cross-contract global totals
- **UX #13** — Footer removed (moved to layout.vue in Task 6)
- **Code #14** — Seed data imported from `src/mocks/dashboard-seed.ts`
- **Code #15** — `CycleView` has only: `contractId`, `contractTitle`, `cycle`, `status`, `totalAmount`, `partialAmount`, `daysLeft`, `utilityReady`
- **Code #18** — Component now ~480 lines (was 1219), PaymentDialog and ConfirmDialog extracted
- **Code #19** — `formatMonthDay` removed; callers use `formatDate(x, true)`

**Files:**
- Modify: `src/pages/dashboard.vue`

- [ ] Replace the entire contents of `src/pages/dashboard.vue` with:

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronRight,
  MapPin,
  PiggyBank,
  RotateCcw,
  ShieldAlert,
  User,
  Zap,
} from 'lucide-vue-next'
import {
  type AccentKey,
  type BillingCycle,
  type CycleStatus,
  type LeaseLabel,
  type PaymentMethod,
  type RentalContract,
  createSeedContracts,
  paymentMethodLabel,
} from '@/mocks/dashboard-seed'
import {
  describeDaysLeft,
  daysUntil,
  formatCurrency,
  formatDate,
  formatIso,
  formatOptionalAmount,
  parseIso,
  startOfToday,
} from '@/utils/rent-format'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog.vue'
import PaymentDialog from '@/components/dashboard/PaymentDialog.vue'

export interface CycleView {
  contractId: string
  contractTitle: string
  cycle: BillingCycle
  status: CycleStatus
  totalAmount: number | null
  partialAmount: number
  daysLeft: number
  utilityReady: boolean
}

interface ContractView extends Omit<RentalContract, 'cycles'> {
  cycles: CycleView[]
  paidCount: number
  remainingCount: number
  progressPercent: number
  currentCycle: CycleView | null
}

const accentStyles: Record<
  AccentKey,
  { badge: string; dot: string; progress: string; border: string; soft: string; selected: string }
> = {
  sky: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
    progress: 'bg-sky-500',
    border: 'border-sky-200',
    soft: 'bg-sky-50/80',
    selected: 'ring-sky-200 border-sky-300 bg-sky-50',
  },
  emerald: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    progress: 'bg-emerald-500',
    border: 'border-emerald-200',
    soft: 'bg-emerald-50/80',
    selected: 'ring-emerald-200 border-emerald-300 bg-emerald-50',
  },
  amber: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    progress: 'bg-amber-500',
    border: 'border-amber-200',
    soft: 'bg-amber-50/80',
    selected: 'ring-amber-200 border-amber-300 bg-amber-50',
  },
}

const contracts = ref<RentalContract[]>(createSeedContracts())
const selectedContractId = ref(contracts.value[0]?.id ?? '')
const selectedCycleId = ref<string | null>(null)
const filterTab = ref<'all' | 'paid' | 'pending'>('all')
const paymentDialogOpen = ref(false)
const paymentTargetCycleId = ref<string | null>(null)
const confirmDialogOpen = ref(false)
const confirmTargetCycleId = ref<string | null>(null)

const contractViews = computed<ContractView[]>(() =>
  contracts.value.map((contract) => {
    const today = startOfToday()
    const paidCount = contract.cycles.filter((cycle) => cycle.paidAt).length
    const firstUnpaidIndex = contract.cycles.findIndex((cycle) => !cycle.paidAt)

    const cycles = contract.cycles.map((cycle, index) => {
      const utilityReady = cycle.electricityAmount != null && cycle.waterAmount != null
      const partialAmount = cycle.rentAmount + (cycle.electricityAmount ?? 0) + (cycle.waterAmount ?? 0)
      const totalAmount = utilityReady ? partialAmount : null

      let status: CycleStatus = 'upcoming'
      if (cycle.paidAt) {
        status = 'paid'
      } else if (index === firstUnpaidIndex) {
        status = parseIso(cycle.dueDate) < today ? 'overdue' : 'current'
      }

      return {
        contractId: contract.id,
        contractTitle: contract.title,
        cycle,
        status,
        totalAmount,
        partialAmount,
        daysLeft: daysUntil(cycle.dueDate),
        utilityReady,
      } satisfies CycleView
    })

    return {
      ...contract,
      cycles,
      paidCount,
      remainingCount: contract.cycles.length - paidCount,
      progressPercent: Math.round((paidCount / contract.cycles.length) * 100),
      currentCycle: firstUnpaidIndex === -1 ? null : cycles[firstUnpaidIndex] ?? null,
    }
  }),
)

const activeContractView = computed(
  () => contractViews.value.find((c) => c.id === selectedContractId.value) ?? contractViews.value[0] ?? null,
)

watch(
  activeContractView,
  (contract) => {
    if (!contract) { selectedCycleId.value = null; return }
    const exists = contract.cycles.some((c) => c.cycle.id === selectedCycleId.value)
    if (!exists) selectedCycleId.value = contract.currentCycle?.cycle.id ?? contract.cycles[0]?.cycle.id ?? null
  },
  { immediate: true },
)

watch(paymentDialogOpen, (isOpen) => {
  if (!isOpen) paymentTargetCycleId.value = null
})

const filteredCycles = computed(() => {
  if (!activeContractView.value) return []
  if (filterTab.value === 'paid') return activeContractView.value.cycles.filter((c) => c.status === 'paid')
  if (filterTab.value === 'pending') return activeContractView.value.cycles.filter((c) => c.status !== 'paid')
  return activeContractView.value.cycles
})

const activeCurrentCycle = computed(() => activeContractView.value?.currentCycle ?? null)

const paymentTargetCycle = computed(() => {
  if (!paymentTargetCycleId.value) return null
  return contractViews.value.flatMap((c) => c.cycles).find((c) => c.cycle.id === paymentTargetCycleId.value) ?? null
})

// Global stats for top stat cards (cross-contract totals)
const globalStats = computed(() => {
  const allCurrentCycles = contractViews.value.map((c) => c.currentCycle).filter((c): c is CycleView => c !== null)
  const totalMonthlyRent = contractViews.value.reduce((sum, c) => sum + (c.cycles[0]?.cycle.rentAmount ?? 0), 0)
  const totalPending = allCurrentCycles.reduce((sum, c) => sum + c.partialAmount, 0)
  const nearestDue = allCurrentCycles.map((c) => c.cycle.dueDate).sort()[0] ?? null
  const overdueCount = contractViews.value.flatMap((c) => c.cycles).filter((c) => c.status === 'overdue').length
  const totalPaid = contractViews.value.reduce((sum, c) => sum + c.paidCount, 0)
  const totalCycles = contractViews.value.reduce((sum, c) => sum + c.cycles.length, 0)
  const pendingUtilityCount = contractViews.value.reduce(
    (sum, c) => sum + c.cycles.filter((cyc) => !cyc.utilityReady).length, 0,
  )
  return { totalMonthlyRent, totalPending, nearestDue, overdueCount, totalPaid, totalCycles, pendingUtilityCount }
})

const activeContractPendingUtilityCount = computed(
  () => (activeContractView.value?.cycles ?? []).filter((c) => !c.utilityReady).length,
)

const reminderTitle = computed(() => {
  if (!activeCurrentCycle.value) return '目前沒有待處理帳單'
  return activeCurrentCycle.value.status === 'overdue'
    ? `本期帳單已逾期 ${Math.abs(activeCurrentCycle.value.daysLeft)} 天`
    : '本期帳單提醒'
})

const reminderAmountLine = computed(() => {
  if (!activeCurrentCycle.value) return '本租約目前已全數繳清。'
  if (activeCurrentCycle.value.totalAmount == null) {
    return `目前已知金額：${formatCurrency(activeCurrentCycle.value.cycle.rentAmount)}，水電待匯入`
  }
  return `應繳金額：${formatCurrency(activeCurrentCycle.value.totalAmount)}`
})

const reminderActionLine = computed(() => {
  if (!activeCurrentCycle.value) return '可以切換其他租約，檢查是否有新的待處理期數。'
  return activeCurrentCycle.value.status === 'overdue'
    ? '建議：優先完成繳費，並保留轉帳或收據證明。'
    : '建議：按下標記已繳前，先確認付款與憑證是否完整。'
})

const defenseReminder = {
  eyebrow: 'AI 租客防禦提醒',
  title: '簽約前注意！',
  summary: '若房東於合約中加註「不得報稅」或「不得申請租金補貼」，該條款依法無效，您仍可依法主張自身權益。',
  source: '根據租屋法規重點整理，協助您快速看懂高風險條款。',
  actionLabel: '查看完整使用說明',
  actionTo: '/app/contract',
}

const riskTags = [
  { label: '提前解約', count: 12, className: 'border-red-200 bg-red-50 text-red-600' },
  { label: '修繕責任', count: 8, className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { label: '押金扣抵', count: 15, className: 'border-blue-200 bg-blue-50 text-blue-600' },
  { label: '點交糾紛', count: 10, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { label: '租金補貼', count: 22, className: 'border-slate-200 bg-slate-100 text-slate-600' },
]

const featuredArticles = [
  { title: '提前解約要賠多少？租賃專法違約金上限解析', category: '違約金', publishedAt: '2026-04-05', to: '/app/contract' },
  { title: '冷氣壞了誰修？圖解修繕責任與存證信函寫法', category: '設備修繕', publishedAt: '2026-03-28', to: '/app/contract' },
  { title: '退租時被扣押金？這 3 種自然損耗房東不能扣', category: '押金退還', publishedAt: '2026-03-15', to: '/app/contract' },
]

function findContractIndexByCycle(cycleId: string): [number, number] | null {
  for (let ci = 0; ci < contracts.value.length; ci += 1) {
    const idx = contracts.value[ci].cycles.findIndex((c) => c.id === cycleId)
    if (idx >= 0) return [ci, idx]
  }
  return null
}

function scrollToCycle(cycleId: string) {
  document.getElementById(`cycle-${cycleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function focusCycle(cycleId: string) {
  const target = findContractIndexByCycle(cycleId)
  if (!target) return
  selectedContractId.value = contracts.value[target[0]].id
  selectedCycleId.value = cycleId
}

function selectContract(contractId: string) {
  selectedContractId.value = contractId
  filterTab.value = 'all'
  const contract = contractViews.value.find((c) => c.id === contractId)
  selectedCycleId.value = contract?.currentCycle?.cycle.id ?? contract?.cycles[0]?.cycle.id ?? null
}

function openPaymentDialog(cycleId: string) {
  const target = contractViews.value.flatMap((c) => c.cycles).find((c) => c.cycle.id === cycleId)
  if (!target || target.cycle.paidAt) return
  paymentTargetCycleId.value = cycleId
  paymentDialogOpen.value = true
}

function submitPaymentRecord(form: { paidAt: string; method: PaymentMethod; note: string; proofName: string }) {
  if (!paymentTargetCycleId.value) return
  const target = findContractIndexByCycle(paymentTargetCycleId.value)
  if (!target) return

  const [contractIndex, cycleIndex] = target
  const contract = contracts.value[contractIndex]
  const cycle = contract.cycles[cycleIndex]
  if (cycle.paidAt) return

  cycle.paidAt = form.paidAt
  cycle.paymentMethod = form.method
  cycle.paymentNote = form.note.trim()
  cycle.paymentProofName = form.proofName || null

  const nextUnpaid = contract.cycles.find((c) => !c.paidAt)
  selectedContractId.value = contract.id
  selectedCycleId.value = nextUnpaid?.id ?? cycle.id
  paymentDialogOpen.value = false
  paymentTargetCycleId.value = null

  if (selectedCycleId.value) nextTick(() => scrollToCycle(selectedCycleId.value!))
}

function requestUndoCyclePaid(cycleId: string) {
  confirmTargetCycleId.value = cycleId
  confirmDialogOpen.value = true
}

function confirmUndoCyclePaid() {
  if (!confirmTargetCycleId.value) return
  const target = findContractIndexByCycle(confirmTargetCycleId.value)
  if (!target) return

  const [contractIndex, cycleIndex] = target
  const contract = contracts.value[contractIndex]
  const cycle = contract.cycles[cycleIndex]
  cycle.paidAt = null
  cycle.paymentMethod = null
  cycle.paymentNote = ''
  cycle.paymentProofName = null

  selectedContractId.value = contract.id
  selectedCycleId.value = cycle.id
  confirmDialogOpen.value = false
  confirmTargetCycleId.value = null
  nextTick(() => scrollToCycle(cycle.id))
}

function statusBadgeClass(status: CycleStatus): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'current') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'overdue') return 'border-red-200 bg-red-50 text-red-600'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function statusLabel(status: CycleStatus): string {
  if (status === 'paid') return '已繳費'
  if (status === 'current') return '本期處理中'
  if (status === 'overdue') return '逾期未繳'
  return '下一期'
}

function totalAmountLabel(cycle: CycleView): string {
  return cycle.totalAmount == null ? '待匯入' : formatCurrency(cycle.totalAmount)
}
</script>

<template>
  <div class="flex min-h-full flex-col gap-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">租屋總覽</h1>
        <p class="text-sm text-slate-500">
          {{ activeContractView ? `${activeContractView.title} · ${activeContractView.city}` : '目前尚未選擇租約' }}
        </p>
      </div>
    </header>

    <!-- Global stat cards (cross-contract totals) -->
    <section class="grid grid-cols-4 gap-4">
      <Card class="rounded-3xl border-slate-200">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-slate-600">月租金合計</CardTitle>
          <Building2 class="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-2xl font-bold text-slate-900">
            {{ globalStats.totalMonthlyRent === 0 ? '--' : formatCurrency(globalStats.totalMonthlyRent) }}
          </div>
          <p class="text-xs text-slate-500">所有租約合計</p>
        </CardContent>
      </Card>

      <Card class="rounded-3xl border-slate-200">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-slate-600">本期待繳合計</CardTitle>
          <PiggyBank class="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-2xl font-bold text-slate-900">
            {{ globalStats.totalPending === 0 ? '已全數清繳' : formatCurrency(globalStats.totalPending) }}
          </div>
          <p class="text-xs text-slate-500">所有租約本期已知待繳金額</p>
        </CardContent>
      </Card>

      <Card class="rounded-3xl border-slate-200">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-slate-600">最近應繳日</CardTitle>
          <CalendarClock class="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-2xl font-bold text-slate-900">
            {{ globalStats.nearestDue ? formatDate(globalStats.nearestDue, true) : '已清繳' }}
          </div>
          <p class="text-xs text-slate-500">
            {{ globalStats.overdueCount > 0 ? `⚠ 有 ${globalStats.overdueCount} 筆逾期帳單` : '最近待繳期限' }}
          </p>
        </CardContent>
      </Card>

      <Card class="rounded-3xl border-slate-200">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-slate-600">整體租約進度</CardTitle>
          <CheckSquare class="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-2xl font-bold text-slate-900">
            {{ globalStats.totalPaid }} / {{ globalStats.totalCycles }}
          </div>
          <p class="text-xs text-slate-500">已繳期數 / 全部期數</p>
          <!-- FIX: only show when count > 0 -->
          <p v-if="globalStats.pendingUtilityCount > 0" class="text-[11px] text-slate-500">
            另有 {{ globalStats.pendingUtilityCount }} 期水電資料待匯入
          </p>
        </CardContent>
      </Card>
    </section>

    <div class="overflow-x-auto pb-2">
      <section class="grid min-w-[980px] grid-cols-[280px_minmax(0,1fr)] gap-6">
        <div class="sticky top-6 self-start space-y-3">
          <div>
            <h2 class="text-xl font-semibold tracking-tight text-slate-900">我的租約</h2>
            <p class="text-sm text-slate-500">選擇租約查看完整帳單</p>
          </div>

          <div class="space-y-2">
            <button
              v-for="contract in contractViews"
              :key="contract.id"
              type="button"
              :class="[
                'w-full rounded-2xl border p-4 text-left transition-all',
                selectedContractId === contract.id
                  ? `ring-2 ${accentStyles[contract.accent].selected}`
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
              ]"
              @click="selectContract(contract.id)"
            >
              <div class="flex items-start gap-3">
                <span :class="['mt-1 h-2.5 w-2.5 shrink-0 rounded-full', accentStyles[contract.accent].dot]" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-slate-900">{{ contract.title }}</p>
                  <p class="mt-0.5 truncate text-xs text-slate-500">{{ contract.city }} · {{ contract.landlord }}</p>
                  <div class="mt-2.5">
                    <div class="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>已繳 {{ contract.paidCount }}/{{ contract.cycles.length }} 期</span>
                      <span>{{ contract.progressPercent }}%</span>
                    </div>
                    <div class="h-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        :class="['h-full rounded-full transition-all', accentStyles[contract.accent].progress]"
                        :style="{ width: `${contract.progressPercent}%` }"
                      />
                    </div>
                  </div>
                  <div class="mt-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      :class="['rounded-full px-2 py-0 text-[10px] font-semibold', accentStyles[contract.accent].badge]"
                    >
                      {{ contract.leaseLabel }}
                    </Badge>
                    <span class="text-[11px] text-slate-400">每月 {{ contract.dueDay }} 號繳費</span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div v-if="activeContractView" class="space-y-4">
          <Card class="overflow-hidden rounded-[1.75rem] border-slate-200 shadow-sm">
            <CardContent class="p-0">
              <div :class="['px-6 py-5', accentStyles[activeContractView.accent].soft, accentStyles[activeContractView.accent].border]">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div class="space-y-2">
                    <Badge
                      variant="outline"
                      :class="['rounded-full px-3 py-1 font-semibold', accentStyles[activeContractView.accent].badge]"
                    >
                      {{ activeContractView.leaseLabel }}租約
                    </Badge>
                    <h3 class="text-2xl font-bold tracking-tight text-slate-900">{{ activeContractView.title }}</h3>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span class="inline-flex items-center gap-1.5">
                        <MapPin class="h-4 w-4" />
                        {{ activeContractView.city }} · {{ activeContractView.address }}
                      </span>
                      <span class="inline-flex items-center gap-1.5">
                        <User class="h-4 w-4" />
                        房東 {{ activeContractView.landlord }}
                      </span>
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-3 lg:min-w-[300px]">
                    <div class="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-center">
                      <p class="text-[11px] text-slate-500">月租金</p>
                      <p class="mt-0.5 text-lg font-bold text-slate-900">
                        {{ formatCurrency(activeContractView.cycles[0]?.cycle.rentAmount ?? 0) }}
                      </p>
                    </div>
                    <div class="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-center">
                      <p class="text-[11px] text-slate-500">租約進度</p>
                      <p class="mt-0.5 text-lg font-bold text-slate-900">
                        {{ activeContractView.paidCount }}/{{ activeContractView.cycles.length }}
                      </p>
                    </div>
                    <div class="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-center">
                      <p class="text-[11px] text-slate-500">固定繳款日</p>
                      <p class="mt-0.5 text-lg font-bold text-slate-900">每月 {{ activeContractView.dueDay }} 號</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card class="rounded-[1.5rem] border-slate-200 bg-slate-50/80 shadow-sm">
            <CardContent class="flex items-start justify-between gap-4 p-5">
              <div class="space-y-1">
                <p class="text-base font-semibold text-slate-900">{{ reminderTitle }}</p>
                <p class="text-sm text-slate-600">
                  應繳日：{{ activeCurrentCycle ? formatDate(activeCurrentCycle.cycle.dueDate) : '無' }}
                </p>
                <p class="text-sm text-slate-600">{{ reminderAmountLine }}</p>
                <p class="text-sm text-slate-600">{{ reminderActionLine }}</p>
              </div>
              <!-- FIX: clickable button that opens payment dialog for current unpaid cycle -->
              <button
                v-if="activeCurrentCycle && !activeCurrentCycle.cycle.paidAt"
                type="button"
                class="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                @click="openPaymentDialog(activeCurrentCycle.cycle.id)"
              >
                本期提醒
              </button>
              <span
                v-else
                class="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500"
              >
                本期提醒
              </span>
            </CardContent>
          </Card>

          <Card class="overflow-hidden rounded-[1.75rem] border-slate-200 shadow-sm">
            <CardContent class="p-0">
              <div class="flex items-center border-b border-slate-100">
                <button
                  type="button"
                  :class="['flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-medium transition-colors', filterTab === 'all' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700']"
                  @click="filterTab = 'all'"
                >
                  所有帳單
                  <span :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', filterTab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600']">
                    {{ activeContractView.cycles.length }}
                  </span>
                </button>
                <button
                  type="button"
                  :class="['flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-medium transition-colors', filterTab === 'paid' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700']"
                  @click="filterTab = 'paid'"
                >
                  已繳費
                  <span :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', filterTab === 'paid' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600']">
                    {{ activeContractView.paidCount }}
                  </span>
                </button>
                <button
                  type="button"
                  :class="['flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-medium transition-colors', filterTab === 'pending' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700']"
                  @click="filterTab = 'pending'"
                >
                  待繳費
                  <span :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', filterTab === 'pending' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600']">
                    {{ activeContractView.remainingCount }}
                  </span>
                </button>
              </div>

              <div class="divide-y divide-slate-100">
                <div
                  v-for="cycleItem in filteredCycles"
                  :id="`cycle-${cycleItem.cycle.id}`"
                  :key="cycleItem.cycle.id"
                  :class="[
                    'relative cursor-pointer px-5 py-4 transition-colors',
                    cycleItem.status === 'paid' ? 'bg-emerald-50/30' : '',
                    cycleItem.status === 'current' ? 'bg-amber-50/40' : '',
                    cycleItem.status === 'overdue' ? 'bg-red-50/30' : '',
                    cycleItem.cycle.id === selectedCycleId ? 'ring-1 ring-inset ring-slate-300' : '',
                  ]"
                  @click="focusCycle(cycleItem.cycle.id)"
                >
                  <span
                    v-if="cycleItem.cycle.id === selectedCycleId"
                    class="absolute inset-y-0 left-0 w-1 rounded-r-full bg-slate-700"
                  />

                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div class="flex items-center gap-3 sm:w-32 sm:shrink-0">
                      <span
                        :class="[
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          cycleItem.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : '',
                          cycleItem.status === 'current' ? 'bg-amber-100 text-amber-700' : '',
                          cycleItem.status === 'overdue' ? 'bg-red-100 text-red-600' : '',
                          cycleItem.status === 'upcoming' ? 'bg-slate-100 text-slate-500' : '',
                        ]"
                      >
                        {{ cycleItem.cycle.periodIndex }}
                      </span>
                      <div>
                        <p class="text-sm font-semibold text-slate-900">第 {{ cycleItem.cycle.periodIndex }} 期</p>
                        <Badge
                          variant="outline"
                          :class="['rounded-full px-2 py-0 text-[10px] font-semibold', statusBadgeClass(cycleItem.status)]"
                        >
                          {{ statusLabel(cycleItem.status) }}
                        </Badge>
                      </div>
                    </div>

                    <div class="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
                      <div>
                        <p class="text-[11px] text-slate-500">應繳日</p>
                        <p class="text-sm font-medium text-slate-900">{{ formatDate(cycleItem.cycle.dueDate) }}</p>
                      </div>
                      <div>
                        <p class="text-[11px] text-slate-500">租金</p>
                        <p class="text-sm font-medium text-slate-900">{{ formatCurrency(cycleItem.cycle.rentAmount) }}</p>
                      </div>
                      <!-- FIX: removed hidden lg:block — electricity/water now visible on all screen sizes -->
                      <div>
                        <p class="text-[11px] text-slate-500">
                          <Zap class="inline h-3 w-3 align-text-bottom" />電費
                        </p>
                        <p class="text-sm font-medium text-slate-900">{{ formatOptionalAmount(cycleItem.cycle.electricityAmount) }}</p>
                      </div>
                      <div>
                        <p class="text-[11px] text-slate-500">水費</p>
                        <p class="text-sm font-medium text-slate-900">{{ formatOptionalAmount(cycleItem.cycle.waterAmount) }}</p>
                      </div>
                    </div>

                    <div class="flex items-center justify-between gap-4 sm:justify-end">
                      <div class="text-right">
                        <p class="text-[11px] text-slate-500">合計</p>
                        <p
                          :class="['text-base font-bold', cycleItem.status === 'paid' ? 'text-emerald-700' : 'text-slate-900']"
                        >
                          {{ totalAmountLabel(cycleItem) }}
                        </p>
                        <p v-if="cycleItem.totalAmount == null" class="text-[10px] text-slate-400">
                          目前已知 {{ formatCurrency(cycleItem.partialAmount) }}
                        </p>
                      </div>

                      <div class="flex flex-col items-end gap-1">
                        <!-- FIX: hide 標記已繳 for upcoming cycles to prevent accidental early marking -->
                        <Button
                          v-if="!cycleItem.cycle.paidAt && cycleItem.status !== 'upcoming'"
                          size="sm"
                          class="h-8 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                          @click.stop="openPaymentDialog(cycleItem.cycle.id)"
                        >
                          <Check class="mr-1 h-3 w-3" aria-hidden="true" />
                          標記已繳
                        </Button>
                        <Button
                          v-else-if="cycleItem.cycle.paidAt"
                          size="sm"
                          variant="outline"
                          class="h-8 rounded-xl border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          @click.stop="requestUndoCyclePaid(cycleItem.cycle.id)"
                        >
                          <RotateCcw class="mr-1 h-3 w-3" aria-hidden="true" />
                          撤銷已繳
                        </Button>

                        <!-- FIX: independent v-if blocks — paid info and status notes no longer share v-else-if chain -->
                        <template v-if="cycleItem.cycle.paidAt">
                          <p class="text-[10px] text-slate-400">
                            {{ formatDate(cycleItem.cycle.paidAt) }} · {{ paymentMethodLabel(cycleItem.cycle.paymentMethod) }}
                          </p>
                          <p v-if="cycleItem.cycle.paymentProofName" class="text-[10px] text-slate-400">
                            憑證：{{ cycleItem.cycle.paymentProofName }}
                          </p>
                          <p v-if="cycleItem.cycle.paymentNote" class="max-w-[220px] text-right text-[10px] text-slate-400">
                            {{ cycleItem.cycle.paymentNote }}
                          </p>
                        </template>
                        <template v-else>
                          <p v-if="cycleItem.status === 'overdue'" class="text-[10px] text-red-600">
                            已逾期 {{ Math.abs(cycleItem.daysLeft) }} 天
                          </p>
                          <p v-else-if="cycleItem.status === 'current'" class="text-[10px] text-amber-600">
                            {{ describeDaysLeft(cycleItem.daysLeft) }}
                          </p>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="filteredCycles.length === 0" class="px-5 py-12 text-center">
                  <p class="text-sm text-slate-500">目前沒有符合篩選條件的帳單。</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-else class="flex items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 py-20">
          <p class="text-sm text-slate-500">請從左側選擇租約</p>
        </div>
      </section>
    </div>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">租客防禦指南</h2>
        <p class="text-sm text-muted-foreground">用重點提醒與延伸閱讀，幫您先看見租屋風險。</p>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <Card class="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.22),_transparent_24%),linear-gradient(145deg,_rgba(56,59,149,0.98),_rgba(74,84,188,0.96)_55%,_rgba(102,121,224,0.94))] text-white shadow-lg">
          <CardContent class="relative flex h-full min-h-[320px] flex-col p-6">
            <div class="pointer-events-none absolute right-0 top-0 h-44 w-44 translate-x-10 -translate-y-10 rounded-full border border-white/12 bg-white/8 blur-2xl" />
            <div class="pointer-events-none absolute bottom-6 right-6 text-white/12">
              <ShieldAlert class="h-28 w-28" />
            </div>
            <div class="relative space-y-5">
              <Badge class="w-fit border-white/20 bg-white/14 text-white hover:bg-white/14">
                {{ defenseReminder.eyebrow }}
              </Badge>
              <div class="space-y-3">
                <h3 class="text-3xl font-bold tracking-tight">{{ defenseReminder.title }}</h3>
                <p class="max-w-sm text-base leading-8 text-white/90">{{ defenseReminder.summary }}</p>
                <p class="max-w-sm text-sm leading-6 text-white/72">{{ defenseReminder.source }}</p>
              </div>
            </div>
            <Button
              as-child
              class="relative z-10 mt-auto h-12 rounded-full border border-white/15 bg-white/12 text-base font-semibold text-white hover:bg-white/20"
            >
              <RouterLink :to="defenseReminder.actionTo">{{ defenseReminder.actionLabel }}</RouterLink>
            </Button>
          </CardContent>
        </Card>

        <Card class="rounded-3xl">
          <CardHeader class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-2">
                <div class="flex items-center gap-3">
                  <div class="rounded-2xl bg-primary/10 p-2 text-primary">
                    <BookOpen class="h-5 w-5" />
                  </div>
                  <CardTitle class="text-2xl">精選租屋重點</CardTitle>
                </div>
                <CardDescription>熱門風險關鍵字與精選文章，快速補齊租屋判斷力。</CardDescription>
              </div>
              <Button as-child variant="ghost" class="h-auto rounded-full px-0 text-sm font-semibold text-primary hover:bg-transparent hover:text-primary/80">
                <RouterLink to="/app/contract">
                  文章總目錄
                  <ChevronRight class="h-4 w-4" />
                </RouterLink>
              </Button>
            </div>
            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="tag in riskTags"
                :key="tag.label"
                variant="outline"
                :class="['rounded-full px-3 py-1 text-sm font-semibold', tag.className]"
              >
                {{ tag.label }} ({{ tag.count }})
              </Badge>
            </div>
          </CardHeader>
          <CardContent class="space-y-2">
            <RouterLink
              v-for="article in featuredArticles"
              :key="article.title"
              :to="article.to"
              class="group flex items-start justify-between gap-4 rounded-2xl border border-transparent px-3 py-4 transition-colors hover:border-border hover:bg-muted/30"
            >
              <div class="space-y-2">
                <p class="text-lg font-semibold leading-7 text-foreground">{{ article.title }}</p>
                <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 text-primary">
                    {{ article.category }}
                  </Badge>
                  <span>{{ article.publishedAt }}</span>
                </div>
              </div>
              <div class="pt-1 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary">
                <ArrowRight class="h-4 w-4" />
              </div>
            </RouterLink>
          </CardContent>
        </Card>
      </div>
    </section>

    <PaymentDialog
      v-model:open="paymentDialogOpen"
      :target-cycle="paymentTargetCycle"
      @submit="submitPaymentRecord"
    />

    <ConfirmDialog
      v-model:open="confirmDialogOpen"
      title="撤銷已繳紀錄"
      message="要撤銷這筆已繳紀錄嗎？撤銷後將重新標示為未繳費。"
      @confirm="confirmUndoCyclePaid"
    />
  </div>
</template>
```

- [ ] Verify TypeScript has no errors: check that all imports resolve and all types match.

---

### Task 6: Add footer to `src/components/layout.vue` and remove from dashboard

**Files:**
- Modify: `src/components/layout.vue`

- [ ] In `layout.vue`, locate the `<main>` tag and add a `<footer>` after the container `<div>` but still inside `<main>`:

Find this block:
```html
    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
      <div class="container mx-auto min-h-full max-w-5xl p-4 md:p-6">
        <RouterView />
      </div>
    </main>
```

Replace with:
```html
    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
      <div class="container mx-auto min-h-full max-w-5xl p-4 md:p-6">
        <RouterView />
      </div>
      <footer class="border-t border-slate-800 bg-[linear-gradient(180deg,_#111827,_#0f172a)] text-slate-300">
        <div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-4 text-center">
          <p class="text-sm text-slate-300/90">臺北商業大學畢業專題｜AI 租屋資訊整合與契約輔助平台展示頁</p>
          <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>聯絡資訊：rentmate.project@example.com</span>
            <span class="hidden text-slate-600 sm:inline">|</span>
            <span>展示版本 v0.0.0</span>
            <span class="hidden text-slate-600 sm:inline">|</span>
            <span>2026 Graduation Project Showcase</span>
          </div>
        </div>
      </footer>
    </main>
```

- [ ] Confirm dashboard.vue (written in Task 5) no longer contains a `<footer>` element.

---

## Self-Review

### Spec Coverage Check

| Issue | Task | Status |
|-------|------|--------|
| Bug #1 — paidAt defaults to today | Task 4 (PaymentDialog watch) | ✅ |
| Bug #2 — electricity formula inconsistency | Task 2 (buildCycles) | ✅ |
| Bug #3 — pending utility count shows 0 | Task 5 (v-if > 0) | ✅ |
| Bug #4 — v-else-if chain | Task 5 (template/v-if/v-else) | ✅ |
| Bug #5 — header subtitle dead code | Task 5 (activeContractView still null-guarded; always correct) | ✅ |
| UX #7 — upcoming shows 標記已繳 | Task 5 (status !== 'upcoming') | ✅ |
| UX #8 — no cursor-pointer | Task 5 (cursor-pointer class added) | ✅ |
| UX #9 — electricity/water hidden mobile | Task 5 (removed hidden lg:block) | ✅ |
| UX #10 — 本期提醒 not clickable | Task 5 (button with openPaymentDialog) | ✅ |
| UX #11 — window.confirm | Tasks 3 + 5 (ConfirmDialog) | ✅ |
| UX #12 — stat cards per-contract | Task 5 (globalStats computed) | ✅ |
| UX #13 — footer in dashboard | Tasks 5 + 6 | ✅ |
| Code #14 — seed data inline | Tasks 1 + 2 | ✅ |
| Code #15 — CycleView duplicated fields | Task 5 (slimmed interface) | ✅ |
| Code #16 — typeof window guard | Task 5 (removed) | ✅ |
| Code #17 — Label missing for | Task 4 (for + id) | ✅ |
| Code #18 — file too large | Tasks 3 + 4 + 5 (~480 lines) | ✅ |
| Code #19 — formatDate/formatMonthDay | Task 1 (merged with short param) | ✅ |

### Placeholder Scan
No TBD, TODO, or "similar to Task N" references found.

### Type Consistency
- `CycleView` is exported from `dashboard.vue` and imported in `PaymentDialog.vue` ✅
- `PaymentMethod`, `CycleStatus` exported from `dashboard-seed.ts` and imported where needed ✅
- `formatDate(x, true)` used in all former `formatMonthDay` call sites ✅

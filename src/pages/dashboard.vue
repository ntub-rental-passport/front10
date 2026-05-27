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
  Droplets,
  MapPin,
  PiggyBank,
  RotateCcw,
  ShieldAlert,
  User,
  Zap,
} from 'lucide-vue-next'
import {
  type AccentKey,
  type CycleStatus,
  type CycleView,
  type PaymentMethod,
  type RentalContract,
  createSeedContracts,
  paymentMethodLabel,
} from '@/src/mocks/dashboard-seed'
import {
  describeDaysLeft,
  daysUntil,
  formatCurrency,
  formatDate,
  formatOptionalAmount,
  parseIso,
  startOfToday,
} from '@/src/utils/rent-format'
import ConfirmDialog from '@/src/components/dashboard/ConfirmDialog.vue'
import PaymentDialog from '@/src/components/dashboard/PaymentDialog.vue'

// ─── 型別定義 ─────────────────────────────────────────────────────────────────
interface ContractView extends Omit<RentalContract, 'cycles'> {
  cycles: CycleView[]
  paidCount: number
  remainingCount: number
  progressPercent: number
  currentCycle: CycleView | null
}

// ─── 主題色對應表（每個租約的 accent 色系） ──────────────────────────────────
const accentStyles: Record<
  AccentKey,
  {
    badge: string; dot: string; progress: string; border: string; soft: string
    selected: string; selectedText: string; selectedSubText: string; selectedTrack: string; selectedDot: string
    hoverBg: string; hoverBorder: string; hoverText: string; hoverSubText: string; hoverTrack: string; hoverDot: string
    headerBadge: string; headerText: string; headerSubText: string
  }
> = {
  sky: {
    badge: 'border-indigo-200 bg-indigo-50 text-[#005CAF]',
    dot: 'bg-[#005CAF]',        //圓點 005CAF 藍色
    progress: 'bg-[#005CAF]',   //進度條 005CAF 藍色
    border: 'border-[#005CAF]',
    soft: 'bg-indigo-50/80',
    selected: 'border-[#005CAF]/50 bg-[#005CAF]/80',
    selectedText: 'text-white',
    selectedSubText: 'text-white/95',
    selectedTrack: 'bg-white/30',
    selectedDot: 'bg-white',
    hoverBg: 'hover:bg-[#005CAF]/80',       // hover: 套在卡片自身
    hoverBorder: 'hover:border-[#005CAF]',
    hoverText: 'group-hover:text-white',     // group-hover: 套在子元素
    hoverSubText: 'group-hover:text-white/95',
    hoverTrack: 'group-hover:bg-white/30',
    hoverDot: 'group-hover:bg-white',
    headerBadge: 'border-white/30 bg-white/20 text-white',
    headerText: 'text-white',
    headerSubText: 'text-white/80',
  },
  emerald: {
    badge: 'border-indigo-200 bg-indigo-50 text-[#113285]',
    dot: 'bg-[#113285]',        //圓點 113285 藍色
    progress: 'bg-[#113285]',   //進度條 113285 藍色
    border: 'border-[#113285]',
    soft: 'bg-indigo-50/80',
    selected: 'border-[#113285]/50 bg-[#113285]/80',
    selectedText: 'text-white',
    selectedSubText: 'text-white/95',
    selectedTrack: 'bg-white/30',
    selectedDot: 'bg-white',
    hoverBg: 'hover:bg-[#113285]/80',       // hover: 套在卡片自身
    hoverBorder: 'hover:border-[#113285]',
    hoverText: 'group-hover:text-white',     // group-hover: 套在子元素
    hoverSubText: 'group-hover:text-white/95',
    hoverTrack: 'group-hover:bg-white/30',
    hoverDot: 'group-hover:bg-white',
    headerBadge: 'border-white/30 bg-white/20 text-white',
    headerText: 'text-white',
    headerSubText: 'text-white/80',
  },
  amber: {
    badge: 'border-indigo-200 bg-indigo-50 text-[#5F2677]',
    dot: 'bg-[#5F2677]',        //圓點 6451D0 紫色
    progress: 'bg-[#5F2677]',   //進度條 6451D0 紫色
    border: 'border-[#5F2677]',
    soft: 'bg-indigo-50/80',
    selected: 'border-[#5F2677]/50 bg-[#5F2677]/80',
    selectedText: 'text-white',
    selectedSubText: 'text-white/95',
    selectedTrack: 'bg-white/30',
    selectedDot: 'bg-white',
    hoverBg: 'hover:bg-[#5F2677]/80',       // hover: 套在卡片自身
    hoverBorder: 'hover:border-[#5F2677]',
    hoverText: 'group-hover:text-white',     // group-hover: 套在子元素
    hoverSubText: 'group-hover:text-white/95',
    hoverTrack: 'group-hover:bg-white/30',
    hoverDot: 'group-hover:bg-white',
    headerBadge: 'border-white/30 bg-white/20 text-white',
    headerText: 'text-white',
    headerSubText: 'text-white/80',
  },
}

// ─── 狀態（Refs） ─────────────────────────────────────────────────────────────
const contracts = ref<RentalContract[]>(createSeedContracts())
const selectedContractId = ref(contracts.value[0]?.id ?? '')
const selectedCycleId = ref<string | null>(null)
const filterTab = ref<'all' | 'paid' | 'pending'>('all')
const paymentDialogOpen = ref(false)
const paymentTargetCycleId = ref<string | null>(null)
const confirmDialogOpen = ref(false)
const confirmTargetCycleId = ref<string | null>(null)

// ─── 計算屬性 ─────────────────────────────────────────────────────────────────
const contractViews = computed<ContractView[]>(() =>
  contracts.value.map((contract) => {
    const today = startOfToday()
    const paidCount = contract.cycles.filter((c) => c.paidAt).length
    const firstUnpaidIndex = contract.cycles.findIndex((c) => !c.paidAt)

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
    if (!contract) {
      selectedCycleId.value = null
      return
    }

    const exists = contract.cycles.some((cycle) => cycle.cycle.id === selectedCycleId.value)
    if (!exists) {
      selectedCycleId.value = contract.currentCycle?.cycle.id ?? contract.cycles[0]?.cycle.id ?? null
    }
  },
  { immediate: true },
)

watch(paymentDialogOpen, (isOpen) => {
  if (!isOpen) paymentTargetCycleId.value = null
})

const filteredCycles = computed(() => {
  if (!activeContractView.value) return []
  if (filterTab.value === 'paid') return activeContractView.value.cycles.filter((cycle) => cycle.status === 'paid')
  if (filterTab.value === 'pending') return activeContractView.value.cycles.filter((cycle) => cycle.status !== 'paid')
  return activeContractView.value.cycles
})

const activeCurrentCycle = computed(() => activeContractView.value?.currentCycle ?? null)

const paymentTargetCycle = computed(() => {
  if (!paymentTargetCycleId.value) return null
  return contractViews.value.flatMap((contract) => contract.cycles).find((cycle) => cycle.cycle.id === paymentTargetCycleId.value) ?? null
})

const globalStats = computed(() => {
  const allCurrentCycles = contractViews.value.map((contract) => contract.currentCycle).filter((cycle): cycle is CycleView => cycle !== null)
  const totalMonthlyRent = contractViews.value.reduce((sum, contract) => sum + (contract.cycles[0]?.cycle.rentAmount ?? 0), 0)
  const totalPending = allCurrentCycles.reduce((sum, cycle) => sum + cycle.partialAmount, 0)
  const nearestDue = allCurrentCycles.map((cycle) => cycle.cycle.dueDate).sort()[0] ?? null
  const overdueCount = contractViews.value.flatMap((contract) => contract.cycles).filter((cycle) => cycle.status === 'overdue').length
  const totalPaid = contractViews.value.reduce((sum, contract) => sum + contract.paidCount, 0)
  const totalCycles = contractViews.value.reduce((sum, contract) => sum + contract.cycles.length, 0)
  const pendingUtilityCount = contractViews.value.reduce(
    (sum, contract) => sum + contract.cycles.filter((cycle) => !cycle.utilityReady).length,
    0,
  )

  return { totalMonthlyRent, totalPending, nearestDue, overdueCount, totalPaid, totalCycles, pendingUtilityCount }
})

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
    : '建議：確認付款資訊與金額後，再進行標記已繳。'
})

// ─── 靜態內容（租客防禦指南、精選文章） ──────────────────────────────────────
const defenseReminder = {
  eyebrow: 'AI 租客防禦提醒',
  title: '租屋風險先看懂',
  summary: '把違約金、設備修繕、押金退還等常見爭議整理成更好理解的重點，幫你在簽約和付款前先避開地雷。',
  source: '內容整理自租賃實務常見情境與平台內部教學資料。',
  actionLabel: '查看完整指南',
  actionTo: '/app/contract',
}

const riskTags = [
  { label: '違約金', count: 12, className: 'border-red-200 bg-red-50 text-red-600' },
  { label: '設備修繕', count: 8, className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { label: '押金退還', count: 15, className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  { label: '租約續約', count: 10, className: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  { label: '水電費用', count: 22, className: 'border-slate-200 bg-slate-100 text-slate-600' },
]

const featuredArticles = [
  { title: '提前解約要賠多少？租賃專法違約金上限解析', category: '違約金', publishedAt: '2026-04-05', to: '/app/contract' },
  { title: '冷氣壞了誰修？圖解修繕責任與存證信函寫法', category: '設備修繕', publishedAt: '2026-03-28', to: '/app/contract' },
  { title: '退租時被扣押金？這 3 種自然損耗房東不能扣', category: '押金退還', publishedAt: '2026-03-15', to: '/app/contract' },
]

// ─── 工具函式 ─────────────────────────────────────────────────────────────────
function findContractIndexByCycle(cycleId: string): [number, number] | null {
  for (let contractIndex = 0; contractIndex < contracts.value.length; contractIndex += 1) {
    const cycleIndex = contracts.value[contractIndex].cycles.findIndex((cycle) => cycle.id === cycleId)
    if (cycleIndex >= 0) return [contractIndex, cycleIndex]
  }
  return null
}

function scrollToCycle(cycleId: string) {
  document.getElementById(`cycle-${cycleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
  const contract = contractViews.value.find((item) => item.id === contractId)
  selectedCycleId.value = contract?.currentCycle?.cycle.id ?? contract?.cycles[0]?.cycle.id ?? null
}

// ─── 繳費 Dialog ──────────────────────────────────────────────────────────────
function openPaymentDialog(cycleId: string) {
  const target = contractViews.value.flatMap((contract) => contract.cycles).find((cycle) => cycle.cycle.id === cycleId)
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

  const nextUnpaid = contract.cycles.find((item) => !item.paidAt)
  selectedContractId.value = contract.id
  selectedCycleId.value = nextUnpaid?.id ?? cycle.id
  paymentDialogOpen.value = false
  paymentTargetCycleId.value = null

  if (selectedCycleId.value) nextTick(() => scrollToCycle(selectedCycleId.value!))
}

// ─── 撤銷 Dialog ──────────────────────────────────────────────────────────────
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

// ─── 樣式輔助函式 ─────────────────────────────────────────────────────────────
function statusBadgeClass(status: CycleStatus): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'current') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'overdue') return 'border-red-200 bg-red-50 text-red-600'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function statusLabel(status: CycleStatus): string {
  if (status === 'paid') return '已繳費'
  if (status === 'current') return '處理中'
  if (status === 'overdue') return '已逾期'
  return '待匯入'
}

function totalAmountLabel(cycle: CycleView): string {
  return cycle.totalAmount == null ? '待匯入' : formatCurrency(cycle.totalAmount)
}

function leaseTermLabel(months: number): string {
  if (months === 24) return '兩年租約'
  if (months === 12) return '一年租約'
  if (months === 6) return '半年租約'
  return `${months} 個月租約`
}

function cycleRowClass(status: CycleStatus): string {
  if (status === 'overdue') return 'bg-red-50/70 hover:bg-red-50'
  if (status === 'current') return 'bg-amber-50/70 hover:bg-amber-50'
  if (status === 'paid') return 'bg-white hover:bg-slate-50'
  return 'bg-slate-50/80 hover:bg-slate-100/70'
}
</script>

<template>
  <div class="flex min-h-full min-w-0 flex-col gap-5 pb-6">
    <!-- ── 頁面標題 ─────────────────────────────────────────────────────────── -->
    <header class="space-y-1">
      <h1 class="text-3xl font-bold tracking-tight text-slate-900">租屋總覽</h1>
      <p class="text-sm text-slate-500">
        {{ activeContractView ? `${activeContractView.title} · ${activeContractView.city}` : '尚未選擇租約' }}
      </p>
    </header>

    <!-- ── 四格統計卡片（月租金 / 待繳合計 / 最近應繳日 / 整體進度） ────────── -->
    <section class="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
      <Card class="rounded-2xl border border-slate-200/80 shadow-sm">
        <CardHeader class="flex min-w-0 flex-row items-center justify-between gap-3 space-y-0 px-5 py-4">
          <div class="min-w-0">
            <CardTitle class="text-xs font-semibold text-slate-500">月租金合計</CardTitle>
            <div class="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {{ globalStats.totalMonthlyRent === 0 ? '--' : formatCurrency(globalStats.totalMonthlyRent) }}
            </div>
            <p class="mt-0.5 text-xs text-slate-500">所有租約合計</p>
          </div>
          <div class="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-500">
            <Building2 class="h-4 w-4" />
          </div>
        </CardHeader>
      </Card>

      <Card class="rounded-2xl border border-slate-200/80 shadow-sm">
        <CardHeader class="flex min-w-0 flex-row items-center justify-between gap-3 space-y-0 px-5 py-4">
          <div class="min-w-0">
            <CardTitle class="text-xs font-semibold text-slate-500">本期待繳合計</CardTitle>
            <div class="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {{ globalStats.totalPending === 0 ? '已清繳' : formatCurrency(globalStats.totalPending) }}
            </div>
            <p class="mt-0.5 text-xs text-slate-500">所有租約本期已知待繳金額</p>
          </div>
          <div class="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-500">
            <PiggyBank class="h-4 w-4" />
          </div>
        </CardHeader>
      </Card>

      <Card class="rounded-2xl border border-slate-200/80 shadow-sm">
        <CardHeader class="flex min-w-0 flex-row items-center justify-between gap-3 space-y-0 px-5 py-4">
          <div class="min-w-0">
            <CardTitle class="text-xs font-semibold text-slate-500">最近應繳日</CardTitle>
            <div class="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {{ globalStats.nearestDue ? formatDate(globalStats.nearestDue, true) : '已清繳' }}
            </div>
            <p
              class="mt-0.5 text-xs"
              :class="globalStats.overdueCount > 0 ? 'font-medium text-red-500' : 'text-slate-500'"
            >
              {{ globalStats.overdueCount > 0 ? `有 ${globalStats.overdueCount} 筆逾期帳單` : '最近待繳期限' }}
            </p>
          </div>
          <div class="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-500">
            <CalendarClock class="h-4 w-4" />
          </div>
        </CardHeader>
      </Card>

      <Card class="rounded-2xl border border-slate-200/80 shadow-sm">
        <CardHeader class="flex min-w-0 flex-row items-center justify-between gap-3 space-y-0 px-5 py-4">
          <div class="min-w-0">
            <CardTitle class="text-xs font-semibold text-slate-500">整體租約進度</CardTitle>
            <div class="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {{ globalStats.totalPaid }} / {{ globalStats.totalCycles }}
            </div>
            <p class="mt-0.5 text-xs text-slate-500">已繳期數 / 全部期數</p>
            <p v-if="globalStats.pendingUtilityCount > 0" class="text-xs text-slate-500">
              另有 {{ globalStats.pendingUtilityCount }} 期水電資料待匯入
            </p>
          </div>
          <div class="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-500">
            <CheckSquare class="h-4 w-4" />
          </div>
        </CardHeader>
      </Card>
    </section>

    <!-- ── 主要內容區：左側租約列表 + 右側帳單詳情 ─────────────────────────── -->
    <section class="grid min-w-0 grid-cols-1 gap-x-5 gap-y-3 lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      <!-- 左側標題：row 1, col 1 -->
      <div class="lg:col-start-1 lg:row-start-1">
        <h2 class="text-lg font-bold tracking-tight text-slate-900">我的租約</h2>
        <p class="text-xs text-slate-500">選擇租約查看完整帳單</p>
      </div>

      <!-- 左側：我的租約清單 row 2, col 1 -->
      <aside class="lg:col-start-1 lg:row-start-2">
        <div class="max-h-[44rem] space-y-2.5 overflow-y-auto pr-1">
          <div
            v-for="contract in contractViews"
            :key="contract.id"
            role="button"
            tabindex="0"
            :class="[
              'group cursor-pointer rounded-2xl border p-3.5 shadow-sm transition-all duration-200',
              selectedContractId === contract.id
                ? accentStyles[contract.accent].selected
                : ['border-slate-200 bg-[#FFFFFF] hover:shadow-md', accentStyles[contract.accent].hoverBg, accentStyles[contract.accent].hoverBorder],
            ]"
            @click="selectContract(contract.id)"
            @keydown.enter.space.prevent="selectContract(contract.id)"
          >
            <div class="flex items-start gap-2.5">
              <span :class="['mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full transition-colors', selectedContractId === contract.id ? accentStyles[contract.accent].selectedDot : [accentStyles[contract.accent].dot, accentStyles[contract.accent].hoverDot]]" />
              <div class="min-w-0 flex-1 space-y-2.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p :class="['truncate text-sm font-bold transition-colors', selectedContractId === contract.id ? accentStyles[contract.accent].selectedText : ['text-slate-900', accentStyles[contract.accent].hoverText]]">{{ contract.title }}</p>
                    <p :class="['truncate text-xs transition-colors', selectedContractId === contract.id ? accentStyles[contract.accent].selectedSubText : ['text-slate-500', accentStyles[contract.accent].hoverSubText]]">{{ contract.city }} · {{ contract.landlord }}</p>
                  </div>
                  <RouterLink
                    to="/app/contract"
                    :class="['shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors', selectedContractId === contract.id ? 'border-white/50 bg-white/20 text-white hover:bg-white/30' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700']"
                    @click.stop
                  >
                    完整租約
                  </RouterLink>
                </div>

                <div class="space-y-1.5">
                  <div :class="['flex items-center justify-between text-xs transition-colors', selectedContractId === contract.id ? accentStyles[contract.accent].selectedSubText : ['text-slate-600', accentStyles[contract.accent].hoverSubText]]">
                    <span>已繳 {{ contract.paidCount }}/{{ contract.cycles.length }} 期</span>
                    <span class="font-semibold">{{ contract.progressPercent }}%</span>
                  </div>
                  <div :class="['h-1.5 overflow-hidden rounded-full transition-colors', selectedContractId === contract.id ? accentStyles[contract.accent].selectedTrack : ['bg-slate-100', accentStyles[contract.accent].hoverTrack]]">
                    <div
                      :class="['h-full rounded-full transition-all', accentStyles[contract.accent].progress]"
                      :style="{ width: `${contract.progressPercent}%` }"
                    />
                  </div>
                </div>

                <div :class="['flex flex-wrap items-center gap-1.5 text-xs transition-colors', selectedContractId === contract.id ? accentStyles[contract.accent].selectedSubText : ['text-slate-500', accentStyles[contract.accent].hoverSubText]]">
                  <Badge
                    variant="outline"
                    :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', accentStyles[contract.accent].badge]"
                  >
                    {{ leaseTermLabel(contract.leaseMonths) }}
                  </Badge>
                  <span>{{ contract.leaseMonths }} 期繳款</span>
                  <span>每月 {{ contract.dueDay }} 號繳費</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右側：選中租約詳情 row 2, col 2 -->
      <div v-if="activeContractView" class="min-w-0 space-y-3 lg:col-start-2 lg:row-start-2">
        <!-- 租約資訊 Header Card -->
        <Card :class="['overflow-hidden rounded-2xl border shadow-sm', accentStyles[activeContractView.accent].selected]">
          <CardContent class="p-5">
            <div class="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div class="min-w-0 space-y-2">
                <Badge
                  variant="outline"
                  :class="['rounded-full px-3 py-1 text-xs font-semibold', accentStyles[activeContractView.accent].headerBadge]"
                >
                  {{ leaseTermLabel(activeContractView.leaseMonths) }}
                </Badge>
                <h3 :class="['text-xl font-bold tracking-tight', accentStyles[activeContractView.accent].headerText]">
                  {{ activeContractView.title }}
                </h3>
                <div :class="['flex flex-wrap items-center gap-x-4 gap-y-1 text-sm', accentStyles[activeContractView.accent].headerSubText]">
                  <span class="flex items-center gap-1.5">
                    <MapPin class="h-3.5 w-3.5 shrink-0" />
                    {{ activeContractView.city }} · {{ activeContractView.address }}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <User class="h-3.5 w-3.5 shrink-0" />
                    房東 {{ activeContractView.landlord }}
                  </span>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-3">
                <div class="min-w-0 rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-center shadow-sm">
                  <p class="text-xs font-medium text-slate-500">月租金</p>
                  <p class="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
                    {{ formatCurrency(activeContractView.cycles[0]?.cycle.rentAmount ?? 0) }}
                  </p>
                </div>
                <div class="min-w-0 rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-center shadow-sm">
                  <p class="text-xs font-medium text-slate-500">租約進度</p>
                  <p class="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
                    {{ activeContractView.paidCount }}/{{ activeContractView.cycles.length }}
                  </p>
                </div>
                <div class="min-w-0 rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-center shadow-sm">
                  <p class="text-xs font-medium text-slate-500">每月繳款日</p>
                  <p class="mt-0.5 text-lg font-bold tracking-tight text-slate-900">{{ activeContractView.dueDay }} 號</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 本期帳單提醒 Card -->
        <Card
          :class="[
            'rounded-2xl border shadow-sm',
            activeCurrentCycle?.status === 'overdue'
              ? 'border-red-100 bg-[linear-gradient(180deg,_rgba(255,251,251,0.98),_rgba(255,247,247,0.95))]'
              : 'border-slate-200 bg-white',
          ]"
        >
          <CardContent class="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1">
              <p class="text-xl font-bold tracking-tight text-slate-900">
                {{ reminderTitle }}
              </p>
              <p class="text-sm text-slate-600">
                應繳日：{{ activeCurrentCycle ? formatDate(activeCurrentCycle.cycle.dueDate) : '無' }}
              </p>
              <p
                :class="[
                  'text-sm font-medium',
                  activeCurrentCycle?.status === 'overdue' ? 'text-red-500' : 'text-slate-600',
                ]"
              >
                {{ reminderAmountLine }}
              </p>
              <p
                :class="[
                  'text-xs',
                  activeCurrentCycle?.status === 'overdue' ? 'text-red-400' : 'text-slate-500',
                ]"
              >
                {{ reminderActionLine }}
              </p>
            </div>

            <div class="flex shrink-0 items-start">
              <span class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                本期提醒
              </span>
            </div>
          </CardContent>
        </Card>

        <!-- 帳單明細表格 Card -->
        <Card class="overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm">
          <CardContent class="p-0">
            <div class="border-b border-slate-100 bg-white px-4 pt-2">
              <div class="overflow-x-auto">
                <div class="flex min-w-max items-center gap-5">
                  <button
                    type="button"
                    :class="[
                      'flex h-11 items-center gap-1.5 border-b-2 px-1 text-sm font-semibold transition-colors',
                      filterTab === 'all' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
                    ]"
                    @click="filterTab = 'all'"
                  >
                    所有帳單
                    <span :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', filterTab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600']">
                      {{ activeContractView.cycles.length }}
                    </span>
                  </button>
                  <button
                    type="button"
                    :class="[
                      'flex h-11 items-center gap-1.5 border-b-2 px-1 text-sm font-semibold transition-colors',
                      filterTab === 'paid' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
                    ]"
                    @click="filterTab = 'paid'"
                  >
                    已繳費
                    <span :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', filterTab === 'paid' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600']">
                      {{ activeContractView.paidCount }}
                    </span>
                  </button>
                  <button
                    type="button"
                    :class="[
                      'flex h-11 items-center gap-1.5 border-b-2 px-1 text-sm font-semibold transition-colors',
                      filterTab === 'pending' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
                    ]"
                    @click="filterTab = 'pending'"
                  >
                    待繳費
                    <span :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', filterTab === 'pending' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600']">
                      {{ activeContractView.remainingCount }}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div class="max-h-[34rem] overflow-auto bg-slate-50/70">
              <table class="w-full min-w-[700px] border-collapse text-left">
                <colgroup>
                  <col style="width: 52px" />
                  <col style="width: 88px" />
                  <col style="width: 96px" />
                  <col style="width: 84px" />
                  <col style="width: 76px" />
                  <col style="width: 68px" />
                  <col style="width: 96px" />
                  <col />
                </colgroup>
                <thead class="sticky top-0 z-10 bg-white/95 shadow-[0_1px_0_rgba(226,232,240,1)] backdrop-blur">
                  <tr class="text-xs font-semibold text-slate-500">
                    <th class="px-3 py-2.5">期數</th>
                    <th class="px-3 py-2.5">狀態</th>
                    <th class="px-3 py-2.5">應繳日</th>
                    <th class="px-3 py-2.5">租金</th>
                    <th class="px-3 py-2.5">電費</th>
                    <th class="px-3 py-2.5">水費</th>
                    <th class="px-3 py-2.5 text-right">合計</th>
                    <th class="px-3 py-2.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
                  <tr
                    v-for="cycleItem in filteredCycles"
                    :id="`cycle-${cycleItem.cycle.id}`"
                    :key="cycleItem.cycle.id"
                    :class="[
                      'cursor-pointer transition-colors',
                      cycleRowClass(cycleItem.status),
                      cycleItem.cycle.id === selectedCycleId ? 'outline outline-2 outline-offset-[-2px] outline-slate-300' : '',
                    ]"
                    @click="focusCycle(cycleItem.cycle.id)"
                  >
                    <td class="px-3 py-3 align-middle">
                      <span
                        :class="[
                          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                          cycleItem.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : '',
                          cycleItem.status === 'current' ? 'bg-amber-100 text-amber-700' : '',
                          cycleItem.status === 'overdue' ? 'bg-red-100 text-red-600' : '',
                          cycleItem.status === 'upcoming' ? 'bg-slate-100 text-slate-500' : '',
                        ]"
                      >
                        {{ cycleItem.cycle.periodIndex }}
                      </span>
                    </td>
                    <td class="px-3 py-3 align-middle">
                      <Badge
                        variant="outline"
                        :class="['rounded-full px-2.5 py-0.5 text-[11px] font-semibold', statusBadgeClass(cycleItem.status)]"
                      >
                        {{ statusLabel(cycleItem.status) }}
                      </Badge>
                      <p v-if="cycleItem.status === 'overdue'" class="mt-0.5 text-[11px] font-medium text-red-500">
                        已逾期 {{ Math.abs(cycleItem.daysLeft) }} 天
                      </p>
                      <p v-else-if="cycleItem.status === 'current'" class="mt-0.5 text-[11px] font-medium text-amber-600">
                        {{ describeDaysLeft(cycleItem.daysLeft) }}
                      </p>
                      <p v-else-if="cycleItem.cycle.paidAt" class="mt-0.5 text-[11px] text-slate-400">
                        {{ formatDate(cycleItem.cycle.paidAt) }} · {{ paymentMethodLabel(cycleItem.cycle.paymentMethod) }}
                      </p>
                    </td>
                    <td class="whitespace-nowrap px-3 py-3 align-middle font-medium">{{ formatDate(cycleItem.cycle.dueDate) }}</td>
                    <td class="whitespace-nowrap px-3 py-3 align-middle font-medium">{{ formatCurrency(cycleItem.cycle.rentAmount) }}</td>
                    <td class="whitespace-nowrap px-3 py-3 align-middle font-medium">{{ formatOptionalAmount(cycleItem.cycle.electricityAmount) }}</td>
                    <td class="whitespace-nowrap px-3 py-3 align-middle font-medium">{{ formatOptionalAmount(cycleItem.cycle.waterAmount) }}</td>
                    <td class="whitespace-nowrap px-3 py-3 text-right align-middle">
                      <p :class="['text-sm font-bold tracking-tight', cycleItem.status === 'paid' ? 'text-emerald-700' : 'text-slate-900']">
                        {{ totalAmountLabel(cycleItem) }}
                      </p>
                      <p v-if="cycleItem.totalAmount == null" class="text-[11px] text-slate-400">
                        已知 {{ formatCurrency(cycleItem.partialAmount) }}
                      </p>
                    </td>
                    <td class="px-3 py-3 text-right align-middle">
                      <Button
                        v-if="!cycleItem.cycle.paidAt && cycleItem.status !== 'upcoming'"
                        size="sm"
                        class="h-7 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                        @click.stop="openPaymentDialog(cycleItem.cycle.id)"
                      >
                        <Check class="mr-1 h-3 w-3" aria-hidden="true" />
                        標記已繳
                      </Button>
                      <Button
                        v-else-if="cycleItem.cycle.paidAt"
                        size="sm"
                        class="h-7 rounded-lg border border-amber-400 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 hover:border-amber-500"
                        @click.stop="requestUndoCyclePaid(cycleItem.cycle.id)"
                      >
                        <RotateCcw class="mr-1 h-3 w-3" aria-hidden="true" />
                        撤銷已繳
                      </Button>
                      <span v-else class="text-[11px] font-medium text-slate-400">待匯入</span>
                    </td>
                  </tr>

                  <tr v-if="filteredCycles.length === 0">
                    <td colspan="8" class="px-3 py-12 text-center text-sm text-slate-500">
                      目前沒有符合篩選條件的帳單。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div v-else class="flex items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20">
        <p class="text-sm text-slate-500">請先從左側選擇租約</p>
      </div>
    </section>

    <!-- ── 停水停電通報 ──────────────────────────────────────────────────────── -->
    <section>
      <!-- 手機版：簡單橫幅連結（sm 以下顯示） -->
      <RouterLink to="/app/outage" class="block sm:hidden">
        <Card class="group cursor-pointer overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-sm transition-all hover:border-amber-300 hover:shadow-md">
          <CardContent class="p-5">
            <div class="flex items-center gap-4">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 transition-colors group-hover:bg-amber-200">
                <Zap class="h-6 w-6" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-base font-bold text-slate-900">停水停電通報</p>
                <p class="mt-0.5 text-sm text-slate-500">查詢或回報住家附近的停水停電資訊，掌握即時狀況。</p>
              </div>
              <ArrowRight class="h-5 w-5 shrink-0 text-amber-500 transition-transform group-hover:translate-x-1" />
            </div>
          </CardContent>
        </Card>
      </RouterLink>

      <!-- 桌面版：直接顯示資訊卡（sm 以上顯示） -->
      <div class="hidden sm:block space-y-3">
        <!-- 標題列 -->
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold tracking-tight text-slate-900">停水停電通報</h2>
            <p class="text-sm text-slate-500">住家附近最新停水停電資訊</p>
          </div>
          <RouterLink
            to="/app/outage"
            class="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            前往完整頁面 <ArrowRight class="h-3.5 w-3.5" />
          </RouterLink>
        </div>

        <!-- 兩欄資訊卡 -->
        <div class="grid gap-4 md:grid-cols-2">
          <!-- 停電資訊 -->
          <Card class="rounded-2xl border-amber-200 bg-amber-50 shadow-sm">
            <CardHeader class="pb-2 pt-4 px-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Zap class="h-4 w-4 text-amber-500" />
                  <CardTitle class="text-base font-bold text-slate-900">停電資訊</CardTitle>
                </div>
                <Badge variant="outline" class="rounded-full border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  明日
                </Badge>
              </div>
              <CardDescription class="mt-1 text-amber-700">台北市大安區</CardDescription>
            </CardHeader>
            <CardContent class="space-y-1.5 px-5 pb-4 text-sm text-slate-700">
              <p><span class="font-semibold text-slate-900">計畫性工作停電</span></p>
              <p class="text-xs text-slate-600">🕐 2026/04/09　14:00 – 16:00</p>
              <p class="text-xs text-slate-600">📍 和平東路二段 80 巷至 120 巷</p>
              <p class="text-xs text-slate-500">原因：變壓器更換工程</p>
            </CardContent>
          </Card>

          <!-- 停水資訊 -->
          <Card class="rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardHeader class="pb-2 pt-4 px-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Droplets class="h-4 w-4 text-blue-500" />
                  <CardTitle class="text-base font-bold text-slate-900">停水資訊</CardTitle>
                </div>
                <Badge variant="outline" class="rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  正常
                </Badge>
              </div>
              <CardDescription class="mt-1 text-slate-500">台北市大安區</CardDescription>
            </CardHeader>
            <CardContent class="px-5 pb-4">
              <p class="text-sm font-semibold text-slate-500">目前供水正常</p>
              <p class="mt-1 text-xs text-slate-400">台北市大安區目前無停水計畫。</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>

    <!-- ── 租客防禦指南區塊（AI 防禦卡 + 精選文章） ──────────────────────────── -->
    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">租客防禦指南</h2>
        <p class="text-sm text-muted-foreground">快速補齊租屋常見爭議與判斷基礎。</p>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <Card class="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_24%),linear-gradient(145deg,_rgba(49,46,129,0.98),_rgba(67,56,202,0.96)_55%,_rgba(99,102,241,0.94))] text-white shadow-lg">
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
                  <CardTitle class="text-2xl">精選文章</CardTitle>
                </div>
                <CardDescription>從熱門風險關鍵字快速延伸到對應教學與案例。</CardDescription>
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

    <!-- ── Dialogs ────────────────────────────────────────────────────────────── -->
    <PaymentDialog
      :open="paymentDialogOpen"
      :target-cycle="paymentTargetCycle"
      @update:open="(v: boolean) => { paymentDialogOpen = v }"
      @submit="submitPaymentRecord"
    />

    <ConfirmDialog
      :open="confirmDialogOpen"
      title="撤銷已繳紀錄"
      message="要撤銷這筆已繳紀錄嗎？撤銷後將重新標示為未繳費。"
      @update:open="(v: boolean) => { confirmDialogOpen = v }"
      @confirm="confirmUndoCyclePaid"
    />
  </div>
</template>

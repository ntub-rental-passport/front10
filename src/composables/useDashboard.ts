import { computed, nextTick, onMounted, ref, watch } from 'vue'

import {
  type CycleStatus,
  type CycleView,
  type PaymentMethod,
  type RentalContract,
} from '@/src/utils/dashboard-contract'
import {
  fetchDashboardContracts,
  recordBillPayment,
  reportLandlordPayment,
  undoBillPayment,
  saveBillUtilities,
} from '@/src/services/dashboardApi'
import type { UtilityDetails } from '@/src/utils/utility-billing'
import {
  accentStyles,
  defenseReminder,
  featuredArticles,
  riskTags,
} from '@/src/constants/dashboard'
import { daysUntil, formatCurrency, parseIso, startOfToday } from '@/src/utils/rent-format'

interface ContractView extends Omit<RentalContract, 'cycles'> {
  cycles: CycleView[]
  paidCount: number
  remainingCount: number
  progressPercent: number
  currentCycle: CycleView | null
}

type FilterTab = 'all' | 'paid' | 'pending'

interface PaymentRecordForm {
  paidAt: string
  method: PaymentMethod
  note: string
  proofName: string
}

function buildCycleView(contract: RentalContract, cycle: RentalContract['cycles'][number], index: number, firstUnpaidIndex: number): CycleView {
  const utilityReady = cycle.electricityAmount != null && cycle.waterAmount != null
  const partialAmount = cycle.rentAmount + (cycle.electricityAmount ?? 0) + (cycle.waterAmount ?? 0)
  const totalAmount = utilityReady ? partialAmount : null

  let status: CycleStatus = 'upcoming'
  if (cycle.paidAt) {
    status = 'paid'
  } else if (index === firstUnpaidIndex) {
    status = parseIso(cycle.dueDate) < startOfToday() ? 'overdue' : 'current'
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
  }
}

function findCycleLocation(contracts: RentalContract[], cycleId: string): [number, number] | null {
  for (let contractIndex = 0; contractIndex < contracts.length; contractIndex += 1) {
    const cycleIndex = contracts[contractIndex].cycles.findIndex((cycle) => cycle.id === cycleId)
    if (cycleIndex >= 0) return [contractIndex, cycleIndex]
  }

  return null
}

function findCycleViewById(contracts: ContractView[], cycleId: string | null): CycleView | null {
  if (!cycleId) return null
  return contracts.flatMap((contract) => contract.cycles).find((cycle) => cycle.cycle.id === cycleId) ?? null
}

function scrollToCycle(cycleId: string) {
  document.getElementById(`cycle-${cycleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

export function useDashboard() {
  // 資料一律來自資料庫（GET /api/dashboard/contracts）。
  // 讀取失敗時維持空陣列並顯示錯誤 —— 不以任何示範資料填補，
  // 那會讓使用者把別人的（或不存在的）租約當成自己的。
  const contracts = ref<RentalContract[]>([])
  const loading = ref(true)
  const loadError = ref('')
  const actionError = ref('')
  const selectedContractId = ref('')

  async function loadContracts(): Promise<void> {
    loading.value = true
    loadError.value = ''
    try {
      contracts.value = await fetchDashboardContracts()
      if (!contracts.value.some((contract) => contract.id === selectedContractId.value)) {
        selectedContractId.value = contracts.value[0]?.id ?? ''
      }
    } catch (error) {
      contracts.value = []
      loadError.value = error instanceof Error ? error.message : '讀取租約資料失敗，請稍後重試。'
    } finally {
      loading.value = false
    }
  }

  onMounted(loadContracts)

  const hasContracts = computed(() => contracts.value.length > 0)
  const isEmpty = computed(() => !loading.value && !loadError.value && !hasContracts.value)
  const selectedCycleId = ref<string | null>(null)
  const filterTab = ref<FilterTab>('all')
  const paymentDialogOpen = ref(false)
  const paymentTargetCycleId = ref<string | null>(null)
  const confirmDialogOpen = ref(false)
  const confirmTargetCycleId = ref<string | null>(null)
  const utilityDialogOpen = ref(false)
  const utilityTargetCycleId = ref<string | null>(null)
  const utilitySaving = ref(false)
  const utilityError = ref('')
  const utilityTargetCycle = computed(() => findCycleViewById(contractViews.value, utilityTargetCycleId.value))

  function openUtilityDialog(cycleId: string) {
    const location = findCycleLocation(contracts.value, cycleId)
    if (!location) return
    const contract = contracts.value[location[0]]
    if (contract.source === 'landlord') return
    utilityError.value = ''
    utilityTargetCycleId.value = cycleId
    utilityDialogOpen.value = true
  }

  async function submitUtilities(payload: UtilityDetails) {
    if (utilitySaving.value || !utilityTargetCycleId.value) return
    const location = findCycleLocation(contracts.value, utilityTargetCycleId.value)
    if (!location) return
    const cycle = contracts.value[location[0]].cycles[location[1]]
    utilitySaving.value = true
    utilityError.value = ''
    try {
      Object.assign(cycle, await saveBillUtilities(cycle.id, payload))
      utilityDialogOpen.value = false
    } catch (error) {
      utilityError.value = error instanceof Error ? error.message : '儲存水電費失敗，請稍後重試。'
    } finally {
      utilitySaving.value = false
    }
  }

  const contractViews = computed<ContractView[]>(() =>
    contracts.value.map((contract) => {
      const paidCount = contract.cycles.filter((cycle) => cycle.paidAt).length
      const firstUnpaidIndex = contract.cycles.findIndex((cycle) => !cycle.paidAt)
      const cycles = contract.cycles.map((cycle, index) =>
        buildCycleView(contract, cycle, index, firstUnpaidIndex)
      )

      return {
        ...contract,
        cycles,
        paidCount,
        remainingCount: contract.cycles.length - paidCount,
        progressPercent: Math.round((paidCount / contract.cycles.length) * 100),
        currentCycle: firstUnpaidIndex === -1 ? null : cycles[firstUnpaidIndex] ?? null,
      }
    })
  )

  const activeContractView = computed(
    () =>
      contractViews.value.find((contract) => contract.id === selectedContractId.value) ??
      contractViews.value[0] ??
      null
  )

  const filteredCycles = computed(() => {
    if (!activeContractView.value) return []
    if (filterTab.value === 'paid') {
      return activeContractView.value.cycles.filter((cycle) => cycle.status === 'paid')
    }
    if (filterTab.value === 'pending') {
      return activeContractView.value.cycles.filter((cycle) => cycle.status !== 'paid')
    }
    return activeContractView.value.cycles
  })

  const activeCurrentCycle = computed(() => activeContractView.value?.currentCycle ?? null)

  const paymentTargetCycle = computed(() =>
    findCycleViewById(contractViews.value, paymentTargetCycleId.value)
  )

  const globalStats = computed(() => {
    const allCurrentCycles = contractViews.value
      .map((contract) => contract.currentCycle)
      .filter((cycle): cycle is CycleView => cycle !== null)

    return {
      totalMonthlyRent: contractViews.value.reduce(
        (sum, contract) => sum + (contract.cycles[0]?.cycle.rentAmount ?? 0),
        0
      ),
      totalPending: allCurrentCycles.reduce((sum, cycle) => sum + cycle.partialAmount, 0),
      nearestDue: allCurrentCycles.map((cycle) => cycle.cycle.dueDate).sort()[0] ?? null,
      overdueCount: contractViews.value
        .flatMap((contract) => contract.cycles)
        .filter((cycle) => cycle.status === 'overdue').length,
      totalPaid: contractViews.value.reduce((sum, contract) => sum + contract.paidCount, 0),
      totalCycles: contractViews.value.reduce((sum, contract) => sum + contract.cycles.length, 0),
      pendingUtilityCount: contractViews.value.reduce(
        (sum, contract) => sum + contract.cycles.filter((cycle) => !cycle.utilityReady).length,
        0
      ),
    }
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
      return `目前已知金額：${formatCurrency(activeCurrentCycle.value.partialAmount)}，水電待填寫`
    }
    return `應繳金額：${formatCurrency(activeCurrentCycle.value.totalAmount)}`
  })

  const reminderActionLine = computed(() => {
    if (!activeCurrentCycle.value) return '可以切換其他租約，檢查是否有新的待處理期數。'
    return activeCurrentCycle.value.status === 'overdue'
      ? '建議：優先完成繳費，並保留轉帳或收據證明。'
      : '建議：確認付款資訊與金額後，再進行標記已繳。'
  })

  watch(
    activeContractView,
    (contract) => {
      if (!contract) {
        selectedCycleId.value = null
        return
      }

      const exists = contract.cycles.some((cycle) => cycle.cycle.id === selectedCycleId.value)
      if (!exists) {
        selectedCycleId.value =
          contract.currentCycle?.cycle.id ?? contract.cycles[0]?.cycle.id ?? null
      }
    },
    { immediate: true }
  )

  watch(paymentDialogOpen, (isOpen) => {
    if (!isOpen) paymentTargetCycleId.value = null
  })

  watch(confirmDialogOpen, (isOpen) => {
    if (!isOpen) confirmTargetCycleId.value = null
  })

  function focusCycle(cycleId: string) {
    const target = findCycleLocation(contracts.value, cycleId)
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

  function openPaymentDialog(cycleId: string) {
    const target = findCycleViewById(contractViews.value, cycleId)
    if (!target || target.cycle.paidAt) return

    paymentTargetCycleId.value = cycleId
    paymentDialogOpen.value = true
  }

  async function submitPaymentRecord(form: PaymentRecordForm) {
    if (!paymentTargetCycleId.value) return

    const target = findCycleLocation(contracts.value, paymentTargetCycleId.value)
    if (!target) return

    const [contractIndex, cycleIndex] = target
    const contract = contracts.value[contractIndex]
    const cycle = contract.cycles[cycleIndex]
    if (cycle.paidAt) return

    // 先寫進資料庫再更新畫面：反過來的話寫入失敗會留下一個
    // 看起來已繳、重整後又變回未繳的期數。
    actionError.value = ''
    try {
      // 房東平台的租約：只能回報，由房東確認入帳後才算已繳
      const saved = contract.source === 'landlord'
        ? await reportLandlordPayment(cycle.id, {
          paid_at: form.paidAt,
          payment_method: form.method,
          payment_note: form.note.trim(),
        })
        : await recordBillPayment(cycle.id, {
          paid_at: form.paidAt,
          payment_method: form.method,
          payment_note: form.note.trim(),
          payment_proof_name: form.proofName || null,
        })
      Object.assign(cycle, saved)
    } catch (error) {
      actionError.value = error instanceof Error ? error.message : '記錄繳費失敗，請稍後重試。'
      return
    }
    if (contract.source === 'landlord') {
      paymentDialogOpen.value = false
      return
    }

    const nextUnpaid = contract.cycles.find((item) => !item.paidAt)
    selectedContractId.value = contract.id
    selectedCycleId.value = nextUnpaid?.id ?? cycle.id
    paymentDialogOpen.value = false

    if (selectedCycleId.value) {
      nextTick(() => scrollToCycle(selectedCycleId.value!))
    }
  }

  function requestUndoCyclePaid(cycleId: string) {
    confirmTargetCycleId.value = cycleId
    confirmDialogOpen.value = true
  }

  async function confirmUndoCyclePaid() {
    if (!confirmTargetCycleId.value) return

    const target = findCycleLocation(contracts.value, confirmTargetCycleId.value)
    if (!target) return

    const [contractIndex, cycleIndex] = target
    const contract = contracts.value[contractIndex]
    const cycle = contract.cycles[cycleIndex]

    actionError.value = ''
    try {
      Object.assign(cycle, await undoBillPayment(cycle.id))
    } catch (error) {
      actionError.value = error instanceof Error ? error.message : '取消繳費紀錄失敗，請稍後重試。'
      return
    }

    selectedContractId.value = contract.id
    selectedCycleId.value = cycle.id
    confirmDialogOpen.value = false
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
    if (status === 'current') return '處理中'
    if (status === 'overdue') return '已逾期'
    return '未到期'
  }

  function totalAmountLabel(cycle: CycleView): string {
    return cycle.totalAmount == null ? '待填寫' : formatCurrency(cycle.totalAmount)
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

  return {
    utilityDialogOpen,
    utilityTargetCycle,
    utilitySaving,
    utilityError,
    openUtilityDialog,
    submitUtilities,
    accentStyles,
    actionError,
    activeContractView,
    activeCurrentCycle,
    confirmDialogOpen,
    contractViews,
    cycleRowClass,
    defenseReminder,
    featuredArticles,
    filterTab,
    filteredCycles,
    focusCycle,
    globalStats,
    hasContracts,
    isEmpty,
    loadContracts,
    loadError,
    loading,
    leaseTermLabel,
    openPaymentDialog,
    paymentDialogOpen,
    paymentTargetCycle,
    reminderActionLine,
    reminderAmountLine,
    reminderTitle,
    requestUndoCyclePaid,
    riskTags,
    selectContract,
    selectedContractId,
    selectedCycleId,
    statusBadgeClass,
    statusLabel,
    submitPaymentRecord,
    totalAmountLabel,
    confirmUndoCyclePaid,
  }
}

import { computed, ref } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { seedDepositCases, type DepositCase } from '@/src/mocks/admin-seed'
import { elapsedDays } from '@/src/utils/admin-maintenance'
import {
  canTransitionDeposit,
  deductionResponseLabels,
  depositStatusLabels,
  isOverCollected,
  overCollectedAmount,
  type DeductionResponse,
  type DepositStatus,
} from '@/src/utils/admin-deposit'

export const adminDepositCollection = createAdminCollection<DepositCase[]>(
  'deposit-cases',
  seedDepositCases,
)
const cases = adminDepositCollection

/** 列表頁的狀態頁籤：processing 涵蓋點交／提出扣款／同意／逾期 */
export type DepositStatusTab = 'all' | 'held' | 'processing' | 'disputed' | 'refunded'

export const depositStatusTabs: { value: DepositStatusTab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'held', label: '持有中' },
  { value: 'processing', label: '處理中' },
  { value: 'disputed', label: '爭議中' },
  { value: 'refunded', label: '已退還' },
]

function matchesStatusTab(status: DepositStatus, tab: DepositStatusTab): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'held':
      return status === 'held'
    case 'processing':
      return (
        status === 'inspecting' ||
        status === 'deduction_proposed' ||
        status === 'agreed' ||
        status === 'overdue'
      )
    case 'disputed':
      return status === 'disputed'
    case 'refunded':
      return status === 'refunded'
    default:
      return false
  }
}

export interface DepositCaseView extends DepositCase {
  overCollected: boolean
  overCollectedAmountValue: number
  /** 應退期限已過且尚未退還時的逾期天數，否則為 0 */
  overdueDays: number
  /** 租客已同意的扣款金額加總 */
  agreedDeductionTotal: number
  /** 押金扣除已同意扣款後的預期退款金額 */
  expectedRefund: number
  /** 租客標記為異議的扣款筆數 */
  disputedCount: number
}

export interface DepositStats {
  /** 尚未退還案件的押金加總 */
  heldTotal: number
  processing: number
  overCollectedCount: number
  disputedCount: number
}

export function useAdminDeposits() {
  const { logAction } = useAdminAudit()
  const error = ref('')

  const statusTab = ref<DepositStatusTab>('all')
  const onlyOverCollected = ref(false)
  const onlyDisputed = ref(false)
  const keyword = ref('')

  const caseViews = computed<DepositCaseView[]>(() =>
    cases.value.map((item) => {
      const overCollected = isOverCollected(item.depositAmount, item.monthlyRent)
      const overCollectedAmountValue = overCollectedAmount(item.depositAmount, item.monthlyRent)
      const overdueDays =
        item.refundDueDate && !item.refundedAt && elapsedDays(item.refundDueDate) > 0
          ? elapsedDays(item.refundDueDate)
          : 0
      const agreedDeductionTotal = item.deductions
        .filter((deduction) => deduction.tenantResponse === 'agreed')
        .reduce((sum, deduction) => sum + deduction.amount, 0)
      const expectedRefund = item.depositAmount - agreedDeductionTotal
      const disputedCount = item.deductions.filter(
        (deduction) => deduction.tenantResponse === 'disputed',
      ).length

      return {
        ...item,
        overCollected,
        overCollectedAmountValue,
        overdueDays,
        agreedDeductionTotal,
        expectedRefund,
        disputedCount,
      }
    }),
  )

  const filteredCases = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return caseViews.value
      .filter((item) => matchesStatusTab(item.status, statusTab.value))
      .filter((item) => !onlyOverCollected.value || item.overCollected)
      .filter((item) => !onlyDisputed.value || item.status === 'disputed')
      .filter((item) => {
        if (!kw) return true
        return (
          item.id.toLowerCase().includes(kw) ||
          item.address.toLowerCase().includes(kw) ||
          item.tenant.toLowerCase().includes(kw)
        )
      })
  })

  const stats = computed<DepositStats>(() => {
    let heldTotal = 0
    let processing = 0
    let overCollectedCount = 0
    let disputedCount = 0

    for (const item of cases.value) {
      if (!item.refundedAt) heldTotal += item.depositAmount
      if (item.status !== 'held' && item.status !== 'refunded') processing += 1
      if (isOverCollected(item.depositAmount, item.monthlyRent)) overCollectedCount += 1
      if (item.status === 'disputed') disputedCount += 1
    }

    return { heldTotal, processing, overCollectedCount, disputedCount }
  })

  function advanceStatus(id: string, next: DepositStatus, note: string): boolean {
    const item = cases.value.find((entry) => entry.id === id)
    if (!item) {
      error.value = '找不到案件'
      return false
    }

    if (!canTransitionDeposit(item.status, next)) {
      error.value = `無法從「${depositStatusLabels[item.status]}」變更為「${depositStatusLabels[next]}」`
      return false
    }

    const previous = item.status
    item.status = next
    if (next === 'refunded' && item.refundedAt === null) {
      item.refundedAt = new Date().toISOString()
    }

    logAction(
      '押金退還',
      item.id,
      `狀態由「${depositStatusLabels[previous]}」變更為「${depositStatusLabels[next]}」${note ? `：${note}` : ''}`,
    )
    error.value = ''
    return true
  }

  function openDispute(id: string, note: string): boolean {
    return advanceStatus(id, 'disputed', note)
  }

  function setDeductionResponse(
    caseId: string,
    deductionId: string,
    response: DeductionResponse,
  ): boolean {
    const item = cases.value.find((entry) => entry.id === caseId)
    if (!item) {
      error.value = '找不到案件'
      return false
    }

    const deduction = item.deductions.find((entry) => entry.id === deductionId)
    if (!deduction) {
      error.value = '找不到扣款項目'
      return false
    }

    deduction.tenantResponse = response
    logAction(
      '押金退還',
      item.id,
      `扣款「${deduction.label}」標記為：${deductionResponseLabels[response]}`,
    )
    error.value = ''
    return true
  }

  return {
    cases,
    caseViews,
    statusTab,
    onlyOverCollected,
    onlyDisputed,
    keyword,
    filteredCases,
    stats,
    advanceStatus,
    openDispute,
    setDeductionResponse,
    error,
  }
}

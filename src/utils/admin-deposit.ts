/** 押金退還的狀態機與法規檢核。純邏輯，不依賴 Vue。 */

export type DepositStatus =
  | 'held'
  | 'inspecting'
  | 'deduction_proposed'
  | 'disputed'
  | 'agreed'
  | 'refunded'
  | 'overdue'

export const depositStatusLabels: Record<DepositStatus, string> = {
  held: '持有中',
  inspecting: '退租點交中',
  deduction_proposed: '房東提出扣款',
  disputed: '租客異議',
  agreed: '租客同意',
  refunded: '已退還',
  overdue: '逾期未退',
}

export const depositTransitions: Record<DepositStatus, DepositStatus[]> = {
  held: ['inspecting'],
  inspecting: ['deduction_proposed', 'agreed'],
  deduction_proposed: ['agreed', 'disputed', 'overdue'],
  disputed: ['agreed', 'overdue'],
  agreed: ['refunded', 'overdue'],
  overdue: ['disputed', 'refunded'],
  refunded: [],
}

export function canTransitionDeposit(from: DepositStatus, to: DepositStatus): boolean {
  return depositTransitions[from].includes(to)
}

export type DeductionResponse = 'pending' | 'agreed' | 'disputed'

export const deductionResponseLabels: Record<DeductionResponse, string> = {
  pending: '待回應',
  agreed: '同意',
  disputed: '異議',
}

/** 押金上限月數（土地法第 99 條，撰寫論文時請再核對現行條文） */
export const depositCapMonths = 2
/** 退租後幾天內應退還押金 */
export const refundDueDays = 30

/** 押金是否超收：嚴格大於月租 × 上限月數才算 */
export function isOverCollected(depositAmount: number, monthlyRent: number): boolean {
  return depositAmount > monthlyRent * depositCapMonths
}

/** 超收金額，未超收為 0 */
export function overCollectedAmount(depositAmount: number, monthlyRent: number): number {
  const cap = monthlyRent * depositCapMonths
  return depositAmount > cap ? depositAmount - cap : 0
}

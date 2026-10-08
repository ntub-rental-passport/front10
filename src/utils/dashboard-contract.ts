/**
 * 儀表板的租約與帳單型別。
 *
 * 這些型別原本和一份 seed 假資料一起住在 src/mocks/dashboard-seed.ts。
 * 假資料會顯示三份不存在的租約（含假的房東姓名與已繳紀錄），使用者無從
 * 分辨哪些是自己的，所以在接上資料庫時整份刪除，只保留型別。
 * 資料一律來自 GET /api/dashboard/contracts。
 */

export type AccentKey = 'sky' | 'emerald' | 'amber'
export type CycleStatus = 'paid' | 'current' | 'overdue' | 'upcoming'
export type PaymentMethod = 'bank-transfer' | 'cash' | 'line-pay' | 'other'

/** 對應 bills 一列。 */
export interface BillingCycle {
  utilityDetails?: import('./utility-billing').UtilityDetails | null
  id: string
  periodIndex: number
  periodStart: string
  periodEnd: string
  dueDate: string
  rentAmount: number
  /** null = 帳單還沒來，不是 0 元。 */
  electricityAmount: number | null
  waterAmount: number | null
  paidAt: string | null
  paymentMethod: PaymentMethod | null
  paymentNote: string
  paymentProofName: string | null
  /** landlord：房東平台上的租約，金額與收款以房東紀錄為準，租客只能回報已繳 */
  source?: 'self' | 'landlord'
  paidAmount?: number
  totalAmount?: number
  /** 租客回報已繳、房東還沒確認收齊 */
  tenantReport?: { at: string; detail: string } | null
}

/** 對應 rentals 一列（加上該租約的每期帳單）。 */
export interface RentalContract {
  id: string
  title: string
  city: string
  address: string
  landlord: string
  leaseMonths: number
  contractStart: string
  contractEnd: string
  dueDay: number
  electricityPlan: string
  waterPlan: string
  accent: AccentKey
  /** self：自己存的合約；landlord：加入的房東平台租約（唯讀） */
  source?: 'self' | 'landlord'
  cycles: BillingCycle[]
}

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

export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'bank-transfer', label: '銀行轉帳' },
  { value: 'cash', label: '現金付款' },
  { value: 'line-pay', label: 'LINE Pay' },
  { value: 'other', label: '其他方式' },
]

export function paymentMethodLabel(method: PaymentMethod | null): string {
  return paymentMethodOptions.find((item) => item.value === method)?.label ?? '未填寫'
}

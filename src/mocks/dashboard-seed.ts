import { addMonths, endOfMonth, formatIso, parseIso } from '@/src/utils/rent-format'

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
    // single consistent formula for all periods (was *55 for current, *40 for others)
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

import { computed, reactive } from 'vue'
import {
  notifyLandlordWorkspaceUpdated,
  useLandlordWorkspace,
} from '@/src/composables/useLandlordWorkspace'

export type PaymentStatus = 'pending' | 'overdue' | 'paid' | 'partial'
export type PaymentKind = 'rent' | 'water' | 'other'

export interface LandlordPayment {
  id: string
  tenantId: number | null
  group: string
  room: string
  tenant: string
  kind: PaymentKind
  title: string
  period: string
  amount: number
  paid: number
  due: string
  status: PaymentStatus
  reminded: boolean
  activities: string[]
}

export interface LandlordExpense {
  id: string
  title: string
  category: string
  amount: number
  date: string
  repairTicketId?: string
}

interface PaymentRecord {
  paid: number
  reminded: boolean
  activities: string[]
}

const PAYMENT_STORAGE_KEY = 'rentmate-landlord-payment-records-v1'
const EXPENSE_STORAGE_KEY = 'rentmate-landlord-expenses-v1'

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '') as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

const paymentRecords = reactive<Record<string, PaymentRecord>>(
  readStorage(PAYMENT_STORAGE_KEY, {}),
)
const expenses = reactive<LandlordExpense[]>(readStorage(EXPENSE_STORAGE_KEY, []))

function replacePaymentRecords(records: Record<string, PaymentRecord>): void {
  Object.keys(paymentRecords).forEach((key) => delete paymentRecords[key])
  Object.assign(paymentRecords, records)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PAYMENT_STORAGE_KEY && event.newValue) {
      replacePaymentRecords(readStorage(PAYMENT_STORAGE_KEY, {}))
    }
    if (event.key === EXPENSE_STORAGE_KEY && event.newValue) {
      expenses.splice(0, expenses.length, ...readStorage<LandlordExpense[]>(EXPENSE_STORAGE_KEY, []))
    }
  })
}

function persistPayments(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(paymentRecords))
  }
}

function persistExpenses(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(expenses))
  }
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function paymentInterval(frequency: string | null): number {
  return ({ monthly: 1, bimonthly: 2, quarterly: 3 } as Record<string, number>)[frequency ?? ''] ?? 1
}

export function useLandlordFinance() {
  const { activeTenants } = useLandlordWorkspace()
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`

  const payments = computed<LandlordPayment[]>(() =>
    activeTenants.value
      .filter((tenant) => {
        if (tenant.monthly_rent <= 0 || !tenant.lease_start || !tenant.lease_end) return false
        const leaseStart = new Date(`${tenant.lease_start}T00:00:00`)
        const leaseEnd = new Date(`${tenant.lease_end}T23:59:59`)
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        const monthsSinceStart = (now.getFullYear() - leaseStart.getFullYear()) * 12
          + now.getMonth() - leaseStart.getMonth()
        return leaseStart <= monthEnd
          && leaseEnd >= monthStart
          && monthsSinceStart >= 0
          && monthsSinceStart % paymentInterval(tenant.payment_frequency) === 0
      })
      .map((tenant) => {
        const id = `rent:${tenant.lease_id ?? tenant.id}:${monthKey}`
        const record = paymentRecords[id] ?? { paid: 0, reminded: false, activities: [] }
        const dueDay = Math.min(tenant.payment_day ?? 5, daysInMonth(now.getFullYear(), now.getMonth()))
        const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay)
        const amount = tenant.monthly_rent * paymentInterval(tenant.payment_frequency)
        const paid = Math.min(record.paid, amount)
        const status: PaymentStatus = paid >= amount
          ? 'paid'
          : paid > 0
            ? 'partial'
            : dueDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())
              ? 'overdue'
              : 'pending'
        return {
          id,
          tenantId: tenant.id,
          group: tenant.property_name ?? '尚未指定棟別',
          room: tenant.room_number ?? '—',
          tenant: tenant.name,
          kind: 'rent',
          title: status === 'overdue' ? '逾期租金' : '本月租金',
          period: `${monthLabel}租金`,
          amount,
          paid,
          due: dateKey(dueDate),
          status,
          reminded: record.reminded,
          activities: record.activities.length
            ? [...record.activities]
            : [`${String(now.getMonth() + 1).padStart(2, '0')}/${String(dueDay).padStart(2, '0')} 系統依合約建立收款任務`],
        }
      }),
  )

  function recordPayment(id: string, amount: number): void {
    const payment = payments.value.find((item) => item.id === id)
    if (!payment) return
    const current = paymentRecords[id] ?? { paid: 0, reminded: false, activities: [] }
    const accepted = Math.min(Math.max(0, amount), payment.amount - current.paid)
    paymentRecords[id] = {
      ...current,
      paid: current.paid + accepted,
      activities: [`${new Date().toLocaleDateString('zh-TW')} 已入帳 NT$${accepted.toLocaleString('zh-TW')}`, ...current.activities],
    }
    persistPayments()
    notifyLandlordWorkspaceUpdated('finance')
  }

  function markPaymentReminded(id: string): void {
    const current = paymentRecords[id] ?? { paid: 0, reminded: false, activities: [] }
    paymentRecords[id] = {
      ...current,
      reminded: true,
      activities: [`${new Date().toLocaleDateString('zh-TW')} 已發送收款提醒`, ...current.activities],
    }
    persistPayments()
    notifyLandlordWorkspaceUpdated('finance')
  }

  function addExpense(input: Omit<LandlordExpense, 'id'>): void {
    expenses.unshift({ ...input, id: `expense:${Date.now()}` })
    persistExpenses()
    notifyLandlordWorkspaceUpdated('finance')
  }

  const total = computed(() => payments.value.reduce((sum, item) => sum + item.amount, 0))
  const received = computed(() => payments.value.reduce((sum, item) => sum + item.paid, 0))
  const awaiting = computed(() => total.value - received.value)
  const overdue = computed(() => payments.value
    .filter((item) => item.status === 'overdue')
    .reduce((sum, item) => sum + item.amount - item.paid, 0))
  const rate = computed(() => total.value ? Math.round((received.value / total.value) * 100) : 0)

  return {
    payments,
    expenses,
    total,
    received,
    awaiting,
    overdue,
    rate,
    monthLabel,
    recordPayment,
    markPaymentReminded,
    addExpense,
  }
}

import { computed, onMounted, readonly, ref } from 'vue'
import { getAuthSession } from '@/src/composables/useAuth'
import { notifyLandlordWorkspaceUpdated } from '@/src/composables/useLandlordWorkspace'
import {
  LANDLORD_WORKSPACE_CHANGED_EVENT,
  activeWorkspaceOwnerId,
} from '@/src/services/landlordApiClient'
import {
  createCharge,
  createExpense,
  deleteExpense,
  fetchCharges,
  fetchExpenses,
  recordChargePayment,
  remindCharge,
  reverseChargePayment,
  type ChargeTotals,
  type LandlordCharge,
  type LandlordExpense as ApiExpense,
  type PaymentMethod,
} from '@/src/services/landlordWorkspaceApi'
import { landlordRequest } from '@/src/services/landlordApiClient'

/**
 * 房東帳務：資料全部來自後端（/api/landlord/finance）。
 *
 * 以前收款存在瀏覽器 localStorage、每次用當下租約重算本月租金：換電腦就看不到、
 * 改租金會改到舊帳、「已發送提醒」其實什麼都沒送。現在應收由後端依租約產生並
 * 固定金額，入帳、催繳都等伺服器確認才更新畫面。
 */

export type PaymentStatus = 'pending' | 'overdue' | 'paid' | 'partial'
export type PaymentKind = 'rent' | 'water' | 'other'

export interface LandlordPayment {
  id: string
  chargeId: number
  leaseId: number
  tenantId: number | null
  tenantBound: boolean
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
  partial: boolean
  overdue: boolean
  carried: boolean
  reminded: boolean
  remindedAt: string | null
  activities: string[]
  payments: LandlordCharge['payments']
}

export interface LandlordExpense {
  id: string
  title: string
  category: string
  amount: number
  date: string
  source: 'manual' | 'repair'
  note: string | null
}

export interface TrendPoint {
  month: string
  label: string
  total: number
  received: number
  rate: number | null
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function labelFor(month: string): string {
  const [year, number] = month.split('-')
  return `${year} 年 ${Number(number)} 月`
}

function displayDate(value: string): string {
  return value.replaceAll('-', '/')
}

function toPayment(charge: LandlordCharge): LandlordPayment {
  const period = charge.period_start === charge.period_end
    ? displayDate(charge.period_start)
    : `${displayDate(charge.period_start)} ～ ${displayDate(charge.period_end)}`
  return {
    id: `charge:${charge.id}`,
    chargeId: charge.id,
    leaseId: charge.lease_id,
    tenantId: charge.tenant_id,
    tenantBound: charge.tenant_bound,
    group: charge.property,
    room: charge.room,
    tenant: charge.tenant,
    kind: charge.kind === 'rent' ? 'rent' : charge.kind === 'other' ? 'other' : 'water',
    title: charge.carried ? `${charge.title}（前期未收）` : charge.title,
    period,
    amount: charge.amount,
    paid: charge.paid,
    due: charge.due_date,
    status: charge.status === 'void' ? 'paid' : charge.status,
    partial: charge.partial,
    overdue: charge.overdue,
    carried: charge.carried,
    reminded: Boolean(charge.reminded_at),
    remindedAt: charge.reminded_at,
    activities: charge.events.map((event) => `${new Date(event.at).toLocaleDateString('zh-TW')} ${event.detail}`),
    payments: charge.payments,
  }
}

function toExpense(item: ApiExpense): LandlordExpense {
  return { id: item.id, title: item.title, category: item.category, amount: item.amount, date: item.spent_on, source: item.source, note: item.note }
}

const month = ref(currentMonthKey())
const charges = ref<LandlordCharge[]>([])
const totals = ref<ChargeTotals>({ total: 0, received: 0, awaiting: 0, overdue: 0, partial_received: 0, rate: 0 })
const expenseItems = ref<LandlordExpense[]>([])
const trend = ref<TrendPoint[]>([])
const loading = ref(false)
const error = ref('')
let loadedFor = ''
let listening = false

function cacheKey(): string {
  const session = getAuthSession()
  return `${session?.userId ?? session?.email ?? ''}@${activeWorkspaceOwnerId() ?? 'own'}#${month.value}`
}

async function load(): Promise<void> {
  const key = cacheKey()
  if (key !== loadedFor) {
    charges.value = []
    expenseItems.value = []
    trend.value = []
    loadedFor = key
  }
  loading.value = true
  error.value = ''
  try {
    const [chargeResult, expenseResult, trendResult] = await Promise.all([
      fetchCharges(month.value),
      fetchExpenses(month.value),
      landlordRequest<{ items: TrendPoint[] }>(`/landlord/finance/trend?months=6&month=${month.value}`),
    ])
    if (key !== loadedFor) return
    charges.value = chargeResult.items
    totals.value = chargeResult.totals
    expenseItems.value = expenseResult.items.map(toExpense)
    trend.value = trendResult.items
  } catch (cause) {
    if (key === loadedFor) error.value = cause instanceof Error ? cause.message : '帳務資料讀取失敗'
  } finally {
    if (key === loadedFor) loading.value = false
  }
}

function replaceCharge(updated: LandlordCharge): void {
  const index = charges.value.findIndex((item) => item.id === updated.id)
  if (index >= 0) charges.value[index] = { ...updated, carried: charges.value[index]!.carried }
}

function chargeIdOf(id: string): number {
  return Number(id.replace('charge:', ''))
}

export function useLandlordFinance() {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener(LANDLORD_WORKSPACE_CHANGED_EVENT, () => void load())
  }
  onMounted(() => {
    void load()
  })

  const payments = computed(() => charges.value.filter((item) => !item.voided).map(toPayment))
  const total = computed(() => totals.value.total)
  const received = computed(() => totals.value.received)
  const awaiting = computed(() => totals.value.awaiting)
  const overdue = computed(() => totals.value.overdue)
  const partialReceived = computed(() => totals.value.partial_received)
  const rate = computed(() => totals.value.rate)
  const monthLabel = computed(() => labelFor(month.value))

  async function setMonth(value: string): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(value) || value === month.value) return
    month.value = value
    await load()
  }

  /** 入帳。成功回傳更新後的帳款；失敗丟出後端訊息。 */
  async function recordPayment(id: string, amount: number, method: PaymentMethod = 'other', paidOn?: string, note?: string): Promise<LandlordPayment> {
    const today = new Date()
    const updated = await recordChargePayment(chargeIdOf(id), {
      amount,
      method,
      note,
      paid_on: paidOn || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    })
    replaceCharge(updated)
    await load()
    notifyLandlordWorkspaceUpdated('finance')
    return toPayment(updated)
  }

  async function reversePayment(id: string, paymentId: number, reason: string): Promise<void> {
    replaceCharge(await reverseChargePayment(chargeIdOf(id), paymentId, reason))
    await load()
    notifyLandlordWorkspaceUpdated('finance')
  }

  /** 送站內催繳。租客沒綁定帳號時後端會拒絕，訊息直接顯示給房東。 */
  async function markPaymentReminded(id: string): Promise<void> {
    replaceCharge(await remindCharge(chargeIdOf(id)))
  }

  async function addUtilityCharge(payload: Parameters<typeof createCharge>[0]): Promise<void> {
    await createCharge(payload)
    await load()
    notifyLandlordWorkspaceUpdated('finance')
  }

  async function addExpense(input: { title: string; category: string; amount: number; date: string; note?: string }): Promise<void> {
    await createExpense({ title: input.title, category: input.category, amount: input.amount, spent_on: input.date, note: input.note })
    await load()
    notifyLandlordWorkspaceUpdated('finance')
  }

  async function removeExpense(id: string): Promise<void> {
    await deleteExpense(Number(id.replace('expense:', '')))
    await load()
  }

  return {
    month: readonly(month),
    setMonth,
    payments,
    expenses: expenseItems,
    trend,
    total,
    received,
    awaiting,
    overdue,
    partialReceived,
    rate,
    monthLabel,
    loading: readonly(loading),
    error: readonly(error),
    refresh: load,
    recordPayment,
    reversePayment,
    markPaymentReminded,
    addUtilityCharge,
    addExpense,
    removeExpense,
  }
}

import { getAuthSession } from '@/src/composables/useAuth'
import type { PaymentMethod, RentalContract } from '@/src/utils/dashboard-contract'

const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export interface PaymentRecordPayload {
  paid_at: string
  payment_method: PaymentMethod
  payment_note: string
  payment_proof_name: string | null
}

async function dashboardRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再查看租約。')

  const response = await fetch(`${API_BASE}/dashboard${path}`, {
    method,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `讀取租約資料失敗（${response.status}），請稍後重試。`,
    )
  }
  return response.json() as Promise<T>
}

/** 使用者已存檔的終版租約與每期帳單。沒有租約時回空陣列。 */
export function fetchDashboardContracts(): Promise<RentalContract[]> {
  return dashboardRequest<RentalContract[]>('/contracts')
}

export function recordBillPayment(
  billId: string,
  payload: PaymentRecordPayload,
): Promise<RentalContract['cycles'][number]> {
  return dashboardRequest(`/bills/${billId}/payment`, 'PUT', payload)
}

export function undoBillPayment(billId: string): Promise<RentalContract['cycles'][number]> {
  return dashboardRequest(`/bills/${billId}/payment`, 'DELETE')
}

export function saveBillUtilities(billId: string, payload: import('@/src/utils/utility-billing').UtilityDetails): Promise<RentalContract['cycles'][number]> {
  return dashboardRequest(`/bills/${billId}/utilities`, 'PUT', payload)
}

export function fetchUtilityContext(billId: string): Promise<import('@/src/utils/utility-billing').UtilityContext> {
  return dashboardRequest(`/bills/${billId}/utilities/context`)
}

/** 房東平台租約：回報已繳款（通知房東確認入帳，不會直接標成已繳）。 */
export async function reportLandlordPayment(
  cycleId: string,
  payload: { paid_at: string; payment_method: PaymentMethod; payment_note: string },
): Promise<RentalContract['cycles'][number]> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再回報繳款。')
  const chargeId = cycleId.replace('charge:', '')
  const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')
  const response = await fetch(`${base}/api/tenant/landlord-leases/charges/${chargeId}/report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : `回報失敗（${response.status}），請稍後重試。`)
  }
  return body
}

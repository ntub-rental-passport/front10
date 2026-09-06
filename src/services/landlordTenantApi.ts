import { getAuthSession } from '@/src/composables/useAuth'

export type LeaseStatus =
  | 'occupied'
  | 'expiring'
  | 'expired'
  | 'moved_out'
  | 'pending'
  | 'incomplete'
export type LineStatus = 'unbound' | 'invited' | 'bound' | 'expired'

export interface Completeness {
  basic: boolean
  contact: boolean
  room: boolean
  lease: boolean
  payment: boolean
  line: boolean
  percent: number
}

export interface LandlordTenant {
  id: number
  name: string
  phone: string
  email: string | null
  national_id_masked: string | null
  birth_date: string | null
  contact_address: string | null
  emergency_name: string | null
  emergency_phone: string | null
  notes: string | null
  line_status: LineStatus
  property_id: number | null
  property_name: string | null
  room_id: number | null
  room_number: string | null
  lease_id: number | null
  lease_start: string | null
  lease_end: string | null
  monthly_rent: number
  deposit_amount: number
  payment_day: number | null
  payment_frequency: string | null
  contract_id: string | null
  lease_status: LeaseStatus
  days_left: number | null
  effective: boolean
  completeness: Completeness
  created_at: string
  activity_timeline?: Array<{ kind: string; detail: string; occurred_at: string }>
  history?: Array<{
    id: number
    start_date: string
    end_date: string
    status: string
    property_name: string
    room_number: string
    monthly_rent: number
  }>
}

export interface TenantSummary {
  tenant_count: number
  active_lease_count: number
  expiring_count: number
  deposit_total: number
  monthly_rent_total: number
}

export interface TenantPayload {
  name: string
  phone: string
  email?: string
  national_id?: string
  birth_date?: string
  contact_address?: string
  emergency_name?: string
  emergency_phone?: string
  notes?: string
  property_id?: number
  room_id?: number
  property_name?: string
  room_number?: string
  lease_start: string
  lease_end: string
  monthly_rent: number
  deposit_amount: number
  payment_day: number
  payment_frequency: string
  contract_id?: string
  lease_status: 'pending' | 'active'
}

export interface LeaseUpdatePayload {
  lease_start: string
  lease_end: string
  monthly_rent: number
  deposit_amount: number
  payment_day: number
  payment_frequency: string
  contract_id?: string
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

async function api<T>(path: string, init: FetchInit = {}): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入憑證不存在，請重新登入房東帳號。')
  const response = await fetch(`${API_BASE}/api/landlord/tenants${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  }).catch(() => {
    throw new Error('無法連線到租客管理服務，請確認後端已啟動。')
  })
  const body = (await response.json().catch(() => null)) as (T & { detail?: string }) | null
  if (!response.ok) throw new Error(body?.detail || '租客管理服務發生錯誤。')
  if (body === null) throw new Error('後端沒有回傳資料。')
  return body
}

export function fetchTenants(params: URLSearchParams) {
  return api<{
    items: LandlordTenant[]
    total: number
    page: number
    page_size: number
    filter_counts: Record<string, number>
  }>(`?${params}`)
}
export function fetchTenantSummary() {
  return api<TenantSummary>('/summary')
}
export function fetchTenant(id: number) {
  return api<LandlordTenant>(`/${id}`)
}
export function fetchTenantOptions() {
  return api<{
    properties: Array<{
      id: number
      name: string
      rooms: Array<{ id: number; number: string; status: string }>
    }>
  }>('/options')
}
export function createTenant(payload: TenantPayload) {
  return api<LandlordTenant>('', { method: 'POST', body: JSON.stringify(payload) })
}
export function updateTenant(id: number, payload: TenantPayload) {
  return api<LandlordTenant>(`/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
export function updateTenantLease(id: number, payload: LeaseUpdatePayload) {
  return api<LandlordTenant>(`/${id}/lease`, { method: 'PATCH', body: JSON.stringify(payload) })
}
export function moveOutTenant(id: number, payload: Record<string, unknown>) {
  return api<LandlordTenant>(`/${id}/move-out`, { method: 'POST', body: JSON.stringify(payload) })
}
export function inviteTenantToLine(id: number) {
  return api<{ status: string; invite_url: string; expires_at: string; mock: boolean }>(
    `/${id}/line-invite`,
    { method: 'POST' },
  )
}
export function previewTenantCsv(file: File) {
  const form = new FormData()
  form.append('file', file)
  return api<{
    preview_token: string
    rows: Array<{ row: number; data: Record<string, string>; errors: string[]; valid: boolean }>
    valid_count: number
    error_count: number
  }>('/import/preview', { method: 'POST', body: form })
}
export function confirmTenantCsv(previewToken: string) {
  return api<{
    created_count: number
    error_count: number
    created_ids: number[]
    errors: unknown[]
  }>('/import/confirm', { method: 'POST', body: JSON.stringify({ preview_token: previewToken }) })
}

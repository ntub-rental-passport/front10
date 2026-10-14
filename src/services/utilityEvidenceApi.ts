import { getAuthSession } from '@/src/composables/useAuth'
import { landlordRequest, workspaceHeaders } from '@/src/services/landlordApiClient'

/**
 * 電費對帳（backend/routers/utility_evidence.py）：電表照片、租客回報讀數、房東處理，
 * 以及租客自存合約與房東租約重複時的處理。
 */
export interface UtilityEvidence {
  id: number
  charge_id: number
  kind: 'meter_photo' | 'tenant_reading' | 'payment_proof' | 'charge_dispute'
  role: 'landlord' | 'tenant'
  reading: number | null
  /** 異議：租客主張的金額 */
  amount: number | null
  has_photo: boolean
  note: string
  status: 'open' | 'accepted' | 'kept'
  response: string
  resolved_at: string | null
  created_at: string
}

export interface OverlappingRental {
  rental_id: number
  title: string
  address: string
  start: string
  end: string
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')

function tenantHeaders(): Record<string, string> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入租客帳號。')
  return { Authorization: `Bearer ${token}` }
}

async function tenantRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/api/tenant/landlord-leases${path}`, {
    method,
    headers: { ...tenantHeaders(), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : `操作失敗（${response.status}），請稍後重試。`)
  }
  return body as T
}

/** 讀照片要帶登入憑證，<img src> 帶不了，所以先取回 Blob 再給網址。用完記得 revoke。 */
async function photoUrl(url: string, headers: Record<string, string>): Promise<string> {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error('照片讀取失敗')
  return URL.createObjectURL(await response.blob())
}

// ---------- 租客 ----------

export function reportMeterReading(chargeId: number, payload: { reading: number; note: string; photo?: { name: string; data: string } }) {
  return tenantRequest<UtilityEvidence>(`/charges/${chargeId}/reading`, 'POST', payload)
}

export function tenantEvidencePhotoUrl(evidenceId: number) {
  return photoUrl(`${API_BASE}/api/tenant/landlord-leases/evidence/${evidenceId}/photo`, tenantHeaders())
}


// ---------- 房東 ----------

export function addMeterPhoto(chargeId: number, name: string, data: string) {
  return landlordRequest<UtilityEvidence>(`/landlord/finance/charges/${chargeId}/meter-photos`, 'POST', { name, data })
}

export function resolveTenantReading(evidenceId: number, action: 'accept' | 'keep', response: string) {
  return landlordRequest<{ evidence: UtilityEvidence; amount: number }>(
    `/landlord/finance/evidence/${evidenceId}/resolve`, 'POST', { action, response },
  )
}

export function landlordEvidencePhotoUrl(evidenceId: number) {
  const token = getAuthSession()?.accessToken
  if (!token) return Promise.reject(new Error('請先登入房東帳號。'))
  return photoUrl(`${API_BASE}/api/landlord/finance/evidence/${evidenceId}/photo`, {
    Authorization: `Bearer ${token}`,
    ...workspaceHeaders(),
  })
}

// ---------- 自存合約 ↔ 房東租約對照（backend/routers/contract_links.py） ----------

export interface TermDifference {
  field: string
  label: string
  contract: string | number
  landlord: string | number
}

export interface TermChange {
  at: string
  by: number | null
  changes: { field: string; label: string; before: string | number | null; after: string | number | null }[]
}

export interface ContractLink {
  linked: boolean
  rental_id?: number
  contract_title?: string
  contract_terms?: {
    rent: number
    deposit: number
    start: string
    end: string
    payment_day: number
    frequency: string
    electricity: string | null
  } | null
  differences?: TermDifference[]
  landlord_note?: string
  landlord_noted_at?: string | null
  term_history?: TermChange[]
  linked_at?: string
  candidates?: OverlappingRental[]
}

export interface ChargeMismatch {
  label: string
  contract: number
  landlord: number
  chargeId?: number
  chargeTitle?: string
}

export function fetchContractLink(leaseId: number) {
  return tenantRequest<ContractLink>(`/${leaseId}/link`)
}

export function linkOwnContract(leaseId: number, rentalId: number) {
  return tenantRequest<ContractLink>(`/${leaseId}/link`, 'POST', { rental_id: rentalId })
}

export function unlinkOwnContract(leaseId: number) {
  return tenantRequest<{ linked: false }>(`/${leaseId}/link`, 'DELETE')
}

export function disputeCharge(chargeId: number, amount: number, note: string) {
  return tenantRequest<UtilityEvidence>(`/charges/${chargeId}/dispute`, 'POST', { amount, note })
}

export function fetchLandlordContractLink(leaseId: number) {
  return landlordRequest<ContractLink>(`/landlord/contracts/${leaseId}/tenant-contract`)
}

export function saveLandlordLinkNote(leaseId: number, note: string) {
  return landlordRequest<ContractLink>(`/landlord/contracts/${leaseId}/tenant-contract/note`, 'PUT', { note })
}

import { getAuthSession } from '@/src/composables/useAuth'
import type { RentalPayload } from '@/src/utils/contract-rental-payload'

const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

/**
 * ⚠️ 只送攤平後的欄位。合約原始檔、OCR 全文、風險報告一律不上傳：
 * 全文含所有個資，存成明文會抵銷 rentals 加密欄位的保護。
 * 使用者要看契約時由這些欄位回拼（shared/contract-document.js）。
 */
export interface FinalizeContractRequest {
  /** 使用者明確勾選「這是最終簽署版」才會是 true；後端只接受 true。 */
  is_final: boolean
  rental: RentalPayload
  /** 契約別名，方便使用者在點交、帳單等頁面辨識這份租約。 */
  contract_tag?: string | null
  review_id?: string
}

export interface FinalizeContractResponse {
  rental_id: number
  confirmed_at: string
  encrypted_field_count: number
}

export interface StoredContractSummary {
  rental_id: number
  contract_tag: string | null
  address: string
  start_date: string
  end_date: string
  confirmed_at: string | null
}

export interface StoredContractDocument {
  rental_id: number
  contract_tag: string | null
  confirmed_at: string | null
  /** 個資欄位已由後端解密成字串。 */
  rental: Partial<RentalPayload>
}

async function contractRequest<T>(path: string): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再檢視契約。')

  const response = await fetch(`${API_BASE}/contract${path}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `讀取契約失敗（${response.status}），請稍後重試。`,
    )
  }
  return response.json() as Promise<T>
}

export function listStoredContracts(): Promise<StoredContractSummary[]> {
  return contractRequest<StoredContractSummary[]>('/rentals')
}

export function readStoredContract(rentalId: number): Promise<StoredContractDocument> {
  return contractRequest<StoredContractDocument>(`/rentals/${rentalId}/document`)
}

export async function finalizeContract(
  payload: FinalizeContractRequest,
): Promise<FinalizeContractResponse> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再存檔契約。')

  const response = await fetch(`${API_BASE}/contract/finalize`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `契約存檔失敗（${response.status}），請稍後重試。`,
    )
  }
  return response.json() as Promise<FinalizeContractResponse>
}

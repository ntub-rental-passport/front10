import { getAuthSession } from '@/src/composables/useAuth'
import type { NewRepairTicket, RepairTicket, RepairTimelineItem } from '@/src/composables/useRepairTickets'
import type { RepairPhotoRef } from './repairMediaStore'
import type { RepairPhotoPurpose } from '@/src/utils/repair-uploads'

const base = (import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export type RepairSide = 'tenant' | 'landlord'
function endpoint(side: RepairSide): string { return `${base}${side === 'landlord' ? '/landlord' : ''}/repairs` }
export function repairAuthHeaders(): Record<string, string> {
  const token = getAuthSession()?.accessToken
  return token ? { Authorization: `Bearer ${token}` } : {}
}
// 這裡不用 DOM 的 RequestInit：它是純型別，eslint 的 no-undef 在 .ts 檔會把它當成未定義的變數。
type FetchInit = { method?: string; body?: FormData | string; headers?: Record<string, string> }

async function request<T>(url: string, init: FetchInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'include', headers: { ...repairAuthHeaders(), ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers } }).catch(() => { throw new Error('讀不到報修服務，請確認連線後重試。') })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : '報修操作失敗，請稍後重試。')
  if (body === null) throw new Error('報修服務沒有回傳資料。')
  return body as T
}
export function fetchRepairs(side: RepairSide) { return request<{ items: RepairTicket[] }>(endpoint(side)) }
export function fetchRepair(side: RepairSide, id: string) { return request<RepairTicket>(`${endpoint(side)}/${encodeURIComponent(id)}`) }
export function postRepair(input: NewRepairTicket) { return request<RepairTicket>(endpoint('tenant'), { method: 'POST', body: JSON.stringify(input) }) }
export function patchRepair(side: RepairSide, id: string, updates: Partial<RepairTicket>, event?: Pick<RepairTimelineItem, 'title' | 'detail'>) { return request<RepairTicket>(`${endpoint(side)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ updates, event }) }) }
export function uploadRepairFile(side: RepairSide, id: string, file: File, purpose: RepairPhotoPurpose) {
  const body = new FormData()
  body.append('file', file)
  body.append('purpose', purpose)
  return request<RepairPhotoRef>(`${endpoint(side)}/${encodeURIComponent(id)}/photos`, { method: 'POST', body })
}
export async function readRepairFile(url: string): Promise<string> {
  if (!url.startsWith('/api/repairs/photos/')) throw new Error('報修附件網址不正確。')
  const resolved = `${base}${url.slice(4)}`
  const response = await fetch(resolved, { credentials: 'include', headers: repairAuthHeaders() })
  if (!response.ok) throw new Error('讀不到報修附件，請重新讀取。')
  return URL.createObjectURL(await response.blob())
}

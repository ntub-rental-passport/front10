import { getAuthSession } from '@/src/composables/useAuth'
import type { RepairTicket } from '@/src/composables/useRepairTickets'
import type { TenantLeaseOption } from '@/src/services/tenantLeaseApi'

const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export type RepairPhotoStage = 'supplement' | 'completion' | 'unresolved' | 'receipt'

export interface RepairTarget extends TenantLeaseOption {
  /** lease：房東在平台上，房東端可處理；rental：自己存檔的租約，工單即存證紀錄。 */
  kind: 'lease' | 'rental'
}

interface UploadItem {
  name: string
  data: string
}

async function repairRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再使用報修功能。')

  const response = await fetch(`${API_BASE}/repairs${path}`, {
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
      typeof body?.detail === 'string' ? body.detail : `報修操作失敗（${response.status}），請稍後重試。`,
    )
  }
  return response.json() as Promise<T>
}

/** 租客可報修的對象：房東平台上的租約，加上自己存檔的終版契約。 */
export async function fetchRepairTargets(): Promise<RepairTarget[]> {
  return (await repairRequest<{ items: RepairTarget[] }>('/targets')).items
}

export async function fetchRepairTickets(): Promise<RepairTicket[]> {
  return (await repairRequest<{ items: RepairTicket[] }>('')).items
}

export function createRepairTicket(payload: {
  target: string
  location: string
  equipment: string
  description: string
  urgency: RepairTicket['urgency']
  availableTime: string
  accessPermission: RepairTicket['accessPermission']
  phone: string
  photos: UploadItem[]
}): Promise<RepairTicket> {
  return repairRequest<RepairTicket>('', 'POST', payload)
}

export function patchRepairTicket(
  id: string,
  payload: {
    updates: Record<string, unknown>
    event: { title: string; detail?: string }
    photos: UploadItem[]
    photoStage: RepairPhotoStage | null
  },
): Promise<RepairTicket> {
  return repairRequest<RepairTicket>(`/${id}`, 'PATCH', payload)
}

export function markRepairRead(id: string): Promise<RepairTicket> {
  return repairRequest<RepairTicket>(`/${id}/read`, 'POST')
}

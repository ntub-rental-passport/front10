import { adminRequest, API_BASE_URL } from './adminHttp'
import { getAuthSession } from '@/src/composables/useAuth'

export type CanonicalRepairStatus = 'new' | 'acknowledged' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
export interface AdminRepairMedia {
  id: string
  name: string
  type: string
  size: number
  url: string
  purpose?: string
}
export interface AdminRepairRecord {
  id: string
  ticketNo: string
  canonicalStatus: CanonicalRepairStatus
  status: string
  tenantUserId: string
  landlordUserId: string
  tenant: string
  landlord: string
  address: string
  location: string
  equipment: string
  description: string
  createdAt: string
  updatedAt: string
  notifiedAt?: string | null
  landlordReadAt?: string | null
  firstResponseAt?: string | null
  completedAt?: string | null
  awaitingInspection?: boolean
  adminNote?: string
  interventionRequested?: boolean
  manuallyQueued?: boolean
  responsibilityAgreement?: string
  responsibilityQuestion?: string
  completionNote?: string
  unresolvedNote?: string
  estimatedCost?: number | null
  actualCost?: number | null
  payer?: string
  vendorName?: string
  scheduledAt?: string
  photos: AdminRepairMedia[]
  completionPhotos?: AdminRepairMedia[]
  unresolvedPhotos?: AdminRepairMedia[]
  receipt?: AdminRepairMedia | null
  quote?: AdminRepairMedia | null
  supplements?: { note: string; photos: AdminRepairMedia[] }[]
  timeline: { id: string; at: string; title: string; detail?: string; actorRole?: string }[]
}

export function fetchAdminRepairs(): Promise<{ items: AdminRepairRecord[] }> {
  return adminRequest('/admin/repairs')
}
export function patchAdminRepair(id: string, updates: { adminNote?: string; interventionRequested?: boolean; manuallyQueued?: boolean }): Promise<AdminRepairRecord> {
  return adminRequest(`/admin/repairs/${encodeURIComponent(id)}`, { method: 'PATCH', body: { updates } })
}

/** 管理員照片端點需要 Bearer，不能直接把受保護網址放進 img。 */
export async function fetchAdminRepairMedia(media: AdminRepairMedia): Promise<Blob> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入已失效，請重新登入。')
  const response = await fetch(`${API_BASE_URL}/repairs/photos/${encodeURIComponent(media.id)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  })
  if (!response.ok) throw new Error('讀不到附件，請重新登入或稍後再試。')
  return response.blob()
}

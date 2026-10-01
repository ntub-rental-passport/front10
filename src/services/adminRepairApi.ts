/**
 * 後台的報修工單（backend/routers/admin_repairs_api.py）。
 *
 * 工單本體與租客、房東端共用同一份資料（backend/routers/repairs.py），後台這支
 * 只多給三件事：房東是誰、房東何時讀到、以及管理員自己的內部註記與旗標。
 * 工單的狀態與內容不從後台改——那是租客與房東的流程。
 */
import { adminRequest, API_BASE_URL } from './adminHttp'
import { getAuthSession } from '@/src/composables/useAuth'

/** 後端存的狀態，三端共用同一組值 */
export type RepairStatusValue = 'pending' | 'processing' | 'inspection' | 'completed' | 'canceled'

export interface AdminRepairMedia {
  id: string
  name: string
  type: string
  size: number
  /** report（報修當下）、supplement（補件）、completion（完工）、unresolved（未解決）、receipt（收據） */
  stage?: string
}

export interface AdminRepairRecord {
  /** 資料表的流水號，要改東西時用它 */
  id: string
  /** 對外的案件編號（R-20260930-0003），畫面與電話裡講的都是這個 */
  ticketNo: string
  code: string
  status: RepairStatusValue
  tenantUserId: string
  landlordUserId: string
  tenant: string
  landlord: string
  address: string
  property: string
  room: string
  location: string
  equipment: string
  description: string
  urgency: string
  createdAt: string
  updatedAt: string
  landlordRead: boolean
  landlordReadAt?: string | null
  completedAt?: string | null
  adminNote: string
  interventionRequested: boolean
  manuallyQueued: boolean
  responsibility: string
  responsibilityNote?: string
  responsibilityAgreement?: string
  responsibilityQuestion?: string
  completionNote?: string
  unresolvedNote?: string
  estimatedCost?: number | null
  actualCost?: number | null
  payer?: string
  vendorName?: string
  vendorPhone?: string
  scheduledAt?: string
  /** 房東不在平台上的工單（租客自己存的契約），後台只能看 */
  selfManaged?: boolean
  photos: AdminRepairMedia[]
  completionPhotos?: AdminRepairMedia[]
  unresolvedPhotos?: AdminRepairMedia[]
  receipt?: AdminRepairMedia | null
  supplements?: { id: string; at: string; note: string; photos: AdminRepairMedia[] }[]
  timeline: { id: string; at: string; title: string; detail?: string | null; actorRole?: string }[]
}

export function fetchAdminRepairs(): Promise<{ items: AdminRepairRecord[] }> {
  return adminRequest('/admin/repairs')
}

/** 只改得動管理員自己的註記與旗標；送別的欄位後端會回 400。 */
export function patchAdminRepair(
  id: string,
  updates: { adminNote?: string; interventionRequested?: boolean; manuallyQueued?: boolean },
): Promise<AdminRepairRecord> {
  return adminRequest(`/admin/repairs/${encodeURIComponent(id)}`, { method: 'PATCH', body: { updates } })
}

/**
 * 附件要 Bearer 才讀得到，不能直接把網址放進 img。
 * 端點在工單底下（routers/repairs.py），所以要同時給工單與附件的 id。
 */
export async function fetchAdminRepairMedia(ticketId: string, media: AdminRepairMedia): Promise<Blob> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入已失效，請重新登入。')
  const response = await fetch(
    `${API_BASE_URL}/repairs/${encodeURIComponent(ticketId)}/photos/${encodeURIComponent(media.id)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!response.ok) throw new Error('讀不到附件，請重新登入或稍後再試。')
  return response.blob()
}

import type { MaintenanceCategory, MaintenanceStatus } from '@/src/utils/admin-maintenance'

export interface MaintenanceEvent {
  at: string
  actor: string
  from: MaintenanceStatus | null
  to: MaintenanceStatus
  note: string
}

export interface MaintenanceTicket {
  id: string
  address: string
  tenantUserId: string
  landlordUserId: string
  category: MaintenanceCategory
  description: string
  status: MaintenanceStatus
  createdAt: string
  notifiedAt: string | null
  firstResponseAt: string | null
  completedAt: string | null
  timeline: MaintenanceEvent[]
  adminNote: string
  /** 租客或房東主動要求平台介入，不是管理員自己判斷的 */
  interventionRequested: boolean
  /** 管理員手動把工單拉進待處理佇列，用於分流以外的個別情況 */
  manuallyQueued: boolean
}


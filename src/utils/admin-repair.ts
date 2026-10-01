import type { AdminRepairRecord, RepairStatusValue } from '@/src/services/adminRepairApi'
import type { MaintenanceTicket } from '@/src/types/admin-maintenance'
import type { MaintenanceCategory, MaintenanceStatus } from './admin-maintenance'
import { elapsedDays, isInAdminQueue } from './admin-maintenance'

export type RepairAdminTab = 'queue' | 'all' | 'pending' | 'processing' | 'overdue' | 'disputed' | 'done'
export interface RealMaintenanceTicket extends MaintenanceTicket {
  /** 資料表的流水號；畫面上的 id 是案件編號，改東西時要用這個 */
  recordId: string
  canonicalStatus: RepairStatusValue
  overdue: boolean
  disputed: boolean
  awaitingInspection: boolean
  tenantName: string
  landlordName: string
  elapsed: number
  lastUpdatedAt: string
  source: AdminRepairRecord
}
/**
 * 後端的狀態 → 後台的說法。後端只有五種（三端共用），後台多出來的「已通報房東」
 * 靠房東有沒有讀過區分，不是另一個存起來的狀態。
 */
function statusOf(record: AdminRepairRecord): MaintenanceStatus {
  switch (record.status) {
    case 'pending': return record.landlordRead ? 'notified' : 'submitted'
    case 'processing':
    case 'inspection': return 'in_progress'
    case 'completed': return 'completed'
    case 'canceled': return 'closed'
  }
}

/** 房東還沒開始處理、而且超過門檻才算逾期；調高門檻就會解除。 */
export function isRepairOverdue(status: RepairStatusValue, createdAt: string, threshold: number, now = new Date()): boolean {
  return status === 'pending' && Number.isFinite(threshold) && threshold > 0 &&
    now.getTime() - new Date(createdAt).getTime() > threshold * 86_400_000
}
function categoryOf(record: AdminRepairRecord): MaintenanceCategory {
  const text = `${record.equipment} ${record.description}`
  if (/漏水|滲水/.test(text)) return 'leak'
  if (/冷氣|冰箱|熱水器|電器|洗衣/.test(text)) return 'appliance'
  if (/門鎖|電子鎖/.test(text)) return 'lock'
  if (/管線|水管|排水|馬桶/.test(text)) return 'pipe'
  return 'other'
}
export function repairToMaintenance(record: AdminRepairRecord, threshold: number, now = new Date()): RealMaintenanceTicket {
  return {
    id: record.ticketNo || record.id, recordId: record.id, address: record.address,
    tenantUserId: String(record.tenantUserId), landlordUserId: String(record.landlordUserId),
    tenantName: record.tenant || String(record.tenantUserId), landlordName: record.landlord || String(record.landlordUserId),
    category: categoryOf(record), description: record.description, status: statusOf(record),
    canonicalStatus: record.status, createdAt: record.createdAt,
    notifiedAt: record.landlordReadAt ?? null,
    firstResponseAt: record.landlordReadAt ?? null, completedAt: record.completedAt ?? null,
    // 真實時間軸由 source 呈現，不編造不存在的狀態轉換。
    timeline: [], adminNote: record.adminNote ?? '',
    interventionRequested: record.interventionRequested ?? false, manuallyQueued: record.manuallyQueued ?? false,
    overdue: isRepairOverdue(record.status, record.createdAt, threshold, now),
    disputed: record.responsibilityAgreement === 'questioned' || Boolean(record.interventionRequested),
    awaitingInspection: record.status === 'inspection',
    elapsed: elapsedDays(record.createdAt, now), lastUpdatedAt: record.updatedAt, source: record,
  }
}
export function repairMatchesTab(ticket: RealMaintenanceTicket, tab: RepairAdminTab): boolean {
  switch (tab) {
    case 'all': return true
    case 'queue': return isInAdminQueue(ticket)
    case 'pending': return ticket.canonicalStatus === 'pending'
    case 'processing': return ticket.canonicalStatus === 'processing' || ticket.canonicalStatus === 'inspection'
    case 'overdue': return ticket.overdue
    case 'disputed': return ticket.disputed
    case 'done': return ticket.canonicalStatus === 'completed' || ticket.canonicalStatus === 'canceled'
  }
}

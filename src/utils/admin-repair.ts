import type { AdminRepairRecord, CanonicalRepairStatus } from '@/src/services/adminRepairApi'
import type { MaintenanceTicket } from '@/src/types/admin-maintenance'
import type { MaintenanceCategory, MaintenanceStatus } from './admin-maintenance'
import { elapsedDays, isInAdminQueue } from './admin-maintenance'

export type RepairAdminTab = 'queue' | 'all' | 'pending' | 'processing' | 'overdue' | 'disputed' | 'done'
export interface RealMaintenanceTicket extends MaintenanceTicket {
  canonicalStatus: CanonicalRepairStatus
  overdue: boolean
  disputed: boolean
  awaitingInspection: boolean
  tenantName: string
  landlordName: string
  elapsed: number
  lastUpdatedAt: string
  source: AdminRepairRecord
}
const statusMap: Record<CanonicalRepairStatus, MaintenanceStatus> = {
  new: 'submitted', acknowledged: 'notified', scheduled: 'in_progress',
  in_progress: 'in_progress', completed: 'completed', cancelled: 'closed',
}

/** 用經過的時間判斷，兩端都嚴格超過門檻才算逾期；調高門檻就會解除。 */
export function isRepairOverdue(status: CanonicalRepairStatus, createdAt: string, threshold: number, now = new Date()): boolean {
  return (status === 'new' || status === 'acknowledged') && Number.isFinite(threshold) && threshold > 0 &&
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
    id: record.ticketNo || record.id, address: record.address,
    tenantUserId: String(record.tenantUserId), landlordUserId: String(record.landlordUserId),
    tenantName: record.tenant || String(record.tenantUserId), landlordName: record.landlord || String(record.landlordUserId),
    category: categoryOf(record), description: record.description, status: statusMap[record.canonicalStatus],
    canonicalStatus: record.canonicalStatus, createdAt: record.createdAt,
    notifiedAt: record.notifiedAt ?? record.landlordReadAt ?? null,
    firstResponseAt: record.firstResponseAt ?? null, completedAt: record.completedAt ?? null,
    // 真實時間軸由 source 呈現，不編造不存在的狀態轉換。
    timeline: [], adminNote: record.adminNote ?? '',
    interventionRequested: record.interventionRequested ?? false, manuallyQueued: record.manuallyQueued ?? false,
    overdue: isRepairOverdue(record.canonicalStatus, record.createdAt, threshold, now),
    disputed: record.responsibilityAgreement === 'questioned' || Boolean(record.interventionRequested),
    awaitingInspection: record.awaitingInspection ?? record.status === 'inspection',
    elapsed: elapsedDays(record.createdAt, now), lastUpdatedAt: record.updatedAt, source: record,
  }
}
export function repairMatchesTab(ticket: RealMaintenanceTicket, tab: RepairAdminTab): boolean {
  switch (tab) {
    case 'all': return true
    case 'queue': return isInAdminQueue(ticket)
    case 'pending': return ticket.canonicalStatus === 'new' || ticket.canonicalStatus === 'acknowledged'
    case 'processing': return ticket.canonicalStatus === 'scheduled' || ticket.canonicalStatus === 'in_progress'
    case 'overdue': return ticket.overdue
    case 'disputed': return ticket.disputed
    case 'done': return ticket.canonicalStatus === 'completed' || ticket.canonicalStatus === 'cancelled'
  }
}

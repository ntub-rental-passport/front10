/**
 * 使用者詳情頁的押金對帳、點交存證，把真實帳號（後端）與展示帳號（瀏覽器裡的
 * 示範資料）整理成同一種形狀，畫面只有一條路徑。純邏輯，不依賴 Vue。
 */
import { depositGap, depositMatchOf } from './admin-deposit'
import type { HandoverItem } from './admin-handover'
import type { CaseSide, UserDepositView } from './admin-user-directory'
import type { HandoverRecord } from '@/src/mocks/admin/handover'

/** 後端 GET /api/admin/users/{id}/records 的押金紀錄（backend/admin/user_records.py） */
export interface RealDepositRecord {
  id: string
  side: CaseSide
  address: string
  startDate: string
  endDate: string
  monthlyRent: number
  landlordDeclared: number
  /** 租客沒有帳號、沒存合約，或存的是別段期間的合約時為 null */
  tenantDeclared: number | null
  landlordId: number
  tenantId: number | null
}

export interface HandoverView {
  id: string
  side: CaseSide
  address: string
  /** 最後一次拍照或比對的時間 */
  updatedAt: string
  items: HandoverItem[]
}

export interface UserRecords {
  deposits: RealDepositRecord[]
  handovers: HandoverView[]
}

/** 真實帳號的押金紀錄 → 詳情頁表格的一列（跟展示資料同一種） */
export function realDepositView(record: RealDepositRecord): UserDepositView {
  return {
    id: record.id,
    address: record.address,
    // 跟 realAccountToRow 同一套 id，之後要連到對方的詳情頁可以直接用
    landlordUserId: `real-${record.landlordId}`,
    tenantUserId: record.tenantId === null ? null : `real-${record.tenantId}`,
    monthlyRent: record.monthlyRent,
    landlordDeclared: record.landlordDeclared,
    tenantDeclared: record.tenantDeclared,
    side: record.side,
    match: depositMatchOf(record.landlordDeclared, record.tenantDeclared),
    gap: depositGap(record.landlordDeclared, record.tenantDeclared),
  }
}

/** 展示帳號：同一份點交掛在房東與租客兩邊，依這個人的身分各列一次 */
export function demoHandoverViews(records: HandoverRecord[], userId: string): HandoverView[] {
  return records.flatMap((record) => {
    const { id, address, updatedAt, items } = record
    const sides: CaseSide[] = []
    if (record.tenantUserId === userId) sides.push('tenant')
    if (record.landlordUserId === userId) sides.push('landlord')
    return sides.map((side) => ({ id: `${id}-${side}`, side, address, updatedAt, items }))
  })
}

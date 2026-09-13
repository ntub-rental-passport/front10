/**
 * 押金對帳。純邏輯，不依賴 Vue。
 *
 * 只比對租約雙方各自聲明的金額，不判定押金上限等法規問題 —— 那不在系統管轄範圍。
 */

export type DepositMatch = 'matched' | 'mismatched' | 'pending'

export const depositMatchLabels: Record<DepositMatch, string> = {
  matched: '金額相符',
  mismatched: '金額不符',
  pending: '租客未聲明',
}

/** 租客尚未聲明時視為 pending，不算不符 —— 那是還沒填，不是對不起來 */
export function depositMatchOf(
  landlordDeclared: number,
  tenantDeclared: number | null,
): DepositMatch {
  if (tenantDeclared === null) return 'pending'
  return landlordDeclared === tenantDeclared ? 'matched' : 'mismatched'
}

/** 雙方聲明的差額。相符或租客未聲明時為 0 */
export function depositGap(landlordDeclared: number, tenantDeclared: number | null): number {
  if (tenantDeclared === null) return 0
  return Math.abs(landlordDeclared - tenantDeclared)
}

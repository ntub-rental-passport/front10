import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { seedDepositRecords, type DepositRecord } from '@/src/mocks/admin-seed'
import { depositMatchOf } from '@/src/utils/admin-deposit'

/**
 * 押金對帳記錄。
 *
 * 後台沒有獨立的押金頁，記錄只在使用者詳情裡以雙方聲明的形式呈現；
 * 平台不經手金流，因此這裡沒有任何寫入操作。
 */
export const adminDepositCollection = createAdminCollection<DepositRecord[]>(
  'deposit-records',
  seedDepositRecords,
)
const records = adminDepositCollection

export interface DepositStats {
  /** 房東聲明已收金額的加總 */
  declaredTotal: number
  mismatchedCount: number
  pendingCount: number
}

export function useAdminDeposits() {
  const stats = computed<DepositStats>(() => {
    let declaredTotal = 0
    let mismatchedCount = 0
    let pendingCount = 0

    for (const record of records.value) {
      declaredTotal += record.landlordDeclared
      const match = depositMatchOf(record.landlordDeclared, record.tenantDeclared)
      if (match === 'mismatched') mismatchedCount += 1
      if (match === 'pending') pendingCount += 1
    }

    return { declaredTotal, mismatchedCount, pendingCount }
  })

  return { records, stats }
}

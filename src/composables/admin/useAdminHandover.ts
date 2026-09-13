import { createAdminCollection } from './useAdminStore'
import { seedHandoverRecords, type HandoverRecord } from '@/src/mocks/admin-seed'
import { ADMIN_DATASET_VERSION } from '@/src/utils/admin-collection-migrate'

/**
 * 點交存證。
 *
 * 後台對點交沒有任何寫入操作 —— 判定是房東與租客各自在使用者端做的，
 * 管理員能做的是看出哪幾項對不起來，然後線下協調。
 * 所以這裡只有讀取，跟押金對帳一樣。
 */
export const adminHandoverCollection = createAdminCollection<HandoverRecord[]>(
  `handover-records-${ADMIN_DATASET_VERSION}`,
  seedHandoverRecords,
)

export function useAdminHandover() {
  return { records: adminHandoverCollection }
}

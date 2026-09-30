import { createAdminCollection } from './useAdminStore'
import { seedHandoverRecords, type HandoverRecord } from '@/src/mocks/admin-seed'
import { ADMIN_DATASET_VERSION, discardLegacy } from '@/src/utils/admin-collection-migrate'

/**
 * 展示帳號的點交存證。真實帳號的點交從後端讀（adminUserRecordsApi.ts），不用這份。
 *
 * 後台對點交沒有任何寫入操作 —— 照片與 AI 比對都是租客在使用者端做的，
 * 管理員能做的是看出哪幾項有損壞，然後線下協調。
 *
 * 2026-09-30 從「房東認定／租客認定」改成 AI 比對結果：瀏覽器裡存的是舊格式
 * （沒有 updatedAt）就整批重產。
 */
export const adminHandoverCollection = createAdminCollection<HandoverRecord[]>(
  `handover-records-${ADMIN_DATASET_VERSION}`,
  seedHandoverRecords,
  discardLegacy(seedHandoverRecords, 'updatedAt'),
)

export function useAdminHandover() {
  return { records: adminHandoverCollection }
}

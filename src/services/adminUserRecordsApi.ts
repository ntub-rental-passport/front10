/**
 * 使用者詳情的押金對帳與點交存證（backend/routers/admin_user_records_api.py）。
 * 只有真實帳號有；展示帳號用瀏覽器裡的示範資料。
 */
import type { UserRecords } from '@/src/utils/admin-user-records'
import { adminRequest } from './adminHttp'

/** 讀不到回 null：畫面要分得出「讀不到」和「真的沒有」 */
export async function fetchUserRecords(accountId: number): Promise<UserRecords | null> {
  try {
    return await adminRequest<UserRecords>(`/admin/users/${accountId}/records`)
  } catch {
    return null
  }
}

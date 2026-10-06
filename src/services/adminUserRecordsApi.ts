/**
 * 全站押金、使用者詳情的押金對帳與點交存證（backend/routers/admin_user_records_api.py）。
 * 只有真實帳號有；展示帳號用瀏覽器裡的示範資料。
 */
import type { RealDepositRecord, UserRecords } from '@/src/utils/admin-user-records'
import { adminRequest } from './adminHttp'

/** 全站押金沒有單一使用者的身分欄位，供統計與帳號關聯共用。 */
export type AdminDepositRecord = Omit<RealDepositRecord, 'side'>

/** 讀不到回 null，避免把展示資料誤當成全站統計。 */
export async function fetchAdminDeposits(): Promise<{ deposits: AdminDepositRecord[] } | null> {
  try {
    return await adminRequest<{ deposits: AdminDepositRecord[] }>('/admin/deposits')
  } catch {
    return null
  }
}

/** 讀不到回 null：畫面要分得出「讀不到」和「真的沒有」 */
export async function fetchUserRecords(accountId: number): Promise<UserRecords | null> {
  try {
    return await adminRequest<UserRecords>(`/admin/users/${accountId}/records`)
  } catch {
    return null
  }
}

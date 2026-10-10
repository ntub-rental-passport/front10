import type { SystemSettings } from '@/src/mocks/admin/settings'
import type { PlanFeatureKey } from '@/src/utils/admin-entitlements'
import type { FeatureOutage, PublicFeatureOutage } from '@/src/utils/admin-feature-status'
import { adminRequest, publicGet } from './adminHttp'

/**
 * 平台設定的 API，全部存在後端、所有管理員看同一份：
 *
 * - 安全設定（backend/admin/platform_settings.py）：密碼最短長度與登入有效時間，
 *   登入與註冊真的照著做。
 * - 系統設定頁的其他欄位與功能停用（backend/admin/site_settings.py）：網站名稱、
 *   維護模式、各種提醒門檻。
 * - 公開設定：每個頁面換頁時讀（見 usePublicSettings），只有畫面上本來就會顯示的值。
 */

/** 讀不到後端時的退路，要跟後端的預設值一致 */
export const DEFAULT_PASSWORD_MIN_LENGTH = 8
export const DEFAULT_PASSWORD_MAX_LENGTH = 128

export interface PublicMaintenance {
  mode: boolean
  message: string
  /** datetime-local 格式（YYYY-MM-DDTHH:mm），空字串代表沒排時間 */
  startsAt: string
  endsAt: string
}

export interface PublicSettings {
  passwordMinLength: number
  passwordMaxLength: number
  siteName: string
  supportEmail: string
  maintenance: PublicMaintenance
  /** 這位訪客在維護白名單上（後端看登入的 cookie 判斷，名單本身不公開） */
  maintenanceBypass: boolean
  featureOutages: PublicFeatureOutage[]
}

/** 讀不到後端時用：沒有維護、沒有停用。後端掛了不該連首頁都打不開 */
export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  passwordMinLength: DEFAULT_PASSWORD_MIN_LENGTH,
  passwordMaxLength: DEFAULT_PASSWORD_MAX_LENGTH,
  siteName: 'RentMate 租隊友',
  supportEmail: 'rentmate.software@gmail.com',
  maintenance: { mode: false, message: '', startsAt: '', endsAt: '' },
  maintenanceBypass: false,
  featureOutages: [],
}

export interface AdminPlatformSettings {
  passwordMinLength: number
  passwordMinLengthRange: [number, number]
  passwordMaxLength: number
  sessionMinutes: number
  sessionMinuteOptions: number[]
  /** 管理員的登入期限，固定、不受設定影響 */
  adminSessionMinutes: number
  /** 管理員閒置多久自動登出（伺服器判斷） */
  adminIdleMinutes: number
  defaults: { passwordMinLength: number; sessionMinutes: number }
}

export interface PlatformSettingsChanges {
  passwordMinLength?: number
  sessionMinutes?: number
}

/** 不需登入；讀不到回 null，由呼叫端用預設值（後端送出時還會再檢查一次） */
export function fetchPublicSettings(): Promise<PublicSettings | null> {
  return publicGet<PublicSettings>('/settings/public')
}

/* -------------------- 安全設定 -------------------- */

export async function fetchAdminPlatformSettings(): Promise<AdminPlatformSettings | null> {
  try {
    return await adminRequest<AdminPlatformSettings>('/admin/settings')
  } catch {
    return null
  }
}

/** 失敗時丟出後端給的理由（例如「密碼最短長度必須介於 8 到 64 個字元」），畫面原樣顯示 */
export function updateAdminPlatformSettings(changes: PlatformSettingsChanges): Promise<AdminPlatformSettings> {
  return adminRequest<AdminPlatformSettings>('/admin/settings', { method: 'PUT', body: changes })
}

/* -------------------- 系統設定頁的其他欄位 -------------------- */

/** 讀不到回 null：畫面要分得出「讀不到」和「讀到預設值」 */
export async function fetchAdminSiteSettings(): Promise<SystemSettings | null> {
  try {
    return await adminRequest<SystemSettings>('/admin/site-settings')
  } catch {
    return null
  }
}

/** 只送有改的欄位；回傳存好之後的完整設定。失敗時丟出後端給的理由 */
export function updateAdminSiteSettings(changes: Partial<SystemSettings>): Promise<SystemSettings> {
  return adminRequest<SystemSettings>('/admin/site-settings', { method: 'PUT', body: changes })
}

/* -------------------- 功能停用 -------------------- */

export async function fetchAdminFeatureOutages(): Promise<FeatureOutage[] | null> {
  try {
    return await adminRequest<FeatureOutage[]>('/admin/feature-outages')
  } catch {
    return null
  }
}

/** 關閉功能；已經關閉的再送一次是更新說明與預計時間（關閉時間不會重算） */
export function closeFeatureOutage(
  key: PlanFeatureKey,
  input: { internalReason: string; publicNote: string; etaAt: string | null },
): Promise<FeatureOutage> {
  return adminRequest<FeatureOutage>(`/admin/feature-outages/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: input,
  })
}

export function reopenFeatureOutage(key: PlanFeatureKey): Promise<void> {
  return adminRequest<void>(`/admin/feature-outages/${encodeURIComponent(key)}`, { method: 'DELETE' })
}

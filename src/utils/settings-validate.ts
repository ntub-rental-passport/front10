import type { SystemSettings } from '@/src/mocks/admin/settings'

export type SettingsErrors = Partial<Record<keyof SystemSettings, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAGE_SIZE_MIN = 1
const PAGE_SIZE_MAX = 100
const MAX_UPLOAD_MB_MIN = 1
const MAX_UPLOAD_MB_MAX = 50

export function validateSettings(settings: SystemSettings): SettingsErrors {
  const errors: SettingsErrors = {}

  if (settings.siteName.trim() === '') {
    errors.siteName = '請輸入網站名稱'
  }

  if (settings.supportEmail.trim() === '') {
    errors.supportEmail = '請輸入客服信箱'
  } else if (!EMAIL_PATTERN.test(settings.supportEmail.trim())) {
    errors.supportEmail = '請輸入有效的 Email'
  }

  if (!Number.isFinite(settings.pageSize) || settings.pageSize < PAGE_SIZE_MIN || settings.pageSize > PAGE_SIZE_MAX) {
    errors.pageSize = '每頁筆數需介於 1 到 100'
  }

  if (!Number.isFinite(settings.maxUploadMb) || settings.maxUploadMb < MAX_UPLOAD_MB_MIN || settings.maxUploadMb > MAX_UPLOAD_MB_MAX) {
    errors.maxUploadMb = '上傳上限需介於 1 到 50 MB'
  }

  if (!Number.isFinite(settings.defaultAiQuota) || settings.defaultAiQuota < 0) {
    errors.defaultAiQuota = 'AI 配額不可為負數'
  }

  if (settings.maintenanceMode && settings.maintenanceMessage.trim() === '') {
    errors.maintenanceMessage = '開啟維護模式時必須填寫維護說明'
  }

  return errors
}

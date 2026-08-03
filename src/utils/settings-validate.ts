import type { SystemSettings } from '@/src/mocks/admin/settings'

export type SettingsErrors = Partial<Record<keyof SystemSettings, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAGE_SIZE_MIN = 1
const PAGE_SIZE_MAX = 100
const MAX_UPLOAD_MB_MIN = 1
const MAX_UPLOAD_MB_MAX = 50
const PERCENT_MIN = 1
const PERCENT_MAX = 100

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

  if (!Number.isFinite(settings.platformGeminiTokenQuota) || settings.platformGeminiTokenQuota < 0) {
    errors.platformGeminiTokenQuota = 'Gemini token 額度不可為負數'
  }

  if (!Number.isFinite(settings.platformVisionPageQuota) || settings.platformVisionPageQuota < 0) {
    errors.platformVisionPageQuota = 'Vision 頁數額度不可為負數'
  }

  if (
    !Number.isFinite(settings.quotaWarnPercent) ||
    settings.quotaWarnPercent < PERCENT_MIN ||
    settings.quotaWarnPercent > PERCENT_MAX
  ) {
    errors.quotaWarnPercent = '預警門檻需介於 1 到 100'
  } else if (
    Number.isFinite(settings.quotaCriticalPercent) &&
    settings.quotaWarnPercent >= settings.quotaCriticalPercent
  ) {
    // 黃燈門檻若不低於紅燈，狀態判定將永遠跳不到 warn
    errors.quotaWarnPercent = '預警門檻需小於告急門檻'
  }

  if (
    !Number.isFinite(settings.quotaCriticalPercent) ||
    settings.quotaCriticalPercent < PERCENT_MIN ||
    settings.quotaCriticalPercent > PERCENT_MAX
  ) {
    errors.quotaCriticalPercent = '告急門檻需介於 1 到 100'
  }

  if (settings.maintenanceMode && settings.maintenanceMessage.trim() === '') {
    errors.maintenanceMessage = '開啟維護模式時必須填寫維護說明'
  }

  return errors
}

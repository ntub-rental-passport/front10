import type { SystemSettings } from '@/src/mocks/admin/settings'
import { parseAllowlist } from './maintenance'

export type SettingsErrors = Partial<Record<keyof SystemSettings, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PERCENT_MIN = 1
const PERCENT_MAX = 100
const LOGIN_ATTEMPTS_MIN = 1
const LOGIN_ATTEMPTS_MAX = 20
const LOCKOUT_MINUTES_MIN = 1
const LOCKOUT_MINUTES_MAX = 1440
const SESSION_MINUTES_MIN = 5
const SESSION_MINUTES_MAX = 10080
const PASSWORD_LENGTH_MIN = 6
const PASSWORD_LENGTH_MAX = 64
const AUDIT_RETENTION_DAYS_MAX = 3650
const OVERDUE_DAYS_MIN = 1
const OVERDUE_DAYS_MAX = 90
const EXPIRING_SOON_DAYS_MIN = 1
const EXPIRING_SOON_DAYS_MAX = 90
const AI_CRITICAL_DAYS_MIN = 1
const AI_CRITICAL_DAYS_MAX = 30
// 對應 useSystemHealth.ts 的 TIMEOUT_MS = 5000：超過 5 秒 fetch 就被 abort、量不到，
// 上限跟著抓一致，避免看起來「合法」卻永遠不會生效的門檻
const RESPONSE_MS_MIN = 50
const RESPONSE_MS_MAX = 5000

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

  // 起訖顛倒的排程會讓維護模式永遠不生效，管理員卻以為已經排好了
  const startsAt = Date.parse(settings.maintenanceStartsAt)
  const endsAt = Date.parse(settings.maintenanceEndsAt)
  if (!Number.isNaN(startsAt) && !Number.isNaN(endsAt) && endsAt <= startsAt) {
    errors.maintenanceEndsAt = '結束時間必須晚於開始時間'
  }

  const invalidAllowlistEntry = parseAllowlist(settings.maintenanceAllowlist).find(
    (entry) => !EMAIL_PATTERN.test(entry),
  )
  if (invalidAllowlistEntry) {
    errors.maintenanceAllowlist = `「${invalidAllowlistEntry}」不是有效的 Email`
  }

  if (
    !Number.isFinite(settings.loginMaxAttempts) ||
    settings.loginMaxAttempts < LOGIN_ATTEMPTS_MIN ||
    settings.loginMaxAttempts > LOGIN_ATTEMPTS_MAX
  ) {
    errors.loginMaxAttempts = '登入失敗次數需介於 1 到 20'
  }

  if (
    !Number.isFinite(settings.loginLockoutMinutes) ||
    settings.loginLockoutMinutes < LOCKOUT_MINUTES_MIN ||
    settings.loginLockoutMinutes > LOCKOUT_MINUTES_MAX
  ) {
    errors.loginLockoutMinutes = '鎖定時間需介於 1 到 1440 分鐘'
  }

  if (
    !Number.isFinite(settings.sessionTimeoutMinutes) ||
    settings.sessionTimeoutMinutes < SESSION_MINUTES_MIN ||
    settings.sessionTimeoutMinutes > SESSION_MINUTES_MAX
  ) {
    errors.sessionTimeoutMinutes = 'Session 逾時需介於 5 到 10080 分鐘'
  }

  if (
    !Number.isFinite(settings.passwordMinLength) ||
    settings.passwordMinLength < PASSWORD_LENGTH_MIN ||
    settings.passwordMinLength > PASSWORD_LENGTH_MAX
  ) {
    errors.passwordMinLength = '密碼最短長度需介於 6 到 64'
  }

  // 0 或負數是刻意支援的「不限制」值，不是錯誤，只擋非數字與離譜的上限
  if (!Number.isFinite(settings.auditRetentionDays) || settings.auditRetentionDays > AUDIT_RETENTION_DAYS_MAX) {
    errors.auditRetentionDays = `保留天數需為數字，且不超過 ${AUDIT_RETENTION_DAYS_MAX} 天（0 或負數代表不限制）`
  }

  if (
    !Number.isFinite(settings.maintenanceOverdueDays) ||
    settings.maintenanceOverdueDays < OVERDUE_DAYS_MIN ||
    settings.maintenanceOverdueDays > OVERDUE_DAYS_MAX
  ) {
    errors.maintenanceOverdueDays = `逾期門檻需介於 ${OVERDUE_DAYS_MIN} 到 ${OVERDUE_DAYS_MAX} 天`
  }

  if (
    !Number.isFinite(settings.subscriptionExpiringSoonDays) ||
    settings.subscriptionExpiringSoonDays < EXPIRING_SOON_DAYS_MIN ||
    settings.subscriptionExpiringSoonDays > EXPIRING_SOON_DAYS_MAX
  ) {
    errors.subscriptionExpiringSoonDays = `到期提醒天數需介於 ${EXPIRING_SOON_DAYS_MIN} 到 ${EXPIRING_SOON_DAYS_MAX} 天`
  }

  if (
    !Number.isFinite(settings.aiQuotaCriticalDays) ||
    settings.aiQuotaCriticalDays < AI_CRITICAL_DAYS_MIN ||
    settings.aiQuotaCriticalDays > AI_CRITICAL_DAYS_MAX
  ) {
    errors.aiQuotaCriticalDays = `告急天數需介於 ${AI_CRITICAL_DAYS_MIN} 到 ${AI_CRITICAL_DAYS_MAX} 天`
  }

  if (
    !Number.isFinite(settings.responseOkMs) ||
    settings.responseOkMs < RESPONSE_MS_MIN ||
    settings.responseOkMs > RESPONSE_MS_MAX
  ) {
    errors.responseOkMs = `正常門檻需介於 ${RESPONSE_MS_MIN} 到 ${RESPONSE_MS_MAX} 毫秒`
  } else if (
    Number.isFinite(settings.responseDegradedMs) &&
    settings.responseOkMs >= settings.responseDegradedMs
  ) {
    // 分級邏輯是 if (ms < OK) 'ok'；if (ms < DEGRADED) 'degraded'——
    // 正常門檻不小於變慢門檻時，degraded 這一級永遠不會被判到
    errors.responseOkMs = '正常門檻必須小於變慢門檻'
  }

  if (
    !Number.isFinite(settings.responseDegradedMs) ||
    settings.responseDegradedMs < RESPONSE_MS_MIN ||
    settings.responseDegradedMs > RESPONSE_MS_MAX
  ) {
    errors.responseDegradedMs = `變慢門檻需介於 ${RESPONSE_MS_MIN} 到 ${RESPONSE_MS_MAX} 毫秒`
  }

  return errors
}

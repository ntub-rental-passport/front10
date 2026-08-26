export interface SystemSettings {
  siteName: string
  supportEmail: string
  maintenanceMode: boolean
  maintenanceMessage: string
  // datetime-local 格式（YYYY-MM-DDTHH:mm），空字串代表未設定排程＝開啟即持續生效
  maintenanceStartsAt: string
  maintenanceEndsAt: string
  // 換行分隔的 email，維護期間仍可進站
  maintenanceAllowlist: string
  loginMaxAttempts: number
  loginLockoutMinutes: number
  sessionTimeoutMinutes: number
  passwordMinLength: number
  pageSize: number
  maxUploadMb: number
  // 以下為「平台向 AI 廠商購買的額度」，也就是成本側的總量。
  // 單一使用者能用幾次是方案權益，存在 SubscriptionPlan.features，不在這裡。
  platformGeminiTokenQuota: number
  platformVisionPageQuota: number
  quotaWarnPercent: number
  quotaCriticalPercent: number
}

export function seedSettings(): SystemSettings {
  return {
    siteName: 'RentMate 租隊友',
    supportEmail: 'support@rentmate.tw',
    maintenanceMode: false,
    maintenanceMessage: '系統維護中，預計 30 分鐘後恢復，造成不便敬請見諒。',
    maintenanceStartsAt: '',
    maintenanceEndsAt: '',
    maintenanceAllowlist: 'admin@rentmate.tw',
    loginMaxAttempts: 5,
    loginLockoutMinutes: 15,
    sessionTimeoutMinutes: 120,
    passwordMinLength: 8,
    pageSize: 20,
    maxUploadMb: 10,
    platformGeminiTokenQuota: 2_000_000,
    platformVisionPageQuota: 3_000,
    quotaWarnPercent: 80,
    quotaCriticalPercent: 95,
  }
}

/**
 * 舊版 localStorage 沒有新增的額度欄位，缺欄位會讓百分比算出 NaN 而整頁失效。
 * 寫成具名函式而非 inline 箭頭函式，才能在 node 環境下直接單元測試
 * （vitest 沒有 localStorage，無法測 createAdminCollection 本身）。
 */
export function migrateSettings(raw: Partial<SystemSettings>): SystemSettings {
  return { ...seedSettings(), ...raw }
}

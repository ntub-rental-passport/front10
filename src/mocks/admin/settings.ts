export interface SystemSettings {
  siteName: string
  supportEmail: string
  maintenanceMode: boolean
  maintenanceMessage: string
  pageSize: number
  maxUploadMb: number
  defaultAiQuota: number
  // 以下為「平台向 AI 廠商購買的額度」，與上方 defaultAiQuota（單一使用者的
  // 每日配額）是不同的東西，命名刻意加 platform 前綴並帶單位以免混淆。
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
    pageSize: 20,
    maxUploadMb: 10,
    defaultAiQuota: 3,
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

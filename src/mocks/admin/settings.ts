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
  // 稽核紀錄的保留視窗（天）。0 或負數代表不限制，永久保留。
  auditRetentionDays: number
  // 通報房東後超過幾天未獲回應視為逾期，用來標示待處理清單中拖延過久的工單。
  maintenanceOverdueDays: number
  // 到期前幾天，使用者列表開始標示「訂閱即將到期」。
  subscriptionExpiringSoonDays: number
  // 以下為「平台向 AI 廠商購買的額度」，也就是成本側的總量。
  // 單一使用者能用幾次是方案權益，存在 SubscriptionPlan.features，不在這裡。
  platformGeminiTokenQuota: number
  platformVisionPageQuota: number
  quotaWarnPercent: number
  quotaCriticalPercent: number
  // 依消耗速度推算的剩餘天數低於此值時，AI 使用量頁標示「告急」，不必等百分比達標。
  aiQuotaCriticalDays: number
  // 系統監控頁「後端服務」的回應時間分級門檻（毫秒）。
  // 健康檢查（useSystemHealth.ts 的 TIMEOUT_MS）5 秒後會直接放棄量測，
  // 門檻設超過 5000 毫秒量不到、也就永遠不會生效——調這兩個值之前，先確認沒有動到 TIMEOUT_MS。
  responseOkMs: number
  responseDegradedMs: number
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
    auditRetentionDays: 90,
    maintenanceOverdueDays: 7,
    subscriptionExpiringSoonDays: 14,
    platformGeminiTokenQuota: 2_000_000,
    platformVisionPageQuota: 3_000,
    quotaWarnPercent: 80,
    quotaCriticalPercent: 95,
    aiQuotaCriticalDays: 3,
    responseOkMs: 300,
    responseDegradedMs: 1000,
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

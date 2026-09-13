import { describe, expect, it } from 'vitest'
import { validateSettings } from './settings-validate'
import { migrateSettings } from '@/src/mocks/admin/settings'
import type { SystemSettings } from '@/src/mocks/admin/settings'

// 直接沿用種子值，新增設定欄位時這份 fixture 會自動跟上，不必手動補。
function baseSettings(): SystemSettings {
  return migrateSettings({})
}

describe('validateSettings', () => {
  it('正常設定沒有錯誤', () => {
    expect(validateSettings(baseSettings())).toEqual({})
  })

  it('網站名稱不可空白', () => {
    const result = validateSettings({ ...baseSettings(), siteName: '   ' })
    expect(result.siteName).toBe('請輸入網站名稱')
  })

  it('客服信箱格式錯誤', () => {
    const result = validateSettings({ ...baseSettings(), supportEmail: 'not-an-email' })
    expect(result.supportEmail).toBe('請輸入有效的 Email')
  })

  it('客服信箱不可空白', () => {
    const result = validateSettings({ ...baseSettings(), supportEmail: '' })
    expect(result.supportEmail).toBe('請輸入客服信箱')
  })

  it('開啟維護模式時維護文字不可空白', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceMode: true,
      maintenanceMessage: '  ',
    })
    expect(result.maintenanceMessage).toBe('開啟維護模式時必須填寫維護說明')
  })

  it('未開啟維護模式時維護文字可空白', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceMode: false,
      maintenanceMessage: '',
    })
    expect(result.maintenanceMessage).toBeUndefined()
  })

  it('同時回報多個錯誤', () => {
    const result = validateSettings({
      ...baseSettings(),
      siteName: '',
      maintenanceOverdueDays: 999,
    })
    expect(Object.keys(result).sort()).toEqual(['maintenanceOverdueDays', 'siteName'])
  })
})

describe('AI 平台額度驗證', () => {
  it('合法設定沒有錯誤', () => {
    expect(validateSettings(baseSettings())).toEqual({})
  })

  it('額度為負數時報錯', () => {
    const errors = validateSettings({ ...baseSettings(), platformGeminiTokenQuota: -1 })
    expect(errors.platformGeminiTokenQuota).toBeTruthy()
  })

  it('門檻超出 1 到 100 時報錯', () => {
    expect(validateSettings({ ...baseSettings(), quotaWarnPercent: 0 }).quotaWarnPercent).toBeTruthy()
    expect(
      validateSettings({ ...baseSettings(), quotaCriticalPercent: 101 }).quotaCriticalPercent,
    ).toBeTruthy()
  })

  it('黃燈門檻不得大於等於紅燈門檻', () => {
    const errors = validateSettings({
      ...baseSettings(),
      quotaWarnPercent: 95,
      quotaCriticalPercent: 90,
    })
    expect(errors.quotaWarnPercent).toBeTruthy()
  })
})

describe('migrateSettings', () => {
  it('舊資料缺少額度欄位時補回預設值，不產生 NaN', () => {
    const legacy = {
      siteName: '舊站名',
      supportEmail: 'old@rentmate.tw',
      maintenanceMode: false,
      maintenanceMessage: '維護中',
    }

    const migrated = migrateSettings(legacy)

    expect(migrated.platformGeminiTokenQuota).toBe(2_000_000)
    expect(migrated.platformVisionPageQuota).toBe(3_000)
    expect(migrated.quotaWarnPercent).toBe(80)
    expect(migrated.quotaCriticalPercent).toBe(95)
    expect(migrated.auditRetentionDays).toBe(90)
    expect(migrated.maintenanceOverdueDays).toBe(7)
    expect(migrated.subscriptionExpiringSoonDays).toBe(14)
    expect(migrated.aiQuotaCriticalDays).toBe(3)
    expect(migrated.responseOkMs).toBe(300)
    expect(migrated.responseDegradedMs).toBe(1000)
    // 使用者原本的設定不可被預設值覆蓋
    expect(migrated.siteName).toBe('舊站名')
  })
})

describe('維護排程與白名單驗證', () => {
  it('未設排程時不檢查順序', () => {
    const result = validateSettings(baseSettings())
    expect(result.maintenanceEndsAt).toBeUndefined()
  })

  it('只設單邊時不檢查順序', () => {
    const startOnly = validateSettings({
      ...baseSettings(),
      maintenanceStartsAt: '2026-08-05T10:00',
    })
    expect(startOnly.maintenanceEndsAt).toBeUndefined()
  })

  it('結束時間早於開始時間時報錯', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceStartsAt: '2026-08-05T14:00',
      maintenanceEndsAt: '2026-08-05T10:00',
    })
    expect(result.maintenanceEndsAt).toBe('結束時間必須晚於開始時間')
  })

  it('起訖相同時報錯（區間為零，等於沒有生效時段）', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceStartsAt: '2026-08-05T10:00',
      maintenanceEndsAt: '2026-08-05T10:00',
    })
    expect(result.maintenanceEndsAt).toBe('結束時間必須晚於開始時間')
  })

  it('順序正確時通過', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceStartsAt: '2026-08-05T10:00',
      maintenanceEndsAt: '2026-08-05T14:00',
    })
    expect(result.maintenanceEndsAt).toBeUndefined()
  })

  it('白名單含無效 Email 時指出是哪一筆', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceAllowlist: 'ok@rentmate.tw\nnot-an-email\nalso@ok.tw',
    })
    expect(result.maintenanceAllowlist).toBe('「not-an-email」不是有效的 Email')
  })

  it('白名單留空是允許的', () => {
    const result = validateSettings({ ...baseSettings(), maintenanceAllowlist: '' })
    expect(result.maintenanceAllowlist).toBeUndefined()
  })
})

describe('安全性設定驗證', () => {
  const cases: Array<[keyof SystemSettings, number, string | undefined]> = [
    ['loginMaxAttempts', 0, '登入失敗次數需介於 1 到 20'],
    ['loginMaxAttempts', 21, '登入失敗次數需介於 1 到 20'],
    ['loginMaxAttempts', 5, undefined],
    ['loginLockoutMinutes', 0, '鎖定時間需介於 1 到 1440 分鐘'],
    ['loginLockoutMinutes', 1441, '鎖定時間需介於 1 到 1440 分鐘'],
    ['loginLockoutMinutes', 15, undefined],
    ['sessionTimeoutMinutes', 4, 'Session 逾時需介於 5 到 10080 分鐘'],
    ['sessionTimeoutMinutes', 10081, 'Session 逾時需介於 5 到 10080 分鐘'],
    ['sessionTimeoutMinutes', 120, undefined],
    ['passwordMinLength', 5, '密碼最短長度需介於 6 到 64'],
    ['passwordMinLength', 65, '密碼最短長度需介於 6 到 64'],
    ['passwordMinLength', 8, undefined],
  ]

  for (const [field, value, expected] of cases) {
    it(`${field} = ${value} → ${expected ?? '通過'}`, () => {
      const result = validateSettings({ ...baseSettings(), [field]: value })
      expect(result[field]).toBe(expected)
    })
  }

  it('非數字一律報錯', () => {
    const result = validateSettings({ ...baseSettings(), sessionTimeoutMinutes: Number.NaN })
    expect(result.sessionTimeoutMinutes).toBe('Session 逾時需介於 5 到 10080 分鐘')
  })
})

describe('稽核保留天數與逾期門檻驗證', () => {
  it('保留天數為 0 或負數代表不限制，不是錯誤', () => {
    expect(validateSettings({ ...baseSettings(), auditRetentionDays: 0 }).auditRetentionDays).toBeUndefined()
    expect(validateSettings({ ...baseSettings(), auditRetentionDays: -1 }).auditRetentionDays).toBeUndefined()
  })

  it('保留天數超過上限報錯', () => {
    const result = validateSettings({ ...baseSettings(), auditRetentionDays: 3651 })
    expect(result.auditRetentionDays).toBeTruthy()
  })

  it('保留天數非數字報錯', () => {
    const result = validateSettings({ ...baseSettings(), auditRetentionDays: Number.NaN })
    expect(result.auditRetentionDays).toBeTruthy()
  })

  it('逾期門檻需介於 1 到 90 天', () => {
    expect(validateSettings({ ...baseSettings(), maintenanceOverdueDays: 0 }).maintenanceOverdueDays).toBe(
      '逾期門檻需介於 1 到 90 天',
    )
    expect(validateSettings({ ...baseSettings(), maintenanceOverdueDays: 91 }).maintenanceOverdueDays).toBe(
      '逾期門檻需介於 1 到 90 天',
    )
    expect(
      validateSettings({ ...baseSettings(), maintenanceOverdueDays: 7 }).maintenanceOverdueDays,
    ).toBeUndefined()
  })
})

describe('訂閱到期提醒天數驗證', () => {
  it('需介於 1 到 90 天', () => {
    expect(
      validateSettings({ ...baseSettings(), subscriptionExpiringSoonDays: 0 }).subscriptionExpiringSoonDays,
    ).toBe('到期提醒天數需介於 1 到 90 天')
    expect(
      validateSettings({ ...baseSettings(), subscriptionExpiringSoonDays: 91 }).subscriptionExpiringSoonDays,
    ).toBe('到期提醒天數需介於 1 到 90 天')
    expect(
      validateSettings({ ...baseSettings(), subscriptionExpiringSoonDays: 1 }).subscriptionExpiringSoonDays,
    ).toBeUndefined()
    expect(
      validateSettings({ ...baseSettings(), subscriptionExpiringSoonDays: 90 }).subscriptionExpiringSoonDays,
    ).toBeUndefined()
  })

  it('非數字報錯', () => {
    expect(
      validateSettings({ ...baseSettings(), subscriptionExpiringSoonDays: Number.NaN })
        .subscriptionExpiringSoonDays,
    ).toBeTruthy()
  })
})

describe('AI 額度告急天數驗證', () => {
  it('需介於 1 到 30 天', () => {
    expect(validateSettings({ ...baseSettings(), aiQuotaCriticalDays: 0 }).aiQuotaCriticalDays).toBe(
      '告急天數需介於 1 到 30 天',
    )
    expect(validateSettings({ ...baseSettings(), aiQuotaCriticalDays: 31 }).aiQuotaCriticalDays).toBe(
      '告急天數需介於 1 到 30 天',
    )
    expect(validateSettings({ ...baseSettings(), aiQuotaCriticalDays: 1 }).aiQuotaCriticalDays).toBeUndefined()
    expect(validateSettings({ ...baseSettings(), aiQuotaCriticalDays: 30 }).aiQuotaCriticalDays).toBeUndefined()
  })

  it('非數字報錯', () => {
    expect(
      validateSettings({ ...baseSettings(), aiQuotaCriticalDays: Number.NaN }).aiQuotaCriticalDays,
    ).toBeTruthy()
  })
})

describe('後端回應時間分級門檻驗證', () => {
  it('兩個門檻皆需介於 50 到 5000 毫秒', () => {
    expect(validateSettings({ ...baseSettings(), responseOkMs: 49 }).responseOkMs).toBe(
      '正常門檻需介於 50 到 5000 毫秒',
    )
    expect(validateSettings({ ...baseSettings(), responseOkMs: 5001 }).responseOkMs).toBeTruthy()
    expect(validateSettings({ ...baseSettings(), responseDegradedMs: 49 }).responseDegradedMs).toBe(
      '變慢門檻需介於 50 到 5000 毫秒',
    )
    expect(validateSettings({ ...baseSettings(), responseDegradedMs: 5001 }).responseDegradedMs).toBeTruthy()
  })

  it('邊界值 50 與 5000 皆合法', () => {
    expect(
      validateSettings({ ...baseSettings(), responseOkMs: 50, responseDegradedMs: 5000 }).responseOkMs,
    ).toBeUndefined()
    expect(
      validateSettings({ ...baseSettings(), responseOkMs: 50, responseDegradedMs: 5000 })
        .responseDegradedMs,
    ).toBeUndefined()
  })

  it('正常門檻必須嚴格小於變慢門檻，顛倒時報錯', () => {
    const result = validateSettings({
      ...baseSettings(),
      responseOkMs: 1000,
      responseDegradedMs: 300,
    })
    expect(result.responseOkMs).toBe('正常門檻必須小於變慢門檻')
  })

  it('兩者相等時同樣報錯 —— 相等會讓 degraded 這一級永遠判不到', () => {
    const result = validateSettings({
      ...baseSettings(),
      responseOkMs: 500,
      responseDegradedMs: 500,
    })
    expect(result.responseOkMs).toBe('正常門檻必須小於變慢門檻')
  })

  it('正常門檻嚴格小於變慢門檻時通過', () => {
    const result = validateSettings({
      ...baseSettings(),
      responseOkMs: 300,
      responseDegradedMs: 1000,
    })
    expect(result.responseOkMs).toBeUndefined()
    expect(result.responseDegradedMs).toBeUndefined()
  })
})

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

  it('每頁筆數低於下限', () => {
    const result = validateSettings({ ...baseSettings(), pageSize: 0 })
    expect(result.pageSize).toBe('每頁筆數需介於 1 到 100')
  })

  it('每頁筆數高於上限', () => {
    const result = validateSettings({ ...baseSettings(), pageSize: 101 })
    expect(result.pageSize).toBe('每頁筆數需介於 1 到 100')
  })

  it('每頁筆數邊界值可通過', () => {
    expect(validateSettings({ ...baseSettings(), pageSize: 1 }).pageSize).toBeUndefined()
    expect(validateSettings({ ...baseSettings(), pageSize: 100 }).pageSize).toBeUndefined()
  })

  it('上傳上限超出範圍', () => {
    const result = validateSettings({ ...baseSettings(), maxUploadMb: 51 })
    expect(result.maxUploadMb).toBe('上傳上限需介於 1 到 50 MB')
  })

  it('AI 配額不可為負數', () => {
    const result = validateSettings({ ...baseSettings(), defaultAiQuota: -1 })
    expect(result.defaultAiQuota).toBe('AI 配額不可為負數')
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

  it('每頁筆數為 NaN 視為錯誤', () => {
    const result = validateSettings({ ...baseSettings(), pageSize: Number.NaN })
    expect(result.pageSize).toBe('每頁筆數需介於 1 到 100')
  })

  it('上傳上限為 NaN 視為錯誤', () => {
    const result = validateSettings({ ...baseSettings(), maxUploadMb: Number.NaN })
    expect(result.maxUploadMb).toBe('上傳上限需介於 1 到 50 MB')
  })

  it('AI 配額為 NaN 視為錯誤', () => {
    const result = validateSettings({ ...baseSettings(), defaultAiQuota: Number.NaN })
    expect(result.defaultAiQuota).toBe('AI 配額不可為負數')
  })

  it('上傳上限下限與邊界值', () => {
    expect(validateSettings({ ...baseSettings(), maxUploadMb: 0 }).maxUploadMb).toBe('上傳上限需介於 1 到 50 MB')
    expect(validateSettings({ ...baseSettings(), maxUploadMb: 1 }).maxUploadMb).toBeUndefined()
    expect(validateSettings({ ...baseSettings(), maxUploadMb: 50 }).maxUploadMb).toBeUndefined()
  })

  it('同時回報多個錯誤', () => {
    const result = validateSettings({
      ...baseSettings(),
      siteName: '',
      pageSize: 999,
    })
    expect(Object.keys(result).sort()).toEqual(['pageSize', 'siteName'])
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
      pageSize: 50,
      maxUploadMb: 20,
      defaultAiQuota: 5,
    }

    const migrated = migrateSettings(legacy)

    expect(migrated.platformGeminiTokenQuota).toBe(2_000_000)
    expect(migrated.platformVisionPageQuota).toBe(3_000)
    expect(migrated.quotaWarnPercent).toBe(80)
    expect(migrated.quotaCriticalPercent).toBe(95)
    // 使用者原本的設定不可被預設值覆蓋
    expect(migrated.siteName).toBe('舊站名')
    expect(migrated.pageSize).toBe(50)
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

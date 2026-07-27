import { describe, expect, it } from 'vitest'
import { validateSettings } from './settings-validate'
import type { SystemSettings } from '@/src/mocks/admin/settings'

function baseSettings(): SystemSettings {
  return {
    siteName: 'RentMate',
    supportEmail: 'support@rentmate.tw',
    maintenanceMode: false,
    maintenanceMessage: '系統維護中，請稍後再試。',
    pageSize: 20,
    maxUploadMb: 10,
    defaultAiQuota: 3,
  }
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

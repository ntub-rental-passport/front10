import { describe, expect, it } from 'vitest'

import { seedSettings } from '@/src/mocks/admin/settings'
import { describeSettingChange, describeSettingChanges, sessionLabel } from './settings-labels'

describe('describeSettingChange', () => {
  it('數字欄位：中文名稱、前後值、單位', () => {
    expect(describeSettingChange('maintenanceOverdueDays', 7, 10)).toBe('報修逾期提醒門檻：7 → 10 天')
    expect(describeSettingChange('quotaWarnPercent', 80, 90)).toBe('額度預警門檻：80 → 90%')
    expect(describeSettingChange('platformGeminiTokenQuota', 2_000_000, 1_500_000)).toBe(
      'Gemini 每月 token 上限：2,000,000 → 1,500,000',
    )
  })

  it('文字欄位只說已更新，不把整段文案塞進紀錄', () => {
    expect(describeSettingChange('maintenanceMessage', '舊的', '新的一大段說明')).toBe('維護說明文字：已更新')
  })

  it('時間欄位留空寫「未設定」', () => {
    const at = new Date(2026, 8, 28, 9, 0)
    const local = `${at.getFullYear()}-09-28T09:00`
    expect(describeSettingChange('maintenanceStartsAt', '', local)).toBe('維護開始時間：未設定 → 9/28 09:00')
  })
})

describe('describeSettingChanges', () => {
  it('只列出有變的欄位', () => {
    const before = seedSettings()
    const after = { ...before, maintenanceOverdueDays: 10, responseOkMs: 500 }
    expect(describeSettingChanges(before, after)).toEqual([
      '報修逾期提醒門檻：7 → 10 天',
      '回應時間正常門檻：300 → 500 ms',
    ])
  })

  it('沒有變就是空的', () => {
    expect(describeSettingChanges(seedSettings(), seedSettings())).toEqual([])
  })
})

describe('sessionLabel', () => {
  it('用最自然的單位', () => {
    expect([30, 60, 120, 480, 1440, 4320, 10080].map(sessionLabel)).toEqual([
      '30 分鐘',
      '1 小時',
      '2 小時',
      '8 小時',
      '1 天',
      '3 天',
      '7 天',
    ])
  })
})

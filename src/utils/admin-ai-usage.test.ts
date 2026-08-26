import { describe, expect, it } from 'vitest'
import {
  dailyAverage,
  daysLeftInMonth,
  daysUntilExhausted,
  monthToDateUnits,
  quotaStatus,
} from './admin-ai-usage'
import type { AiUsageDaily } from '@/src/mocks/admin/ai-usage'

// 2026-08-10（週一）當作「今天」，當月共 31 天
const TODAY = new Date(2026, 7, 10)

function rec(date: string, units: number, provider: AiUsageDaily['provider'] = 'gemini'): AiUsageDaily {
  return { date, provider, units, calls: 1 }
}

describe('monthToDateUnits', () => {
  it('只加總當月且供應商相符的紀錄', () => {
    const records = [
      rec('2026-08-01', 100),
      rec('2026-08-10', 50),
      rec('2026-07-31', 999), // 上月，不計
      rec('2026-08-05', 777, 'vision'), // 別的供應商，不計
    ]
    expect(monthToDateUnits(records, 'gemini', TODAY)).toBe(150)
  })

  it('沒有資料時回 0', () => {
    expect(monthToDateUnits([], 'gemini', TODAY)).toBe(0)
  })
})

describe('dailyAverage', () => {
  it('預設取最近 7 天，除數為 7', () => {
    // 08-04 ~ 08-10 共 7 天，每天 70。日數需補零，否則會產出 '2026-08-010'
    const records = Array.from({ length: 7 }, (_, i) =>
      rec(`2026-08-${`${i + 4}`.padStart(2, '0')}`, 70),
    )
    expect(dailyAverage(records, 'gemini', TODAY)).toBe(70)
  })

  it('當月已過天數不足 7 天時，以實際天數為除數', () => {
    const earlyMonth = new Date(2026, 7, 3) // 8/3，當月只過了 3 天
    const records = [rec('2026-08-01', 30), rec('2026-08-02', 30), rec('2026-08-03', 30)]
    // 除數是 3 不是 7
    expect(dailyAverage(records, 'gemini', earlyMonth)).toBe(30)
  })

  it('沒有用量時回 0，不回 NaN', () => {
    expect(dailyAverage([], 'gemini', TODAY)).toBe(0)
  })
})

describe('daysUntilExhausted', () => {
  it('依剩餘量與日均推算，向下取整', () => {
    expect(daysUntilExhausted(100, 30)).toBe(3) // 3.33 -> 3
  })

  it('日均為 0 時回 null（永不耗盡）', () => {
    expect(daysUntilExhausted(100, 0)).toBeNull()
  })

  it('剩餘為 0 時回 0', () => {
    expect(daysUntilExhausted(0, 30)).toBe(0)
  })
})

describe('daysLeftInMonth', () => {
  it('包含今天在內', () => {
    expect(daysLeftInMonth(TODAY)).toBe(22) // 8/10 到 8/31
  })

  it('當月最後一天回 1', () => {
    expect(daysLeftInMonth(new Date(2026, 7, 31))).toBe(1)
  })
})

describe('quotaStatus', () => {
  const base = { today: TODAY, warnPercent: 80, criticalPercent: 95 }

  it('用量高、消耗慢時由百分比門檻決定', () => {
    // 用量 85%，日均 1 -> 剩 150 份可撐 150 天，規則二為 ok
    expect(quotaStatus({ ...base, usedUnits: 850, quota: 1000, dailyAvg: 1 })).toBe('warn')
    expect(quotaStatus({ ...base, usedUnits: 960, quota: 1000, dailyAvg: 1 })).toBe('critical')
  })

  it('用量低、消耗快時由耗盡預估決定（本設計核心）', () => {
    // 用量僅 40%，遠低於 80% 門檻，但日均 100 -> 剩 600 只能撐 6 天 < 本月剩餘 22 天
    expect(quotaStatus({ ...base, usedUnits: 400, quota: 1000, dailyAvg: 100 })).toBe('warn')
    // 日均 250 -> 只能撐 2 天，進入 critical
    expect(quotaStatus({ ...base, usedUnits: 400, quota: 1000, dailyAvg: 250 })).toBe('critical')
  })

  it('額度為 0 視為未設定，不預警', () => {
    expect(quotaStatus({ ...base, usedUnits: 999, quota: 0, dailyAvg: 500 })).toBe('ok')
  })

  it('已超量時為 critical', () => {
    expect(quotaStatus({ ...base, usedUnits: 1200, quota: 1000, dailyAvg: 10 })).toBe('critical')
  })

  it('用量低且消耗慢時為 ok', () => {
    expect(quotaStatus({ ...base, usedUnits: 100, quota: 1000, dailyAvg: 5 })).toBe('ok')
  })
})

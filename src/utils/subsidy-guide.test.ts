import { describe, expect, it } from 'vitest'
import { checkHousing, checkIncome, incomeLimits } from './subsidy-guide'

describe('115 年所得初步檢核', () => {
  it('空白與非法輸入不產生合格結果，明確填零則可計算', () => {
    for (const annual of ['', -1, NaN, Infinity] as const)
      expect(checkIncome('臺北市', annual, 1, false)).toBeNull()
    for (const people of ['', 0, -1, 1.5, Infinity] as const)
      expect(checkIncome('臺北市', 100, people, false)).toBeNull()
    expect(checkIncome('未知縣市', 100, 1, false)).toBeNull()
    expect(checkIncome('臺北市', 0, 1, false)?.passes).toBe(true)
  })
  it('涵蓋 22 縣市；一般與婚育門檻均嚴格低於，不含等於', () => {
    expect(Object.keys(incomeLimits)).toHaveLength(22)
    for (const [city, thresholds] of Object.entries(incomeLimits)) {
      for (const expanded of [false, true]) {
        const limit = thresholds[expanded ? 1 : 0]
        expect(checkIncome(city, limit * 12 * 2, 2, expanded)?.passes).toBe(false)
        expect(checkIncome(city, limit * 12 * 2 - 1, 2, expanded)?.passes).toBe(true)
      }
    }
  })
})
describe('房屋查證不代替審查', () => {
  it('空白與未知不能變成已完成自查', () => {
    expect(checkHousing('', '', '', '', false).level).toBe('review')
    expect(checkHousing('unknown', 'yes', 'yes', 'yes', false).level).toBe('review')
  })
  it('住家稅率與登記用途擇一，但稅籍與合法文件條件仍須確認', () => {
    expect(checkHousing('yes', 'yes', 'yes', 'no', false).level).toBe('ready')
    expect(checkHousing('yes', 'yes', 'no', 'yes', false).level).toBe('ready')
    expect(checkHousing('yes', 'no', 'yes', 'yes', false).level).toBe('risk')
    expect(checkHousing('no', 'yes', 'yes', 'yes', false).level).toBe('risk')
    expect(checkHousing('yes', 'yes', 'no', 'no', false).level).toBe('risk')
  })
  it('舊戶缺稅籍需確認過渡規定，不能宣告合格或不合格', () => {
    expect(checkHousing('no', 'no', 'no', 'no', true).level).toBe('review')
  })
})

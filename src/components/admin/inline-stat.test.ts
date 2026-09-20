import { describe, expect, it } from 'vitest'

import { formatStatValue } from './inline-stat'

describe('formatStatValue', () => {
  it('四位數以上加千分位', () => {
    expect(formatStatValue(12847)).toBe('12,847')
  })

  it('三位數以內不變', () => {
    expect(formatStatValue(59)).toBe('59')
    expect(formatStatValue(0)).toBe('0')
  })

  it('字串原樣回傳', () => {
    // 呼叫端已經格式化好的東西不要再動（例如百分比、帶單位的值）
    expect(formatStatValue('91.4%')).toBe('91.4%')
    expect(formatStatValue('無法取得')).toBe('無法取得')
  })

  it('NaN 與 Infinity 顯示破折號，不顯示 "NaN"', () => {
    // 算不出來的時候畫面上出現 NaN，看起來像程式壞了；破折號至少是
    // 一個刻意的「沒有數字」
    expect(formatStatValue(Number.NaN)).toBe('—')
    expect(formatStatValue(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

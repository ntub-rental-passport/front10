import { describe, expect, it } from 'vitest'

import { msUntilNextMinute } from './clock-tick'

const at = (s: number, ms = 0) => new Date(2026, 8, 21, 14, 32, s, ms)

describe('msUntilNextMinute', () => {
  it('第 0 秒時要等滿一分鐘', () => {
    expect(msUntilNextMinute(at(0))).toBe(60_000)
  })

  it('第 30 秒時只等半分鐘', () => {
    expect(msUntilNextMinute(at(30))).toBe(30_000)
  })

  it('毫秒也算進去', () => {
    expect(msUntilNextMinute(at(59, 500))).toBe(500)
  })

  it('永遠不會回 0，否則會變成忙迴圈', () => {
    // 分鐘邊界上的那一毫秒
    expect(msUntilNextMinute(at(0, 0))).toBeGreaterThan(0)
    for (let s = 0; s < 60; s += 7) {
      expect(msUntilNextMinute(at(s))).toBeGreaterThan(0)
    }
  })

  it('永遠不超過一分鐘', () => {
    for (let s = 0; s < 60; s += 3) {
      expect(msUntilNextMinute(at(s))).toBeLessThanOrEqual(60_000)
    }
  })
})

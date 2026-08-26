import { describe, expect, it } from 'vitest'
import { dateKey } from './date-key'

describe('dateKey', () => {
  it('輸出本地時區的 YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 7, 1))).toBe('2026-08-01')
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('月與日補零', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

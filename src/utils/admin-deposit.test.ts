import { describe, expect, it } from 'vitest'

import { depositGap, depositMatchOf } from './admin-deposit'

describe('depositMatchOf', () => {
  it('兩造聲明相同視為相符', () => {
    expect(depositMatchOf(30000, 30000)).toBe('matched')
  })

  it('兩造聲明不同視為不符', () => {
    expect(depositMatchOf(30000, 20000)).toBe('mismatched')
    expect(depositMatchOf(20000, 30000)).toBe('mismatched')
  })

  it('租客尚未聲明是待補，不是不符', () => {
    expect(depositMatchOf(28000, null)).toBe('pending')
  })

  it('雙方都是 0 也算相符', () => {
    expect(depositMatchOf(0, 0)).toBe('matched')
  })
})

describe('depositGap', () => {
  it('相符時差額為 0', () => {
    expect(depositGap(24000, 24000)).toBe(0)
  })

  it('差額取絕對值，不分誰報得多', () => {
    expect(depositGap(30000, 20000)).toBe(10000)
    expect(depositGap(20000, 30000)).toBe(10000)
  })

  it('租客未聲明時差額為 0，避免把未填當成短少', () => {
    expect(depositGap(28000, null)).toBe(0)
  })
})

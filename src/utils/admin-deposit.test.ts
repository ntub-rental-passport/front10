import { describe, expect, it } from 'vitest'

import {
  canTransitionDeposit,
  depositTransitions,
  isOverCollected,
  overCollectedAmount,
} from './admin-deposit'

describe('canTransitionDeposit', () => {
  it('允許轉換表內的變更', () => {
    expect(canTransitionDeposit('held', 'inspecting')).toBe(true)
    expect(canTransitionDeposit('agreed', 'refunded')).toBe(true)
  })

  it('拒絕轉換表外的變更', () => {
    expect(canTransitionDeposit('held', 'refunded')).toBe(false)
    expect(canTransitionDeposit('refunded', 'held')).toBe(false)
  })

  it('已退還是終態', () => {
    expect(depositTransitions.refunded).toEqual([])
  })
})

describe('isOverCollected', () => {
  it('押金恰好等於兩個月租金不算超收', () => {
    expect(isOverCollected(20000, 10000)).toBe(false)
  })

  it('押金超過兩個月租金算超收', () => {
    expect(isOverCollected(30000, 10000)).toBe(true)
  })
})

describe('overCollectedAmount', () => {
  it('未超收回傳 0', () => {
    expect(overCollectedAmount(20000, 10000)).toBe(0)
  })

  it('回傳超出上限的金額', () => {
    expect(overCollectedAmount(30000, 10000)).toBe(10000)
  })
})

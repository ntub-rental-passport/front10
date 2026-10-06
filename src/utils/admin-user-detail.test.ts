import { describe, expect, it } from 'vitest'

import {
  accountStatusTone,
  depositMatchTone,
  handoverOutcomeTone,
  handoverResultTone,
  subscriptionFlags,
} from './admin-user-detail'

describe('狀態的輕重：沒事的安靜，要動手的才上色', () => {
  it('帳號：正常是綠點，停用才是紅', () => {
    expect(accountStatusTone('active')).toBe('ok')
    expect(accountStatusTone('suspended')).toBe('danger')
  })

  it('押金：相符安靜、在等租客是灰、不符才要介入', () => {
    expect(depositMatchTone('matched')).toBe('ok')
    expect(depositMatchTone('pending')).toBe('idle')
    expect(depositMatchTone('mismatched')).toBe('danger')
  })

  it('點交品項：損壞、不見才要協調，AI 無法判斷要人看照片，使用痕跡是一般磨損', () => {
    expect(handoverResultTone('new_damage')).toBe('danger')
    expect(handoverResultTone('missing')).toBe('danger')
    expect(handoverResultTone('uncertain')).toBe('warn')
    expect(handoverResultTone('degraded')).toBe('ok')
    expect(handoverResultTone('unchanged')).toBe('ok')
    expect(handoverResultTone(null)).toBe('idle')
  })

  it('整份點交的結論跟品項同一套顏色', () => {
    expect(handoverOutcomeTone('damaged')).toBe('danger')
    expect(handoverOutcomeTone('uncertain')).toBe('warn')
    expect(handoverOutcomeTone('incomplete')).toBe('idle')
    expect(handoverOutcomeTone('clear')).toBe('ok')
  })

  it('「在等別人」的狀態不會被塗成 warn／danger', () => {
    // warn／danger 在這個後台代表「你必須動手」
    expect(['warn', 'danger']).not.toContain(depositMatchTone('pending'))
    expect(['warn', 'danger']).not.toContain(handoverResultTone(null))
    expect(['warn', 'danger']).not.toContain(handoverOutcomeTone('incomplete'))
  })
})

describe('subscriptionFlags', () => {
  const base = { planKey: 'plus' as const, role: 'tenant' as const, active: true, expiringSoon: false, quotaExhausted: false }

  it('沒事就沒有任何標記', () => {
    expect(subscriptionFlags(base)).toEqual([])
  })

  it('即將到期與額度已用滿都是 warn，可以同時出現', () => {
    expect(subscriptionFlags({ ...base, expiringSoon: true, quotaExhausted: true })).toEqual([
      { label: '即將到期', tone: 'warn' },
      { label: '額度已用滿', tone: 'warn' },
    ])
  })

  it('Free 不顯示付費到期警示，房東不顯示租客額度警示', () => {
    expect(subscriptionFlags({ ...base, planKey: 'free', expiringSoon: true })).toEqual([])
    expect(subscriptionFlags({ ...base, role: 'landlord', quotaExhausted: true })).toEqual([])
  })

  it('已停用是 idle，而且蓋掉其他標記 —— 停用了就不用再管到期或額度', () => {
    expect(
      subscriptionFlags({ ...base, active: false, expiringSoon: true, quotaExhausted: true }),
    ).toEqual([{ label: '已停用', tone: 'idle' }])
  })
})

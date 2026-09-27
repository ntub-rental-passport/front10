import { describe, expect, it } from 'vitest'

import {
  accountStatusTone,
  depositMatchTone,
  handoverAgreementTone,
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

  it('點交：跟押金同一套 —— 在等租客確認不是管理員的事', () => {
    expect(handoverAgreementTone('agreed')).toBe('ok')
    expect(handoverAgreementTone('pending')).toBe('idle')
    expect(handoverAgreementTone('disputed')).toBe('danger')
  })

  it('「在等別人」的狀態不會被塗成 warn／danger', () => {
    // warn／danger 在這個後台代表「你必須動手」
    expect(['warn', 'danger']).not.toContain(depositMatchTone('pending'))
    expect(['warn', 'danger']).not.toContain(handoverAgreementTone('pending'))
  })
})

describe('subscriptionFlags', () => {
  const base = { active: true, expiringSoon: false, quotaExhausted: false }

  it('沒事就沒有任何標記', () => {
    expect(subscriptionFlags(base)).toEqual([])
  })

  it('即將到期與額度已用滿都是 warn，可以同時出現', () => {
    expect(subscriptionFlags({ ...base, expiringSoon: true, quotaExhausted: true })).toEqual([
      { label: '即將到期', tone: 'warn' },
      { label: '額度已用滿', tone: 'warn' },
    ])
  })

  it('已停用是 idle，而且蓋掉其他標記 —— 停用了就不用再管到期或額度', () => {
    expect(
      subscriptionFlags({ active: false, expiringSoon: true, quotaExhausted: true }),
    ).toEqual([{ label: '已停用', tone: 'idle' }])
  })
})

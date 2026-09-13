import { describe, expect, it } from 'vitest'

import {
  handoverAgreementOf,
  overallAgreement,
  summarizeHandover,
  type HandoverItemLike,
} from './admin-handover'

function item(
  landlordVerdict: HandoverItemLike['landlordVerdict'],
  tenantVerdict: HandoverItemLike['tenantVerdict'],
): HandoverItemLike {
  return { landlordVerdict, tenantVerdict }
}

describe('handoverAgreementOf', () => {
  it('兩造判定相同視為一致', () => {
    expect(handoverAgreementOf('intact', 'intact')).toBe('agreed')
    expect(handoverAgreementOf('damaged', 'damaged')).toBe('agreed')
  })

  it('判定相反視為不一致，不分是誰說有損壞', () => {
    expect(handoverAgreementOf('damaged', 'intact')).toBe('disputed')
    expect(handoverAgreementOf('intact', 'damaged')).toBe('disputed')
  })

  it('租客未確認是待補，不是不一致', () => {
    expect(handoverAgreementOf('intact', null)).toBe('pending')
    expect(handoverAgreementOf('damaged', null)).toBe('pending')
    expect(handoverAgreementOf('damaged', null)).not.toBe('disputed')
  })
})

describe('summarizeHandover', () => {
  it('分別計三種結果', () => {
    expect(
      summarizeHandover([
        item('intact', 'intact'),
        item('damaged', 'damaged'),
        item('damaged', 'intact'),
        item('intact', null),
      ]),
    ).toEqual({ total: 4, agreed: 2, disputed: 1, pending: 1 })
  })

  it('沒有品項時全部為 0', () => {
    expect(summarizeHandover([])).toEqual({ total: 0, agreed: 0, disputed: 0, pending: 0 })
  })
})

describe('overallAgreement', () => {
  it('全部一致才算一致', () => {
    expect(overallAgreement([item('intact', 'intact'), item('damaged', 'damaged')])).toBe('agreed')
  })

  it('只要有一項不一致，整份就是有爭議', () => {
    expect(
      overallAgreement([
        item('intact', 'intact'),
        item('intact', 'intact'),
        item('damaged', 'intact'),
      ]),
    ).toBe('disputed')
  })

  it('爭議優先於待確認 —— 有爭議就該介入，不必等租客補完', () => {
    expect(overallAgreement([item('damaged', 'intact'), item('intact', null)])).toBe('disputed')
  })

  it('沒有爭議但有人沒確認，結論是待確認', () => {
    expect(overallAgreement([item('intact', 'intact'), item('intact', null)])).toBe('pending')
  })

  it('空清單視為一致，避免把「還沒點交」誤標成爭議', () => {
    expect(overallAgreement([])).toBe('agreed')
  })
})

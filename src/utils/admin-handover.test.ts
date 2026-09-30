import { describe, expect, it } from 'vitest'

import {
  handoverItemLabel,
  handoverOutcome,
  summarizeHandover,
  type HandoverResult,
} from './admin-handover'

function item(result: HandoverResult | null) {
  return { result }
}

describe('handoverItemLabel', () => {
  it('比對過就顯示結果', () => {
    expect(handoverItemLabel({ result: 'new_damage', missingPhoto: null })).toBe('新增損壞')
    expect(handoverItemLabel({ result: 'uncertain', missingPhoto: null })).toBe('AI 無法判斷')
  })

  it('還沒比對時說卡在哪一張照片', () => {
    expect(handoverItemLabel({ result: null, missingPhoto: 'checkout' })).toBe('缺退租照片')
    expect(handoverItemLabel({ result: null, missingPhoto: 'baseline' })).toBe('缺入住照片')
    expect(handoverItemLabel({ result: null, missingPhoto: 'both' })).toBe('還沒拍照')
    expect(handoverItemLabel({ result: null, missingPhoto: null })).toBe('還沒比對')
  })
})

describe('summarizeHandover', () => {
  it('使用痕跡跟無變化一樣算沒事：一般磨損不是租客的責任', () => {
    expect(
      summarizeHandover([
        item('unchanged'),
        item('degraded'),
        item('new_damage'),
        item('missing'),
        item('uncertain'),
        item(null),
      ]),
    ).toEqual({ total: 6, damaged: 2, uncertain: 1, pending: 1, clear: 2 })
  })

  it('沒有品項時全部為 0', () => {
    expect(summarizeHandover([])).toEqual({
      total: 0,
      damaged: 0,
      uncertain: 0,
      pending: 0,
      clear: 0,
    })
  })
})

describe('handoverOutcome', () => {
  it('有一項損壞或不見，整份就是有損壞，不必等其他項目比對完', () => {
    expect(handoverOutcome([item('unchanged'), item(null), item('missing')])).toBe('damaged')
  })

  it('沒有損壞但 AI 有看不準的，要人工確認', () => {
    expect(handoverOutcome([item('unchanged'), item('uncertain'), item(null)])).toBe('uncertain')
  })

  it('其餘都沒事但還有沒比對的，是還沒比對完', () => {
    expect(handoverOutcome([item('degraded'), item(null)])).toBe('incomplete')
  })

  it('全部比對過且沒事才是無異狀', () => {
    expect(handoverOutcome([item('unchanged'), item('degraded')])).toBe('clear')
  })
})

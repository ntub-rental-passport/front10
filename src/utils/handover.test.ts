import { describe, it, expect } from 'vitest'
import { baselinePhotoCount, checkoutPairConclusion, type CheckoutPairConclusion } from './handover'
import type { HandoverDiff, HandoverEvidence, HandoverItem } from '@/src/composables/useHandover'
const item = (phases: string[]) =>
  ({ evidences: phases.map((phase) => ({ phase })) }) as HandoverItem
describe('baseline photo count', () => {
  it('counts every move-in photo', () => expect(baselinePhotoCount(item(['baseline', 'baseline', 'baseline']))).toBe(3))
  it('ignores checkout photos', () => expect(baselinePhotoCount(item(['checkout', 'baseline']))).toBe(1))
  it('is zero without photos', () => expect(baselinePhotoCount(item([]))).toBe(0))
})

// 同一物品的不同配對可能同時處於各種狀態，不能以項目層級的最嚴重結果替代。
const computedAt = '2026-10-02T10:00:00Z'
const resultLabels = [
  ['unchanged', '狀態相同'],
  ['new_damage', '新增瑕疵'],
  ['missing', '物品消失'],
  ['degraded', '使用痕跡'],
  ['uncertain', '無法判定'],
] as const

function comparison(type: HandoverDiff['type']): NonNullable<HandoverEvidence['comparison']> {
  return {
    index: 0,
    baselineRecordId: 'baseline',
    checkoutRecordId: 'checkout',
    type,
    summary: `比對說明：${type}`,
    confidence: 0.9,
    computedAt,
  }
}

interface PairScenario {
  name: string
  captured: boolean
  comparison?: HandoverEvidence['comparison']
  expected: CheckoutPairConclusion
}

const scenarios: PairScenario[] = [
  {
    name: '尚未拍攝',
    captured: false,
    expected: { status: 'pending_photo', text: '尚未拍攝退租存證' },
  },
  {
    name: 'comparison 為 null',
    captured: true,
    comparison: null,
    expected: { status: 'pending_comparison', text: '尚未比對' },
  },
  {
    name: 'comparison 為 undefined',
    captured: true,
    expected: { status: 'pending_comparison', text: '尚未比對' },
  },
  {
    name: '比對失敗',
    captured: true,
    comparison: { ...comparison('unchanged'), error: 'AI 服務逾時' },
    expected: { status: 'error', text: '比對失敗：AI 服務逾時', summary: '比對說明：unchanged' },
  },
  ...resultLabels.map(([type, text]) => ({
    name: type,
    captured: true,
    comparison: comparison(type),
    expected: { status: 'compared' as const, text, summary: `比對說明：${type}` },
  })),
]

function pairedItem(states: PairScenario[]): HandoverItem {
  const evidences: HandoverEvidence[] = states.flatMap((state, index) => {
    const baseline: HandoverEvidence = {
      id: `baseline-${index}`,
      phase: 'baseline',
      url: 'data:image/jpeg;base64,photo',
      capturedAt: computedAt,
    }
    return state.captured
      ? [baseline, {
          ...baseline,
          id: `checkout-${index}`,
          phase: 'checkout' as const,
          pairsWith: baseline.id,
          comparison: state.comparison,
        }]
      : [baseline]
  })
  return {
    id: 'item',
    propertyId: 'property',
    name: '沙發',
    room: '客廳',
    category: 'furniture',
    createdAt: computedAt,
    evidences,
    pairs: states.map((state, index) => ({
      baselineId: `baseline-${index}`,
      checkoutId: state.captured ? `checkout-${index}` : null,
    })),
    diff: { type: 'missing', confidence: 0.9, summary: '項目最嚴重結論', computedAt },
  }
}

describe('checkout pair conclusion', () => {
  it.each(scenarios)('$name 使用該組結論並保留說明', (scenario) => {
    const item = pairedItem([scenario])
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual(scenario.expected)
  })

  it.each(resultLabels)('失敗時即使帶有 %s 也不印成有效結果', (type) => {
    const item = pairedItem([{
      ...scenarios[3],
      comparison: { ...comparison(type), error: '無法讀取照片' },
    }])
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual({
      status: 'error', text: '比對失敗：無法讀取照片', summary: `比對說明：${type}`,
    })
  })

  it('退租照 id 找不到時不使用項目結果', () => {
    const item = pairedItem([scenarios[4]])
    item.pairs![0].checkoutId = 'missing-record'
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual({
      status: 'pending_comparison', text: '尚未比對',
    })
  })

  it('comparison 沒有 type 或 error 時仍視為尚未比對', () => {
    const item = pairedItem([{
      ...scenarios[4],
      comparison: { ...comparison('unchanged'), type: undefined },
    }])
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual({
      status: 'pending_comparison', text: '尚未比對',
    })
  })

  it('空錯誤字串不阻擋有效結果', () => {
    const item = pairedItem([{
      ...scenarios[4],
      comparison: { ...comparison('unchanged'), error: '' },
    }])
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual(scenarios[4].expected)
  })

  it('checkoutId 為 null 時忽略未配對退租照的舊結論', () => {
    const item = pairedItem([scenarios[4]])
    item.pairs![0].checkoutId = null
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual(scenarios[0].expected)
  })

  it('沒有 summary 的有效結果仍保留結論', () => {
    const item = pairedItem([{
      ...scenarios[4],
      comparison: { ...comparison('unchanged'), summary: undefined },
    }])
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual({
      status: 'compared', text: '狀態相同', summary: undefined,
    })
  })

  it('沒有 summary 的失敗仍保留錯誤訊息', () => {
    const item = pairedItem([{
      ...scenarios[3],
      comparison: { ...comparison('unchanged'), summary: undefined, error: '比對失敗原因' },
    }])
    expect(checkoutPairConclusion(item, item.pairs![0])).toEqual({
      status: 'error', text: '比對失敗：比對失敗原因', summary: undefined,
    })
  })

  // 交叉覆蓋所有狀態與五種結論，也驗證前後組順序不會讓結論串到相鄰配對。
  it.each(scenarios.flatMap((left) => scenarios.map((right) => ({
    name: `${left.name}／${right.name}`,
    left,
    right,
  }))))('同一項目的兩組 $name 各自維持狀態', ({ left, right }) => {
    const item = pairedItem([left, right])
    const before = structuredClone(item)
    expect(item.pairs!.map((pair) => checkoutPairConclusion(item, pair))).toEqual([
      left.expected,
      right.expected,
    ])
    expect(item).toEqual(before)
  })

  it('同一項目四組同時保留未拍、未比對、失敗與有效結論', () => {
    const states = [scenarios[0], scenarios[1], scenarios[3], scenarios[4]]
    const item = pairedItem(states)
    expect(item.pairs!.map((pair) => checkoutPairConclusion(item, pair))).toEqual(
      states.map((state) => state.expected),
    )
  })
})

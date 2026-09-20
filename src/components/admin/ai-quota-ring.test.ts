import { describe, expect, it } from 'vitest'

import { resolveQuotaRingVisual } from './ai-quota-ring'

describe('resolveQuotaRingVisual', () => {
  it('unset 時不畫進度（dashOffset 100）且文字是「未設定」，不是 0%', () => {
    const visual = resolveQuotaRingVisual(0, true)
    expect(visual.dashOffset).toBe(100)
    expect(visual.displayText).toBe('未設定')
  })

  it('unset 時即使傳入非 0 的 percent 也忽略，一律顯示未設定', () => {
    const visual = resolveQuotaRingVisual(50, true)
    expect(visual.displayText).toBe('未設定')
    expect(visual.dashOffset).toBe(100)
  })

  it('0% 時 dashOffset 是 100（整條路徑都是背景色）', () => {
    expect(resolveQuotaRingVisual(0, false).dashOffset).toBe(100)
    expect(resolveQuotaRingVisual(0, false).displayText).toBe('0%')
  })

  it('100% 時 dashOffset 是 0（整條路徑都是進度色）', () => {
    expect(resolveQuotaRingVisual(100, false).dashOffset).toBe(0)
    expect(resolveQuotaRingVisual(100, false).displayText).toBe('100%')
  })

  it('50% 時 dashOffset 是 50', () => {
    expect(resolveQuotaRingVisual(50, false).dashOffset).toBe(50)
  })

  it('超過 100 會被 clamp 到 100', () => {
    const visual = resolveQuotaRingVisual(150, false)
    expect(visual.dashOffset).toBe(0)
    expect(visual.displayText).toBe('100%')
  })

  it('負數會被 clamp 到 0', () => {
    const visual = resolveQuotaRingVisual(-20, false)
    expect(visual.dashOffset).toBe(100)
    expect(visual.displayText).toBe('0%')
  })

  it('顯示文字四捨五入到整數', () => {
    expect(resolveQuotaRingVisual(33.6, false).displayText).toBe('34%')
  })
})

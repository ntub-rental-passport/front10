import { describe, it, expect } from 'vitest'
import { completedCaptureAngles } from './handover'
import type { HandoverItem } from '@/src/composables/useHandover'
const item = (angles: string[], phase = 'baseline') =>
  ({ evidences: angles.map((angle) => ({ angle, phase })) }) as HandoverItem
describe('required handover angles', () => {
  it('completes with front and side without a detail photo', () =>
    expect(completedCaptureAngles(item(['front', 'side']))).toBe(2))
  it('does not substitute detail or repeated front for side', () =>
    expect(completedCaptureAngles(item(['front', 'front', 'detail']))).toBe(1))
  it('keeps optional detail outside required progress', () =>
    expect(completedCaptureAngles(item(['front', 'side', 'detail']))).toBe(2))
  it('ignores unclassified and checkout photos', () => {
    expect(completedCaptureAngles(item(['other', 'detail']))).toBe(0)
    expect(completedCaptureAngles(item(['front', 'side'], 'checkout'))).toBe(0)
  })
})

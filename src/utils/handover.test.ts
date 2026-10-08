import { describe, it, expect } from 'vitest'
import { baselinePhotoCount } from './handover'
import type { HandoverItem } from '@/src/composables/useHandover'
const item = (phases: string[]) =>
  ({ evidences: phases.map((phase) => ({ phase })) }) as HandoverItem
describe('baseline photo count', () => {
  it('counts every move-in photo', () => expect(baselinePhotoCount(item(['baseline', 'baseline', 'baseline']))).toBe(3))
  it('ignores checkout photos', () => expect(baselinePhotoCount(item(['checkout', 'baseline']))).toBe(1))
  it('is zero without photos', () => expect(baselinePhotoCount(item([]))).toBe(0))
})

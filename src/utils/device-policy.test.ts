import { describe, expect, it } from 'vitest'
import {
  DESKTOP_MIN_WIDTH,
  isDesktopEnvironment,
  shouldBlockAdminSurface,
  supportsFieldCapture,
} from './device-policy'

describe('device policy', () => {
  it('blocks a narrow touch device from admin pages', () => {
    expect(shouldBlockAdminSurface({ coarsePointer: true, viewportWidth: 390 })).toBe(true)
  })
  it('allows a narrow mouse browser and wide touch tablet', () => {
    expect(isDesktopEnvironment({ coarsePointer: false, viewportWidth: 390 })).toBe(true)
    expect(isDesktopEnvironment({ coarsePointer: true, viewportWidth: 1366 })).toBe(true)
  })
  it('uses an inclusive 1280px boundary', () => {
    expect(DESKTOP_MIN_WIDTH).toBe(1280)
    expect(shouldBlockAdminSurface({ coarsePointer: true, viewportWidth: 1279 })).toBe(true)
    expect(shouldBlockAdminSurface({ coarsePointer: true, viewportWidth: 1280 })).toBe(false)
  })
  it('offers live capture on touch devices at any width', () => {
    expect(supportsFieldCapture({ coarsePointer: true, viewportWidth: 1366 })).toBe(true)
    expect(supportsFieldCapture({ coarsePointer: false, viewportWidth: 390 })).toBe(false)
  })
})

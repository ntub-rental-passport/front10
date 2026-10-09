import { describe, expect, it } from 'vitest'
import {
  cameraUnavailableReason,
  DESKTOP_MIN_WIDTH,
  isDesktopEnvironment,
  LANDLORD_DESKTOP_MIN_WIDTH,
  shouldBlockAdminSurface,
  shouldBlockLandlordSurface,
  shouldBlockTenantSurface,
  supportsFieldCapture,
  TENANT_DESKTOP_MIN_WIDTH,
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

describe.each([
  { surface: 'admin', minWidth: DESKTOP_MIN_WIDTH, shouldBlock: shouldBlockAdminSurface },
  {
    surface: 'landlord',
    minWidth: LANDLORD_DESKTOP_MIN_WIDTH,
    shouldBlock: shouldBlockLandlordSurface,
  },
  { surface: 'tenant', minWidth: TENANT_DESKTOP_MIN_WIDTH, shouldBlock: shouldBlockTenantSurface },
])('$surface device policy', ({ minWidth, shouldBlock }) => {
  it.each([
    { coarsePointer: true, wide: false, blocked: true },
    { coarsePointer: true, wide: true, blocked: false },
    { coarsePointer: false, wide: false, blocked: false },
    { coarsePointer: false, wide: true, blocked: false },
  ])('handles coarsePointer=$coarsePointer and wide=$wide', ({ coarsePointer, wide, blocked }) => {
    expect(shouldBlock({ coarsePointer, viewportWidth: wide ? minWidth : minWidth - 1 })).toBe(blocked)
  })

  it.each([0, 1, 390])('allows a fine pointer even at %ipx', (viewportWidth) => {
    expect(shouldBlock({ coarsePointer: false, viewportWidth })).toBe(false)
  })
})

describe('surface thresholds', () => {
  it('aligns landlord and tenant thresholds with their navigation breakpoints', () => {
    expect(LANDLORD_DESKTOP_MIN_WIDTH).toBe(1024)
    expect(TENANT_DESKTOP_MIN_WIDTH).toBe(640)
  })

  it('allows a 1024px touch device for landlord and tenant but blocks admin', () => {
    const snapshot = { coarsePointer: true, viewportWidth: 1024 }
    expect(shouldBlockLandlordSurface(snapshot)).toBe(false)
    expect(shouldBlockTenantSurface(snapshot)).toBe(false)
    expect(shouldBlockAdminSurface(snapshot)).toBe(true)
  })

  it('accepts a custom inclusive desktop threshold while preserving the admin default', () => {
    const snapshot = { coarsePointer: true, viewportWidth: 640 }
    expect(isDesktopEnvironment(snapshot)).toBe(false)
    expect(isDesktopEnvironment(snapshot, 640)).toBe(true)
    expect(isDesktopEnvironment({ ...snapshot, viewportWidth: 639 }, 640)).toBe(false)
    expect(isDesktopEnvironment({ coarsePointer: false, viewportWidth: 0 }, 640)).toBe(true)
  })
})

describe('cameraUnavailableReason', () => {
  const live = { coarsePointer: true, isSecureContext: true, hasMediaDevices: true }

  it('returns null when the live camera can actually be opened', () => {
    expect(cameraUnavailableReason(live)).toBeNull()
  })

  it('tells a desktop user to upload, without mentioning HTTPS', () => {
    const reason = cameraUnavailableReason({ ...live, coarsePointer: false })
    expect(reason?.title).toBe('這台裝置請用上傳')
    expect(reason?.detail).not.toContain('HTTPS')
  })

  it('names the real cause when the page is not a secure context', () => {
    // http://192.168.x.x 這種區網網址會讓瀏覽器整個隱藏 navigator.mediaDevices，
    // 程式碼讀 .getUserMedia 就會丟 "undefined is not an object"。
    // 那個原始 JS 錯誤對使用者毫無意義，要講成「這個網址不是 HTTPS」。
    const reason = cameraUnavailableReason({
      ...live,
      isSecureContext: false,
      hasMediaDevices: false,
    })
    expect(reason?.title).toBe('這個網址不能開相機')
    expect(reason?.detail).toContain('HTTPS')
  })

  it('checks the device before the URL, so desktop never sees an HTTPS hint', () => {
    const reason = cameraUnavailableReason({
      coarsePointer: false,
      isSecureContext: false,
      hasMediaDevices: false,
    })
    expect(reason?.title).toBe('這台裝置請用上傳')
  })

  it('falls back to an unsupported-browser message on a secure page with no API', () => {
    const reason = cameraUnavailableReason({ ...live, hasMediaDevices: false })
    expect(reason?.title).toBe('這個瀏覽器不支援相機')
  })
})

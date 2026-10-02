import { describe, expect, it, vi } from 'vitest'
import { createDeviceGate, type GateWindow } from './useDeviceGate'

function fakeWindow(coarse: boolean, width: number) {
  const pointerListeners = new Set<() => void>()
  const resizeListeners = new Set<() => void>()
  const state = { coarse, width }
  const win: GateWindow = {
    innerWidth: width,
    matchMedia: () => ({
      get matches() {
        return state.coarse
      },
      addEventListener: (_type, listener) => pointerListeners.add(listener),
      removeEventListener: (_type, listener) => pointerListeners.delete(listener),
    }),
    addEventListener: (_type, listener) => resizeListeners.add(listener),
    removeEventListener: (_type, listener) => resizeListeners.delete(listener),
  }
  return {
    win,
    resizeTo(next: number) {
      win.innerWidth = state.width = next
      resizeListeners.forEach((listener) => listener())
    },
    setCoarse(next: boolean) {
      state.coarse = next
      pointerListeners.forEach((listener) => listener())
    },
    listenerCount: () => pointerListeners.size + resizeListeners.size,
  }
}

describe('createDeviceGate', () => {
  it('exposes the raw coarse-pointer signal', () => {
    const touch = createDeviceGate(fakeWindow(true, 390).win)
    expect(touch.coarsePointer.value).toBe(true)
    touch.stop()

    const mouse = createDeviceGate(fakeWindow(false, 1440).win)
    expect(mouse.coarsePointer.value).toBe(false)
    mouse.stop()
  })

  it('updates coarsePointer when the pointer changes', () => {
    const browser = fakeWindow(true, 390)
    const gate = createDeviceGate(browser.win)
    expect(gate.coarsePointer.value).toBe(true)
    browser.setCoarse(false)
    expect(gate.coarsePointer.value).toBe(false)
    gate.stop()
  })

  it('blocks immediately and updates on resize and pointer changes', () => {
    const browser = fakeWindow(true, 390)
    const gate = createDeviceGate(browser.win)
    expect(gate.blocked.value).toBe(true)
    expect(gate.fieldCapture.value).toBe(true)
    browser.resizeTo(1366)
    expect(gate.blocked.value).toBe(false)
    browser.resizeTo(390)
    browser.setCoarse(false)
    expect(gate.blocked.value).toBe(false)
    expect(gate.fieldCapture.value).toBe(false)
    gate.stop()
    expect(browser.listenerCount()).toBe(0)
  })
  it('allows a missing window', () => {
    vi.stubGlobal('window', undefined)
    const gate = createDeviceGate(undefined)
    expect(gate.blocked.value).toBe(false)
    expect(gate.coarsePointer.value).toBe(false)
    gate.stop()
    vi.unstubAllGlobals()
  })
})

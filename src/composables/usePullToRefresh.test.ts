import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { usePullToRefresh } from './usePullToRefresh'

// 沿用 Node 測試環境，以可取消的事件驗證原生 listener 與 preventDefault 的邊界。
class TouchSurface extends EventTarget {
  excluded = false
  closest() {
    return this.excluded ? this : null
  }
}

const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

function setup(scrollTop = 0) {
  const surface = new TouchSurface()
  const target = ref(surface as unknown as HTMLElement)
  const enabled = ref(true)
  const refresh = vi.fn<() => Promise<void>>().mockResolvedValue()
  const getScrollTop = vi.fn(() => scrollTop)
  const scope = effectScope()
  const gesture = scope.run(() =>
    usePullToRefresh({
      target,
      enabled,
      getScrollTop,
      onRefresh: refresh,
    }),
  )!
  stops.push(() => scope.stop())
  function touch(type: string, x = 0, y = 0, count = 1) {
    const event = new Event(type, { cancelable: true })
    const touches = Array.from({ length: count }, (_, identifier) => ({
      identifier,
      clientX: x,
      clientY: y,
    }))
    Object.defineProperties(event, {
      touches: { value: type === 'touchend' ? [] : touches },
      changedTouches: { value: touches },
    })
    surface.dispatchEvent(event)
    return event
  }
  return { surface, target, enabled, refresh, gesture, touch, getScrollTop }
}

describe('usePullToRefresh', () => {
  it('arms at the threshold and refreshes once on release, then resets', async () => {
    const { touch, gesture, refresh, getScrollTop } = setup()
    touch('touchstart')
    expect(touch('touchmove', 0, 40).defaultPrevented).toBe(true)
    expect(gesture.state.value).toBe('pulling')
    touch('touchmove', 0, 160)
    expect(gesture.state.value).toBe('armed')
    expect(getScrollTop).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    touch('touchend')
    expect(gesture.state.value).toBe('refreshing')
    expect(refresh).toHaveBeenCalledTimes(1)
    await nextTick()
    expect(gesture.state.value).toBe('idle')
    expect(gesture.pullDistance.value).toBe(0)
  })

  it.each([
    ['scrolling below the top', 30, 0, 160, false],
    ['horizontal swiping', 0, 200, 160, false],
    ['pulling below the threshold', 0, 0, 30, true],
  ])('does not refresh when %s', async (_, scrollTop, x, y, prevented) => {
    const { touch, refresh } = setup(scrollTop)
    touch('touchstart')
    expect(touch('touchmove', x, y).defaultPrevented).toBe(prevented)
    touch('touchend')
    await nextTick()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores a gesture starting inside a data-no-pull-refresh subtree', () => {
    const { surface, touch, refresh } = setup()
    surface.excluded = true
    const closest = vi.spyOn(surface, 'closest')
    touch('touchstart')
    expect(closest).toHaveBeenCalledWith('[data-no-pull-refresh]')
    expect(touch('touchmove', 0, 160).defaultPrevented).toBe(false)
    touch('touchend')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does not intercept upward scrolling or take over after a horizontal gesture', () => {
    const { touch, refresh } = setup()
    touch('touchstart')
    expect(touch('touchmove', 0, -30).defaultPrevented).toBe(false)
    touch('touchmove', 0, 160)
    touch('touchend')
    touch('touchstart')
    touch('touchmove', 40, 10)
    expect(touch('touchmove', 40, 160).defaultPrevented).toBe(false)
    touch('touchend')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('cancels on touchcancel, multitouch, or retreat below the threshold', () => {
    const { touch, refresh, gesture } = setup()
    touch('touchstart')
    touch('touchmove', 0, 160)
    touch('touchcancel')
    expect(gesture.state.value).toBe('idle')
    touch('touchstart')
    touch('touchmove', 0, 160, 2)
    touch('touchend')
    touch('touchstart')
    touch('touchmove', 0, 160)
    touch('touchmove', 0, 20)
    touch('touchend')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores further touches until an asynchronous refresh finishes and recovers from rejection', async () => {
    const { touch, refresh, gesture } = setup()
    let reject!: (error: Error) => void
    refresh.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    touch('touchstart')
    touch('touchmove', 0, 160)
    touch('touchend')
    touch('touchstart')
    touch('touchmove', 0, 160)
    touch('touchend')
    expect(refresh).toHaveBeenCalledTimes(1)
    reject(new Error('network'))
    await nextTick()
    expect(gesture.state.value).toBe('idle')
    touch('touchstart')
    touch('touchmove', 0, 160)
    touch('touchend')
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('removes listeners when disabled or disposed and cancels an in-progress pull', async () => {
    const { surface, enabled, touch, refresh, gesture } = setup()
    touch('touchstart')
    touch('touchmove', 0, 160)
    enabled.value = false
    await nextTick()
    touch('touchend')
    expect(gesture.state.value).toBe('idle')
    expect(refresh).not.toHaveBeenCalled()
    enabled.value = true
    await nextTick()
    const remove = vi.spyOn(surface, 'removeEventListener')
    stops.splice(0).forEach((stop) => stop())
    expect(remove).toHaveBeenCalledWith('touchmove', expect.any(Function))
    touch('touchstart')
    expect(touch('touchmove', 0, 160).defaultPrevented).toBe(false)
    touch('touchend')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('binds touchmove explicitly as non-passive', async () => {
    const { surface, target } = setup()
    const add = vi.spyOn(surface, 'addEventListener')
    target.value = null
    await nextTick()
    target.value = surface as unknown as HTMLElement
    await nextTick()
    expect(add).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, onMounted } from 'vue'
import { useRefreshTarget } from './useRefreshTarget'

const renderer = createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert: () => {},
  remove: () => {},
  setText: () => {},
  setElementText: () => {},
  patchProp: () => {},
  parentNode: () => null,
  nextSibling: () => null,
})
const unmounts: (() => void)[] = []
const reload = vi.fn()
beforeEach(() => {
  vi.stubGlobal('window', { location: { reload } })
  reload.mockClear()
})
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  vi.unstubAllGlobals()
})

function mountTarget(fn?: () => Promise<void>) {
  let target!: ReturnType<typeof useRefreshTarget>
  const app = renderer.createApp({
    setup() {
      target = useRefreshTarget()
      onMounted(() => {
        if (fn) target.registerRefresh(fn)
      })
      return () => h('div')
    },
  })
  app.mount({})
  unmounts.push(() => app.unmount())
  return { ...target, unmount: () => app.unmount() }
}

describe('useRefreshTarget', () => {
  it('invokes and awaits the page refresh registered on mount', async () => {
    let finish!: () => void
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const consumer = mountTarget()
    mountTarget(fn)
    let completed = false
    const pending = consumer.refresh().then(() => {
      completed = true
    })
    await Promise.resolve()
    expect(completed).toBe(false)
    finish()
    await pending
    expect(completed).toBe(true)
    expect(fn).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()
  })

  it('falls back to a full page reload without a registered page', async () => {
    await mountTarget().refresh()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('unregisters on unmount and falls back to a full page reload', async () => {
    const consumer = mountTarget()
    const fn = vi.fn()
    mountTarget(fn).unmount()
    await consumer.refresh()
    expect(fn).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('replaces repeated registrations and never restores a stale page callback', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const third = vi.fn()
    const oldPage = mountTarget(first)
    const newPage = mountTarget(second)
    newPage.registerRefresh(third)
    oldPage.unmount()
    await newPage.refresh()
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    expect(third).toHaveBeenCalledOnce()
    newPage.unmount()
    await mountTarget().refresh()
    expect(reload).toHaveBeenCalledOnce()
  })
})

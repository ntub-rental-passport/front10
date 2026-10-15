import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, getCurrentInstance, h, nextTick, ref, ssrContextKey } from 'vue'
import PullToRefresh from './PullToRefresh.vue'

class Surface extends EventTarget {
  style = { overscrollBehaviorY: 'auto' }
  scrollTop = 0
  children: Surface[] = []
  closest() {
    return null
  }
}

// 測試環境把 SFC 編譯成 SSR；保留真正 setup，以最小 host 接上同一個 surface ref。
const TestSurface = {
  ...PullToRefresh,
  render() {
    const { setupState } = getCurrentInstance() as unknown as { setupState: { surface: unknown } }
    return h('div', {
      ref: (element: unknown) => {
        setupState.surface = element
      },
    })
  },
}

const renderer = createRenderer<Surface, Surface>({
  createElement: () => new Surface(),
  createText: () => new Surface(),
  createComment: () => new Surface(),
  insert: (child, parent) => {
    parent.children.push(child)
  },
  remove: () => {},
  setText: () => {},
  setElementText: () => {},
  patchProp: () => {},
  parentNode: () => null,
  nextSibling: () => null,
})
const unmounts: (() => void)[] = []
let documentScroller: Surface
const reload = vi.fn()

beforeEach(() => {
  documentScroller = new Surface()
  reload.mockClear()
  vi.stubGlobal('document', { scrollingElement: documentScroller })
  vi.stubGlobal('window', { location: { reload } })
})
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  vi.unstubAllGlobals()
})

async function mountSurface(scrollContainer?: Surface, initiallyEnabled = true) {
  const enabled = ref(initiallyEnabled)
  const root = new Surface()
  const app = renderer.createApp({
    setup: () => () =>
      h(
        TestSurface,
        {
          enabled: enabled.value,
          scrollContainer: scrollContainer as unknown as HTMLElement,
        },
        () => h('p', '內容'),
      ),
  })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount(root)
  const unmount = () => app.unmount()
  unmounts.push(unmount)
  await nextTick()
  const surface = root.children[0]
  function pull() {
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      const event = new Event(type, { cancelable: true })
      const touches = [{ identifier: 0, clientX: 0, clientY: type === 'touchstart' ? 0 : 160 }]
      Object.defineProperties(event, {
        touches: { value: type === 'touchend' ? [] : touches },
        changedTouches: { value: touches },
      })
      surface.dispatchEvent(event)
    }
  }
  return { enabled, pull, unmount }
}

describe('PullToRefresh scroll container integration', () => {
  it('uses the document scroller for document layouts and restores overscroll on unmount', async () => {
    const { pull, unmount } = await mountSurface()
    expect(documentScroller.style.overscrollBehaviorY).toBe('contain')
    documentScroller.scrollTop = 20
    pull()
    expect(reload).not.toHaveBeenCalled()
    documentScroller.scrollTop = 0
    pull()
    expect(reload).toHaveBeenCalledOnce()
    unmount()
    expect(documentScroller.style.overscrollBehaviorY).toBe('auto')
  })

  it('uses the supplied main scroller even when the document has a different position', async () => {
    const main = new Surface()
    const { pull } = await mountSurface(main)
    expect(main.style.overscrollBehaviorY).toBe('contain')
    expect(documentScroller.style.overscrollBehaviorY).toBe('auto')
    main.scrollTop = 20
    pull()
    expect(reload).not.toHaveBeenCalled()
    main.scrollTop = 0
    documentScroller.scrollTop = 20
    pull()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not attach gestures while disabled, including after the device gate changes', async () => {
    const { enabled, pull } = await mountSurface(undefined, false)
    pull()
    expect(reload).not.toHaveBeenCalled()
    expect(documentScroller.style.overscrollBehaviorY).toBe('auto')
    enabled.value = true
    await nextTick()
    expect(documentScroller.style.overscrollBehaviorY).toBe('contain')
    enabled.value = false
    await nextTick()
    pull()
    expect(reload).not.toHaveBeenCalled()
    expect(documentScroller.style.overscrollBehaviorY).toBe('auto')
  })
})

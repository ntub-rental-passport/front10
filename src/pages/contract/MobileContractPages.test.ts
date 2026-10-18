import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRenderer,
  h,
  nextTick,
  reactive,
  ssrContextKey,
  type Ref,
  type SetupContext,
} from 'vue'
import MobileContractPages from './MobileContractPages.vue'

type PageState = {
  grid: Ref<HTMLElement | null>
  draggedFile: Ref<File | null>
  startPress: (event: PointerEvent, file: File) => void
  movePointer: (event: PointerEvent) => void
  finishDrag: () => void
  preventDragScroll: (event: TouchEvent) => void
  movePage: (from: number, to: number) => Promise<void>
}

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
const createObjectURL = vi.fn((file: File) => `blob:${file.name}`)
const revokeObjectURL = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)
})

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function mountPages() {
  const first = new File(['a'], '1.png', { type: 'image/png' })
  const second = new File(['b'], '2.png', { type: 'image/png' })
  const props = reactive({ files: [first, second], disabled: false })
  let state!: PageState
  const move = vi.fn()
  const TestPages = {
    ...MobileContractPages,
    setup(componentProps: Record<string, unknown>, context: SetupContext) {
      state = (
        MobileContractPages.setup as (
          props: Record<string, unknown>,
          context: SetupContext,
        ) => PageState
      )(componentProps, context)
      return state
    },
    render: () => h('div'),
  }
  const app = renderer.createApp({
    setup: () => () => h(TestPages, { ...props, onMove: move }),
  })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount({})
  const unmount = () => app.unmount()
  unmounts.push(unmount)
  const element = {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
    contains: vi.fn(() => true),
    querySelector: vi.fn(),
  }
  state.grid.value = element as unknown as HTMLElement
  const event = (x = 0, y = 0) =>
    ({
      currentTarget: element,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
      preventDefault: vi.fn(),
    }) as unknown as PointerEvent
  return { props, state, first, second, event, move, element, unmount }
}

describe('手機契約縮圖', () => {
  it('移除時撤銷預覽網址，排序時重用網址，卸載時釋放剩餘網址', async () => {
    const { props, first, second, unmount } = mountPages()
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    props.files = [second, first]
    await nextTick()
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    props.files = [second]
    await nextTick()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1.png')
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:2.png')
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    unmounts.pop()
  })

  it('長按 350ms 後拖曳才調整順序，拖曳期間阻止觸控捲動', () => {
    const { state, first, event, move, element } = mountPages()
    const touch = { preventDefault: vi.fn() } as unknown as TouchEvent
    state.startPress(event(), first)
    state.preventDragScroll(touch)
    expect(touch.preventDefault).not.toHaveBeenCalled()
    vi.advanceTimersByTime(349)
    expect(state.draggedFile.value).toBeNull()
    vi.advanceTimersByTime(1)
    expect(state.draggedFile.value).toBe(first)
    const target = { dataset: { pageIndex: '1' } }
    vi.stubGlobal('document', { elementFromPoint: () => ({ closest: () => target }) })
    state.preventDragScroll(touch)
    expect(touch.preventDefault).toHaveBeenCalledOnce()
    state.movePointer(event(80, 20))
    expect(move).toHaveBeenCalledWith(0, 1)
    state.finishDrag()
    expect(state.draggedFile.value).toBeNull()
    expect(element.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('長按前移動視為捲動，放開或取消也不會啟動排序', () => {
    const { state, first, event, move } = mountPages()
    state.startPress(event(), first)
    state.movePointer(event(0, 20))
    vi.advanceTimersByTime(400)
    expect(state.draggedFile.value).toBeNull()
    state.startPress(event(), first)
    state.finishDrag()
    vi.advanceTimersByTime(400)
    expect(state.draggedFile.value).toBeNull()
    expect(move).not.toHaveBeenCalled()
  })

  it('往前／往後操作會送出頁序變更，並將焦點移回換位後可操作的按鈕', async () => {
    const { props, state, move, element, first, second } = mountPages()
    const focus = vi.fn()
    element.querySelector.mockReturnValue({ focus })
    move.mockImplementation(() => {
      props.files = [second, first]
    })
    await state.movePage(0, 1)
    expect(move).toHaveBeenCalledWith(0, 1)
    expect(element.querySelector).toHaveBeenCalledWith(
      '[data-page-index="1"] .mobile-page-controls button:not(:disabled)',
    )
    expect(focus).toHaveBeenCalledOnce()
  })

  it('辨識中不啟動拖曳，卸載會取消尚未成立的長按', async () => {
    const { props, state, first, event, unmount } = mountPages()
    props.disabled = true
    await nextTick()
    state.startPress(event(), first)
    vi.advanceTimersByTime(400)
    expect(state.draggedFile.value).toBeNull()
    props.disabled = false
    await nextTick()
    state.startPress(event(), first)
    unmount()
    unmounts.pop()
    vi.advanceTimersByTime(400)
    expect(state.draggedFile.value).toBeNull()
  })
})

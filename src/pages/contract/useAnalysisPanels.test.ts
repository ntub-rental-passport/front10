import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { nextAnalysisPanel, shouldDismissAnalysisSheet, useAnalysisPanels, type AnalysisPanel } from './useAnalysisPanels'

const lifecycle = vi.hoisted(() => ({ mounted: [] as (() => void)[], unmount: [] as (() => void)[] }))
vi.mock('vue', async importOriginal => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: (callback: () => void) => lifecycle.mounted.push(callback),
  onBeforeUnmount: (callback: () => void) => lifecycle.unmount.push(callback),
}))

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach(stop => stop())
  lifecycle.mounted = []
  lifecycle.unmount = []
  vi.unstubAllGlobals()
})

async function setup(width = 375, withViewport = true) {
  const media = Object.assign(new EventTarget(), { matches: width < 640 })
  const viewport = Object.assign(new EventTarget(), { height: 812, offsetTop: 0 })
  const opener = { isConnected: true, focus: vi.fn() }
  const bodyStyle = { position: 'relative', top: '2px', left: '', right: '', overflow: 'clip' }
  const rootStyle = { overflow: 'auto' }
  const win = { innerHeight: 812, scrollX: 0, scrollY: 420, scrollTo: vi.fn(), matchMedia: vi.fn(() => media), visualViewport: withViewport ? viewport : null }
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', { activeElement: opener, body: { style: bodyStyle }, documentElement: { style: rootStyle } })
  const scope = effectScope()
  const panels = scope.run(useAnalysisPanels)!
  const reader = { open: false, showModal: vi.fn(() => { reader.open = true }) }
  const chat = { open: false, showModal: vi.fn(() => { chat.open = true }) }
  panels.readerPanelRef.value = reader as unknown as HTMLElement
  panels.chatPanelRef.value = chat as unknown as HTMLElement
  lifecycle.mounted.forEach(mount => mount())
  await nextTick()
  const stop = () => {
    lifecycle.unmount.splice(0).forEach(unmount => unmount())
    scope.stop()
  }
  cleanup.push(stop)
  return { panels, media, viewport, opener, bodyStyle, rootStyle, win, reader, chat, stop }
}

describe('分析頁面板狀態', () => {
  it.each<AnalysisPanel>([null, 'reader', 'chat'])('手機從 %s 開啟原文或聊天時，只保留新面板', current => {
    expect(nextAnalysisPanel(current, 'reader', true)).toBe('reader')
    expect(nextAnalysisPanel(current, 'chat', true)).toBe('chat')
    expect(nextAnalysisPanel(current, null, true)).toBeNull()
  })

  it('桌面定位原文不會關閉聊天，也不會開啟原文面板', () => {
    expect(nextAnalysisPanel('chat', 'reader', false)).toBe('chat')
    expect(nextAnalysisPanel(null, 'reader', false)).toBeNull()
    expect(nextAnalysisPanel(null, 'chat', false)).toBe('chat')
    expect(nextAnalysisPanel('chat', null, false)).toBeNull()
  })
})

describe('底部面板下滑關閉', () => {
  it.each([[0, 60], [-20, 80], [20, 80]])('向下滑動足夠距離（%s, %s）才關閉', (x, y) => {
    expect(shouldDismissAnalysisSheet(x, y)).toBe(true)
  })

  it.each([[0, 0], [0, 59], [0, -100], [100, 60], [-100, 60], [40, 60]])('忽略點擊、短距離、向上與橫向滑動（%s, %s）', (x, y) => {
    expect(shouldDismissAnalysisSheet(x, y)).toBe(false)
  })
})

describe('底部面板生命週期', () => {
  it('原文切換聊天維持捲動鎖定，關閉時還原原有樣式、位置與焦點', async () => {
    const { panels, bodyStyle, rootStyle, win, reader, chat, opener } = await setup()
    panels.openPanel('reader')
    await nextTick()
    expect(reader.showModal).toHaveBeenCalledOnce()
    expect(bodyStyle).toMatchObject({ position: 'fixed', top: '-420px', overflow: 'hidden' })
    expect(rootStyle.overflow).toBe('hidden')
    panels.openPanel('chat')
    await nextTick()
    expect(panels.activePanel.value).toBe('chat')
    expect(chat.showModal).toHaveBeenCalledOnce()
    expect(win.scrollTo).not.toHaveBeenCalled()
    panels.closePanel()
    await nextTick()
    expect(bodyStyle).toEqual({ position: 'relative', top: '2px', left: '', right: '', overflow: 'clip' })
    expect(rootStyle.overflow).toBe('auto')
    expect(win.scrollTo).toHaveBeenCalledWith(0, 420)
    expect(opener.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('只依 639px 寬度判斷手機，跨到桌面時收起原文並還原捲動', async () => {
    const { panels, media, win, bodyStyle } = await setup(639)
    expect(win.matchMedia).toHaveBeenCalledExactlyOnceWith('(max-width: 639px)')
    panels.openPanel('reader')
    await nextTick()
    media.matches = false
    media.dispatchEvent(new Event('change'))
    await nextTick()
    expect(panels.isMobile.value).toBe(false)
    expect(panels.activePanel.value).toBeNull()
    expect(bodyStyle.position).toBe('relative')
    panels.openPanel('reader')
    expect(panels.activePanel.value).toBeNull()
  })

  it('桌面聊天不鎖捲動，切回手機時才開啟模態面板', async () => {
    const { panels, media, chat, bodyStyle } = await setup(640)
    panels.openPanel('chat')
    await nextTick()
    expect(panels.chatOpen.value).toBe(true)
    expect(chat.showModal).not.toHaveBeenCalled()
    expect(bodyStyle.position).toBe('relative')
    media.matches = true
    media.dispatchEvent(new Event('change'))
    await nextTick()
    expect(chat.showModal).toHaveBeenCalledOnce()
    expect(bodyStyle.position).toBe('fixed')
    media.matches = false
    media.dispatchEvent(new Event('change'))
    await nextTick()
    expect(panels.chatOpen.value).toBe(true)
    expect(bodyStyle.position).toBe('relative')
  })

  it('鍵盤縮小或平移可視範圍時更新面板高度及底部避讓', async () => {
    const { panels, viewport } = await setup()
    viewport.height = 390
    viewport.offsetTop = 35
    viewport.dispatchEvent(new Event('resize'))
    expect(panels.sheetStyle.value).toEqual({ '--analysis-viewport-height': '390px', '--analysis-viewport-bottom': '387px' })
    viewport.offsetTop = 100
    viewport.dispatchEvent(new Event('scroll'))
    expect(panels.sheetStyle.value['--analysis-viewport-bottom']).toBe('322px')
    viewport.height = 812
    viewport.offsetTop = 0
    viewport.dispatchEvent(new Event('resize'))
    expect(panels.sheetStyle.value['--analysis-viewport-bottom']).toBe('0px')
  })

  it('沒有 visualViewport 時使用 dvh，卸載仍會還原捲動並清理監聽', async () => {
    const { panels, media, bodyStyle, rootStyle, stop } = await setup(375, false)
    expect(panels.sheetStyle.value['--analysis-viewport-height']).toBe('100dvh')
    panels.openPanel('reader')
    await nextTick()
    stop()
    expect(bodyStyle.position).toBe('relative')
    expect(rootStyle.overflow).toBe('auto')
    media.matches = false
    media.dispatchEvent(new Event('change'))
    expect(panels.isMobile.value).toBe(true)
  })
})

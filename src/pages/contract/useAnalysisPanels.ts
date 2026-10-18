import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type AnalysisPanel = 'reader' | 'chat' | null

export function nextAnalysisPanel(current: AnalysisPanel, requested: AnalysisPanel, mobile: boolean): AnalysisPanel {
  return requested === 'reader' && !mobile ? current : requested
}

export function shouldDismissAnalysisSheet(deltaX: number, deltaY: number): boolean {
  return deltaY >= 60 && deltaY > Math.abs(deltaX) * 1.5
}

export function useAnalysisPanels() {
  const isMobile = ref(false)
  const activePanel = ref<AnalysisPanel>(null)
  const readerPanelRef = ref<HTMLElement | null>(null)
  const chatPanelRef = ref<HTMLElement | null>(null)
  const viewportHeight = ref<number | null>(null)
  const viewportBottom = ref(0)
  const chatOpen = computed(() => activePanel.value === 'chat')
  const sheetOpen = computed(() => isMobile.value && activePanel.value !== null)
  const sheetStyle = computed(() => ({
    '--analysis-viewport-height': viewportHeight.value === null ? '100dvh' : `${viewportHeight.value}px`,
    '--analysis-viewport-bottom': `${viewportBottom.value}px`,
  }))
  let media: MediaQueryList | undefined
  let viewport: VisualViewport | null = null
  let restoreScroll: (() => void) | undefined
  let returnFocus: HTMLElement | null = null
  let swipeStart: { id: number; x: number; y: number } | null = null

  function openPanel(panel: Exclude<AnalysisPanel, null>) {
    if (isMobile.value && !sheetOpen.value) returnFocus = document.activeElement as HTMLElement | null
    activePanel.value = nextAnalysisPanel(activePanel.value, panel, isMobile.value)
  }

  function closePanel() {
    activePanel.value = null
  }

  function updateViewport() {
    if (!isMobile.value) return
    viewportHeight.value = viewport?.height ?? null
    viewportBottom.value = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0
  }

  function updateWidth() {
    isMobile.value = media?.matches ?? false
    if (!isMobile.value && activePanel.value === 'reader') closePanel()
    updateViewport()
  }

  function beginSheetSwipe(event: PointerEvent) {
    if (!isMobile.value || event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
  }

  function endSheetSwipe(event: PointerEvent) {
    if (!swipeStart || swipeStart.id !== event.pointerId) return
    const dismiss = shouldDismissAnalysisSheet(event.clientX - swipeStart.x, event.clientY - swipeStart.y)
    swipeStart = null
    if (dismiss) closePanel()
  }

  function cancelSheetSwipe() {
    swipeStart = null
  }

  watch([isMobile, activePanel], () => {
    cancelSheetSwipe()
    if (sheetOpen.value) {
      if (!restoreScroll) {
        const body = document.body
        const root = document.documentElement
        const saved = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, overflow: body.style.overflow }
        const rootOverflow = root.style.overflow
        const scrollX = window.scrollX
        const scrollY = window.scrollY
        // 固定背景並保留原捲動位置，避免 iOS 在面板開啟時仍捲動頁面。
        Object.assign(body.style, { position: 'fixed', top: `${-scrollY}px`, left: `${-scrollX}px`, right: '0', overflow: 'hidden' })
        root.style.overflow = 'hidden'
        restoreScroll = () => {
          Object.assign(body.style, saved)
          root.style.overflow = rootOverflow
          window.scrollTo(scrollX, scrollY)
        }
      }
      updateViewport()
      const panel = (activePanel.value === 'reader' ? readerPanelRef.value : chatPanelRef.value) as HTMLDialogElement | null
      if (panel && !panel.open) panel.showModal()
    } else {
      restoreScroll?.()
      restoreScroll = undefined
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
      returnFocus = null
    }
  }, { flush: 'post' })

  onMounted(() => {
    media = window.matchMedia('(max-width: 639px)')
    viewport = window.visualViewport
    updateWidth()
    media.addEventListener('change', updateWidth)
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
  })

  onBeforeUnmount(() => {
    media?.removeEventListener('change', updateWidth)
    viewport?.removeEventListener('resize', updateViewport)
    viewport?.removeEventListener('scroll', updateViewport)
    restoreScroll?.()
  })

  return { isMobile, activePanel, chatOpen, sheetOpen, readerPanelRef, chatPanelRef, sheetStyle, openPanel, closePanel, beginSheetSwipe, endSheetSwipe, cancelSheetSwipe }
}

import { onScopeDispose, ref, watch, type Ref } from 'vue'

type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing'

interface PullToRefreshOptions {
  target: Ref<HTMLElement | null>
  enabled: Ref<boolean>
  getScrollTop: () => number
  onRefresh: () => void | Promise<void>
}

const THRESHOLD = 64
const MAX_DISTANCE = 96
const SLOP = 8

export function usePullToRefresh(options: PullToRefreshOptions) {
  const pullDistance = ref(0)
  const state = ref<PullState>('idle')
  let startX = 0
  let startY = 0
  let touchId: number | null = null
  let refreshing = false

  function reset() {
    touchId = null
    pullDistance.value = 0
    state.value = 'idle'
  }

  function onTouchStart(event: TouchEvent) {
    if (refreshing) return
    reset()
    if (event.touches.length !== 1 || options.getScrollTop() !== 0) return
    const target = event.target as Element | null
    if (target?.closest?.('[data-no-pull-refresh]')) return
    const touch = event.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    touchId = touch.identifier
  }

  function onTouchMove(event: TouchEvent) {
    if (touchId === null || refreshing) return
    const touch = event.touches[0]
    if (event.touches.length !== 1 || touch.identifier !== touchId) {
      reset()
      return
    }
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    if (Math.abs(dx) > Math.abs(dy) || dy < 0) {
      reset()
      return
    }
    if (dy <= SLOP && state.value === 'idle') return
    // 捲動位置只在起手時讀取，移動中只改 transform 所需的狀態，避免強制重排。
    if (event.cancelable) event.preventDefault()
    pullDistance.value = Math.min(Math.max(dy, 0) * 0.5, MAX_DISTANCE)
    state.value = pullDistance.value >= THRESHOLD ? 'armed' : 'pulling'
  }

  async function onTouchEnd() {
    if (touchId === null || refreshing) return
    touchId = null
    if (state.value !== 'armed') {
      reset()
      return
    }
    refreshing = true
    state.value = 'refreshing'
    pullDistance.value = THRESHOLD
    try {
      await options.onRefresh()
    } catch {
      // 頁面負責呈現資料載入錯誤；手勢仍須復位，才能再次下拉重試。
    } finally {
      refreshing = false
      reset()
    }
  }

  function onTouchCancel() {
    if (!refreshing) reset()
  }

  const stop = watch(
    [options.target, options.enabled],
    ([target, enabled], _, onCleanup) => {
      if (!target || !enabled) return
      target.addEventListener('touchstart', onTouchStart, { passive: true })
      // iOS 只有在確定接管向下手勢後才阻止原生橡皮筋，其他捲動仍交給瀏覽器。
      target.addEventListener('touchmove', onTouchMove, { passive: false })
      target.addEventListener('touchend', onTouchEnd, { passive: true })
      target.addEventListener('touchcancel', onTouchCancel, { passive: true })
      onCleanup(() => {
        target.removeEventListener('touchstart', onTouchStart)
        target.removeEventListener('touchmove', onTouchMove)
        target.removeEventListener('touchend', onTouchEnd)
        target.removeEventListener('touchcancel', onTouchCancel)
        reset()
      })
    },
    { immediate: true, flush: 'post' },
  )
  onScopeDispose(stop)

  return { pullDistance, state }
}

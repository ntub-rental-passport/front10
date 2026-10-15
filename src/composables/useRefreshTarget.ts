import { onUnmounted } from 'vue'

type Refresh = () => void | Promise<void>
let activeTarget: { owner: symbol; refresh: Refresh } | null = null

export function useRefreshTarget() {
  const owner = Symbol('refresh-target')

  function registerRefresh(refresh: Refresh) {
    activeTarget = { owner, refresh }
  }

  onUnmounted(() => {
    // 新頁可能已先註冊；舊頁卸載只能清掉自己，且不恢復任何過期的頁面回呼。
    if (activeTarget?.owner === owner) activeTarget = null
  })

  async function refresh() {
    if (activeTarget) await activeTarget.refresh()
    else window.location.reload()
  }

  return { registerRefresh, refresh }
}

import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

import { resolvePageTitle, type PageTitle } from '@/src/utils/admin-page-title'

/**
 * 詳情頁把自己的真標題交給頂部列。
 *
 * ## 為什麼要用路徑當 key
 *
 * 直覺的做法是一個全域的 title ref，詳情頁設進去、離開時清掉。但「離開時
 * 清掉」很容易漏：忘了寫 onBeforeUnmount、或是從詳情頁直接跳到另一個詳情頁，
 * 舊標題就會留在頂部列上。那種錯不會報錯，只會安靜地顯示錯的名字。
 *
 * 這裡連路徑一起存。頂部列只有在「登記的路徑 === 目前路徑」時才採用，
 * 所以殘留的值自然失效，不依賴任何人記得清理。
 */
const registered = ref<{ path: string; title: string } | null>(null)

/** 詳情頁呼叫：資料載好之後回報真正的標題。 */
export function useRegisterAdminPageTitle(
  path: Ref<string>,
  title: Ref<string | null | undefined>,
): void {
  watch(
    [path, title],
    ([p, t]) => {
      registered.value = t ? { path: p, title: t } : null
    },
    { immediate: true },
  )

  // 清理只是禮貌，正確性不依賴它——path 對不上時值本來就不會被採用
  onBeforeUnmount(() => {
    registered.value = null
  })
}

/** 頂部列呼叫：拿到目前路由該顯示的標題與麵包屑。 */
export function useAdminPageTitle(path: Ref<string>) {
  const resolved = computed<PageTitle>(() => {
    const override =
      registered.value && registered.value.path === path.value ? registered.value.title : null
    return resolvePageTitle(path.value, override)
  })

  return {
    crumbs: computed(() => resolved.value.crumbs),
    title: computed(() => resolved.value.title),
  }
}

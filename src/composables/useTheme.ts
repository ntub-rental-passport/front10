import { readonly, ref } from 'vue'

import {
  nextTheme,
  parseStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from '@/src/utils/theme'

/**
 * 深淺色主題的全域狀態。
 *
 * 狀態放在模組層而不是每次呼叫都建一份：側欄與行動抽屜各有一顆開關，
 * 兩份獨立的 ref 會讓其中一顆按下去之後另一顆顯示錯的圖示。
 *
 * 真正的來源是 <html> 上有沒有 .dark —— 那個 class 由 index.html 的啟動腳本
 * 在 Vue 掛載前就設好了，這裡只是把它讀進來，不重新推導一次。重新推導的話
 * 兩邊的判斷邏輯遲早會分岔，而症狀是「啟動時閃一下另一個顏色」。
 */
function currentFromDom(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const theme = ref<Theme>(typeof document === 'undefined' ? 'light' : currentFromDom())

function apply(next: Theme): void {
  theme.value = next
  document.documentElement.classList.toggle('dark', next === 'dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // 無痕模式寫不進去：這次切換仍然生效，只是重新整理之後回到系統偏好。
    // 不值得為此擋下使用者的操作。
  }
}

export function useTheme() {
  return {
    theme: readonly(theme),
    toggle: () => apply(nextTheme(theme.value)),
    /** 給測試或設定頁用；一般切換請用 toggle */
    set: apply,
  }
}

/**
 * 沒有明確選擇過的時候，跟著作業系統即時變。
 *
 * 只在 main.ts 呼叫一次。存過值之後就不再理會系統變化 —— 使用者按過的開關
 * 不該被系統設定推翻。
 */
export function watchSystemTheme(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', (event) => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY)
    } catch {
      /* 讀不到就當沒存過 */
    }
    if (parseStoredTheme(stored)) return
    const next = resolveTheme(null, event.matches)
    theme.value = next
    document.documentElement.classList.toggle('dark', next === 'dark')
  })
}

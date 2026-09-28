import { readonly, ref } from 'vue'

import {
  nextTheme,
  parseStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeForPath,
  type Theme,
} from '@/src/utils/theme'

/**
 * 深淺色主題的全域狀態。
 *
 * 分成兩件事：
 *   - 偏好（theme）：後台開關按過的選擇，沒按過就是作業系統的設定
 *   - 實際套用：只有後台的網址照偏好加 .dark，其他網址一律淺色（見 themeAllowedOn）
 *
 * 所以偏好不能再從 <html> 有沒有 .dark 讀回來 —— 在租客頁上 .dark 一定是關的，
 * 那不代表使用者的偏好是淺色。偏好由 localStorage 與系統設定推導，
 * 和 public/theme-boot.js 的判斷由 theme.test.ts 逐一比對，不會各自分岔。
 *
 * 狀態放在模組層而不是每次呼叫都建一份：側欄與行動抽屜各有一顆開關，
 * 兩份獨立的 ref 會讓其中一顆按下去之後另一顆顯示錯的圖示。
 */

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // 無痕模式或封鎖儲存：當成沒存過
    return null
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

const theme = ref<Theme>(
  typeof window === 'undefined' ? 'light' : resolveTheme(readStored(), systemPrefersDark()),
)
let currentPath = typeof window === 'undefined' ? '/' : window.location.pathname

function paint(): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', themeForPath(currentPath, theme.value) === 'dark')
}

function choose(next: Theme): void {
  theme.value = next
  paint()
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // 無痕模式寫不進去：這次切換仍然生效，只是重新整理之後回到系統偏好。
    // 不值得為此擋下使用者的操作。
  }
}

export function useTheme() {
  return {
    /** 偏好，不是目前畫面：開關只出現在後台，在那裡兩者一致 */
    theme: readonly(theme),
    toggle: () => choose(nextTheme(theme.value)),
    /** 給測試或設定頁用；一般切換請用 toggle */
    set: choose,
  }
}

/**
 * 換頁時呼叫：後台以外的網址一律淺色，回到後台再套回偏好。
 *
 * 由 main.ts 在啟動時呼叫一次、並掛到 router.afterEach —— 從後台點到租客頁，
 * 深色要立刻消失，不能等重新整理。
 */
export function syncThemeToPath(path: string): void {
  currentPath = path
  paint()
}

/**
 * 沒有明確選擇過的時候，偏好跟著作業系統即時變（仍然只在後台套用）。
 *
 * 只在 main.ts 呼叫一次。存過值之後就不再理會系統變化 —— 使用者按過的開關
 * 不該被系統設定推翻。
 */
export function watchSystemTheme(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', (event) => {
    if (parseStoredTheme(readStored())) return
    theme.value = resolveTheme(null, event.matches)
    paint()
  })
}

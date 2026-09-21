/**
 * 深淺色主題。純邏輯，不碰 DOM。
 *
 * ## 這個專案原本沒有切換主題的入口
 *
 * index.css 有完整的 .dark 區塊、程式碼裡有 24 處 dark: 樣式，但全專案
 * 沒有任何地方會把 .dark 加到元素上 —— 也就是說深色模式一直存在卻到不了。
 * 這個檔案是那個開關的邏輯部分。
 *
 * ## 儲存的是「選擇」，不是「結果」
 *
 * 沒有存過值時跟著作業系統走。一旦使用者按了開關，就記下他的明確選擇，
 * 之後不再跟著系統變 —— 使用者按了按鈕卻在下次開啟時被系統設定推翻，
 * 那個開關就等於沒用。
 */
export type Theme = 'light' | 'dark'

/**
 * ⚠️ 這個 key 在 index.html 的啟動腳本裡也有一份字面值。
 *
 * 那段腳本必須在 Vue 掛載前就跑完（否則會先閃一下淺色），而 inline script
 * 沒辦法 import 這裡的常數。改這個字串時 **index.html 也要一起改**，
 * 否則會變成「腳本讀不到使用者的選擇」——不報錯，只是每次重新整理都閃白。
 */
export const THEME_STORAGE_KEY = 'rentmate-theme'

/** 只接受這兩個值；localStorage 裡的垃圾一律當成沒存過 */
export function parseStoredTheme(raw: string | null): Theme | null {
  return raw === 'light' || raw === 'dark' ? raw : null
}

/**
 * 這一次該用哪個主題。
 *
 * @param stored      localStorage 裡的值（可能是垃圾或 null）
 * @param prefersDark 作業系統目前偏好深色
 */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  return parseStoredTheme(stored) ?? (prefersDark ? 'dark' : 'light')
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

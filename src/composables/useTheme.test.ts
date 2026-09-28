import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * useTheme 的狀態在模組層，而且會碰 document 與 localStorage。
 * vitest 跑在 Node（沒有 DOM），所以每個測試都換一組假的瀏覽器物件、
 * 重新載入模組，確保測試之間不會互相影響。
 */
type Listener = (event: { matches: boolean }) => void

function fakeBrowser(options: { path: string; stored?: string | null; prefersDark?: boolean }) {
  const classes = new Set<string>()
  const storage = new Map<string, string>()
  if (options.stored != null) storage.set('rentmate-theme', options.stored)
  const listeners: Listener[] = []
  vi.stubGlobal('window', {
    location: { pathname: options.path },
    matchMedia: () => ({
      matches: !!options.prefersDark,
      addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
    }),
  })
  vi.stubGlobal('document', {
    // Vue 的 runtime-dom 載入時會先建一個 template 元素備用
    createElement: () => ({}),
    documentElement: {
      classList: {
        toggle: (name: string, force: boolean) => (force ? classes.add(name) : classes.delete(name)),
        contains: (name: string) => classes.has(name),
      },
    },
  })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  return {
    isDark: () => classes.has('dark'),
    stored: () => storage.get('rentmate-theme') ?? null,
    systemChanges: (matches: boolean) => listeners.forEach((listener) => listener({ matches })),
  }
}

async function loadTheme() {
  vi.resetModules()
  return import('./useTheme')
}

describe('useTheme：深色只在後台', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('偏好深色時，後台是深色、其他網址是淺色', async () => {
    const browser = fakeBrowser({ path: '/admin', stored: 'dark' })
    const { syncThemeToPath } = await loadTheme()
    syncThemeToPath('/admin/users')
    expect(browser.isDark()).toBe(true)
    for (const path of ['/', '/login', '/staff-login', '/app', '/landlord']) {
      syncThemeToPath(path)
      expect(browser.isDark(), path).toBe(false)
    }
  })

  it('從租客頁回到後台，深色套回來', async () => {
    const browser = fakeBrowser({ path: '/app', stored: 'dark' })
    const { syncThemeToPath } = await loadTheme()
    syncThemeToPath('/app')
    expect(browser.isDark()).toBe(false)
    syncThemeToPath('/admin')
    expect(browser.isDark()).toBe(true)
  })

  it('偏好不是從畫面讀回來的：在租客頁載入，開關仍顯示深色偏好', async () => {
    // 以前偏好是讀 <html> 有沒有 .dark；現在租客頁一定是淺色，那樣讀會把偏好弄丟
    fakeBrowser({ path: '/app', stored: 'dark' })
    const { useTheme } = await loadTheme()
    expect(useTheme().theme.value).toBe('dark')
  })

  it('在後台按開關：記住選擇並立刻套用', async () => {
    const browser = fakeBrowser({ path: '/admin', stored: 'dark' })
    const { syncThemeToPath, useTheme } = await loadTheme()
    syncThemeToPath('/admin')
    useTheme().toggle()
    expect(browser.isDark()).toBe(false)
    expect(browser.stored()).toBe('light')
  })

  it('沒選過時跟著系統變，但只在後台看得到', async () => {
    const browser = fakeBrowser({ path: '/app', prefersDark: false })
    const { syncThemeToPath, watchSystemTheme, useTheme } = await loadTheme()
    watchSystemTheme()
    syncThemeToPath('/app')
    browser.systemChanges(true)
    expect(useTheme().theme.value).toBe('dark')
    expect(browser.isDark()).toBe(false)
    syncThemeToPath('/admin')
    expect(browser.isDark()).toBe(true)
  })

  it('選過之後不再跟著系統', async () => {
    const browser = fakeBrowser({ path: '/admin', stored: 'light', prefersDark: false })
    const { syncThemeToPath, watchSystemTheme } = await loadTheme()
    watchSystemTheme()
    syncThemeToPath('/admin')
    browser.systemChanges(true)
    expect(browser.isDark()).toBe(false)
  })
})

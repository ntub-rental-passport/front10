import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import {
  nextTheme,
  parseStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeAllowedOn,
  themeForPath,
} from './theme'

describe('parseStoredTheme', () => {
  it('只接受 light 與 dark', () => {
    expect(parseStoredTheme('light')).toBe('light')
    expect(parseStoredTheme('dark')).toBe('dark')
  })

  it('沒存過是 null', () => {
    expect(parseStoredTheme(null)).toBeNull()
  })

  it('垃圾值一律當成沒存過', () => {
    // localStorage 是使用者可以任意編輯的，不能假設裡面是乾淨的
    for (const junk of ['', 'DARK', 'true', '{}', 'system', 'null']) {
      expect(parseStoredTheme(junk), junk).toBeNull()
    }
  })
})

describe('resolveTheme', () => {
  it('沒存過就跟著作業系統', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  it('存過就用存的，不再跟著系統', () => {
    // 使用者按了開關卻在下次開啟時被系統設定推翻，那個開關等於沒用
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('存了垃圾時退回系統偏好，不是硬給淺色', () => {
    expect(resolveTheme('系統', true)).toBe('dark')
  })
})

describe('nextTheme', () => {
  it('兩個值互相切換', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('light')
  })

  it('切兩次回到原點', () => {
    expect(nextTheme(nextTheme('light'))).toBe('light')
  })
})

describe('themeAllowedOn：只有後台可以深色', () => {
  it('後台的網址可以', () => {
    for (const path of ['/admin', '/admin/', '/admin/users', '/admin/users/12', '/admin/settings']) {
      expect(themeAllowedOn(path), path).toBe(true)
    }
  })

  it('首頁、登入頁、租客端、房東端都不行', () => {
    // 這些頁面有大量寫死的白底，深色一套上去就是白底淺字
    for (const path of [
      '/',
      '/login',
      '/register',
      '/verify-email',
      '/welcome',
      '/staff-login',
      '/maintenance',
      '/app',
      '/app/contract/scanner',
      '/app/handover/baseline',
      '/landlord',
      '/landlord/tenants',
    ]) {
      expect(themeAllowedOn(path), path).toBe(false)
    }
  })

  it('只是開頭像 admin 的網址不算', () => {
    expect(themeAllowedOn('/administrator')).toBe(false)
    expect(themeAllowedOn('/adminx/users')).toBe(false)
  })
})

describe('themeForPath', () => {
  it('後台照偏好', () => {
    expect(themeForPath('/admin', 'dark')).toBe('dark')
    expect(themeForPath('/admin/users', 'light')).toBe('light')
  })

  it('其他網址就算偏好深色也是淺色', () => {
    expect(themeForPath('/login', 'dark')).toBe('light')
    expect(themeForPath('/app', 'dark')).toBe('light')
    expect(themeForPath('/landlord', 'dark')).toBe('light')
  })
})

describe('public/theme-boot.js 與 TypeScript 的判斷一致', () => {
  // 啟動腳本要在 Vue 掛載前就跑，沒辦法 import theme.ts，只能各存一份。
  // 這裡直接在假的瀏覽器物件裡執行那支腳本，跟 themeForPath 逐一比對 ——
  // 改了一邊沒改另一邊，症狀是「重新整理時閃一下另一個顏色」，不會有任何錯誤訊息。
  const script = readFileSync(resolve(__dirname, '../../public/theme-boot.js'), 'utf-8')

  function runBoot(path: string, stored: string | null, prefersDark: boolean, storageThrows = false) {
    const classes = new Set<string>()
    runInNewContext(script, {
      window: {
        location: { pathname: path },
        matchMedia: (query: string) => ({ matches: query.includes('dark') && prefersDark }),
      },
      localStorage: {
        getItem: (key: string) => {
          if (storageThrows) throw new Error('blocked')
          return key === THEME_STORAGE_KEY ? stored : null
        },
      },
      document: { documentElement: { classList: { add: (name: string) => classes.add(name) } } },
    })
    return classes.has('dark')
  }

  it('每種網址、儲存值、系統偏好的組合都跟 themeForPath 一樣', () => {
    const paths = ['/', '/login', '/staff-login', '/app', '/app/contract/scanner', '/landlord/tenants', '/maintenance', '/admin', '/admin/users', '/administrator']
    for (const path of paths) {
      for (const stored of [null, 'dark', 'light', 'junk']) {
        for (const prefersDark of [true, false]) {
          const expected = themeForPath(path, resolveTheme(stored, prefersDark)) === 'dark'
          expect(runBoot(path, stored, prefersDark), `${path} ${stored} ${prefersDark}`).toBe(expected)
        }
      }
    }
  })

  it('讀不到 localStorage 時維持淺色，不讓整頁掛掉', () => {
    expect(() => runBoot('/admin', 'dark', true, true)).not.toThrow()
    expect(runBoot('/admin', 'dark', true, true)).toBe(false)
  })

  it('用的是同一個 key', () => {
    expect(script).toContain(`'${THEME_STORAGE_KEY}'`)
  })

  it('index.html 用外部檔案載入，不是 inline script', () => {
    // 正式站的 CSP 是 script-src 'self'：inline script 會被擋，外部檔案才會執行
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')
    expect(html).toContain('<script src="/theme-boot.js"></script>')
    expect(html).not.toMatch(/classList\.add\(['"]dark['"]\)/)
  })
})

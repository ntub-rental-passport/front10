import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { nextTheme, parseStoredTheme, resolveTheme, THEME_STORAGE_KEY } from './theme'

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

describe('THEME_STORAGE_KEY 與 index.html 的啟動腳本', () => {
  // index.html 的 inline script 必須在 Vue 掛載前就把 .dark 加上去，否則
  // 每次重新整理都會先閃一下淺色。那段腳本沒辦法 import 這個常數，只能
  // 各存一份字面值 —— 這裡直接把檔案讀進來比對，是兩份之間唯一的連結。
  //
  // 改了常數而沒改 index.html 的症狀是「每次重整閃一下白」，
  // 不會有任何錯誤訊息，所以一定要有東西擋著。
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')

  it('啟動腳本裡有同一個 key', () => {
    expect(html).toContain(`'${THEME_STORAGE_KEY}'`)
  })

  it('啟動腳本真的會加上 dark class', () => {
    expect(html).toMatch(/classList\.add\(['"]dark['"]\)/)
  })

  it('啟動腳本會讀系統偏好當預設', () => {
    expect(html).toContain('prefers-color-scheme')
  })
})

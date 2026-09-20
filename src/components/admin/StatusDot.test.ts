import { describe, expect, it } from 'vitest'

import { STATUS_CHIP_CLASS, STATUS_DOT_TONE_CLASS, shouldEmphasize } from './status-dot'

describe('STATUS_DOT_TONE_CLASS', () => {
  it('ok 對到 success 而不是 primary', () => {
    // primary 是品牌色（logo、按鈕、圖表線都是它），拿來當「正常」的訊號
    // 會淹沒在整片紫色裡。見 status-dot.ts 的說明。
    expect(STATUS_DOT_TONE_CLASS.ok).toBe('bg-success')
  })

  it('warn 對到 accent', () => {
    expect(STATUS_DOT_TONE_CLASS.warn).toBe('bg-accent')
  })

  it('danger 對到 destructive', () => {
    expect(STATUS_DOT_TONE_CLASS.danger).toBe('bg-destructive')
  })

  it('idle 對到 muted-foreground', () => {
    expect(STATUS_DOT_TONE_CLASS.idle).toBe('bg-muted-foreground')
  })

  it('剛好四種狀態，不多不少', () => {
    expect(Object.keys(STATUS_DOT_TONE_CLASS).sort()).toEqual(['danger', 'idle', 'ok', 'warn'])
  })
})

describe('STATUS_CHIP_CLASS', () => {
  it('每一種狀態都有對應的 chip 樣式', () => {
    expect(Object.keys(STATUS_CHIP_CLASS).sort()).toEqual(Object.keys(STATUS_DOT_TONE_CLASS).sort())
  })

  it('每個 chip 都同時指定填色與前景色', () => {
    // 只給填色不給前景，文字就會繼承父層顏色 —— 那正是
    // text-destructive-foreground 那個 bug 的成因，不要再犯一次。
    for (const [tone, cls] of Object.entries(STATUS_CHIP_CLASS)) {
      expect(cls, tone).toMatch(/\bbg-/)
      expect(cls, tone).toMatch(/\btext-/)
    }
  })

  it('danger 的文字色在兩個模式都明確指定', () => {
    // --destructive 深淺色是同一個值，所以文字色不能跟著模式翻轉
    expect(STATUS_CHIP_CLASS.danger).toContain('dark:')
  })
})

describe('shouldEmphasize', () => {
  it('只有 warn 與 danger 要跳出來', () => {
    expect(shouldEmphasize('warn')).toBe(true)
    expect(shouldEmphasize('danger')).toBe(true)
  })

  it('ok 不強調 —— 一切正常時不需要吵', () => {
    expect(shouldEmphasize('ok')).toBe(false)
  })

  it('idle 不強調 —— 沒接上資料源不是故障', () => {
    expect(shouldEmphasize('idle')).toBe(false)
  })
})

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

  it('danger 用 destructive-surface 而不是 destructive', () => {
    // --destructive 是文字色（淺色壓到 0.52 才讀得到），填色要用 surface。
    // 圓點跟 chip 若一個 0.52 一個 0.7，同一畫面上會看起來像兩種紅。
    expect(STATUS_DOT_TONE_CLASS.danger).toBe('bg-destructive-surface')
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

  it('danger chip 用成對的 surface token，不需要 dark: 例外', () => {
    // 以前要寫 text-foreground dark:text-background 是因為沒有配對的前景色。
    // 現在 --destructive-surface-foreground 深淺色同值，一個 class 就夠。
    expect(STATUS_CHIP_CLASS.danger).toBe(
      'bg-destructive-surface text-destructive-surface-foreground',
    )
    expect(STATUS_CHIP_CLASS.danger).not.toContain('dark:')
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

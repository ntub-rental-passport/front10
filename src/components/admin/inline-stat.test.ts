import { describe, expect, it } from 'vitest'

import { formatStatValue, resolveInlineStatVisual } from './inline-stat'

describe('formatStatValue', () => {
  it('四位數以上加千分位', () => {
    expect(formatStatValue(12847)).toBe('12,847')
  })

  it('三位數以內不變', () => {
    expect(formatStatValue(59)).toBe('59')
    expect(formatStatValue(0)).toBe('0')
  })

  it('字串原樣回傳', () => {
    // 呼叫端已經格式化好的東西不要再動（例如百分比、帶單位的值）
    expect(formatStatValue('91.4%')).toBe('91.4%')
    expect(formatStatValue('無法取得')).toBe('無法取得')
  })

  it('NaN 與 Infinity 顯示破折號，不顯示 "NaN"', () => {
    // 算不出來的時候畫面上出現 NaN，看起來像程式壞了；破折號至少是
    // 一個刻意的「沒有數字」
    expect(formatStatValue(Number.NaN)).toBe('—')
    expect(formatStatValue(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('resolveInlineStatVisual', () => {
  it('一般卡沒有背景色，靠頁面底色', () => {
    const v = resolveInlineStatVisual(false)
    expect(v.containerClass).toBe('')
    expect(v.labelClass).toBe('text-foreground/70')
  })

  it('主角卡整塊填滿 primary', () => {
    expect(resolveInlineStatVisual(true).containerClass).toContain('bg-primary-surface')
  })

  it('主角卡的文字色跟著填色走，不會沿用一般卡的', () => {
    // 一般卡的 foreground/70 踩在紫底上會讀不到
    const hero = resolveInlineStatVisual(true)
    expect(hero.labelClass).not.toContain('text-foreground/70')
    expect(hero.labelClass).toContain('primary-surface-foreground')
  })

  it('填色用 primary-surface 而不是 primary', () => {
    // --primary 深色被調亮到 0.6（它主要當文字色用），拿來當填色時
    // 白字只剩 3.85 且那是天花板。見 src/index.css 的說明。
    expect(resolveInlineStatVisual(true).containerClass).toContain('bg-primary-surface')
  })

  it('主角卡不需要 dark: 例外', () => {
    // surface 在深色已經壓暗過，兩個模式共用同一組值就會過 AA
    const hero = resolveInlineStatVisual(true)
    expect(hero.labelClass).not.toContain('dark:')
    expect(hero.containerClass).not.toContain('dark:')
  })

  it('主角卡的圖示不用實色，避免跟大數字搶焦點', () => {
    expect(resolveInlineStatVisual(true).iconClass).toContain('/15')
  })
})

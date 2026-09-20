import { describe, expect, it } from 'vitest'

import { resolveTrendDisplay } from './trend-chip'

describe('resolveTrendDisplay', () => {
  it('沒有給 value 時回 null', () => {
    expect(resolveTrendDisplay(undefined)).toBeNull()
  })

  it('value 是 0 時回 null —— 不顯示沒有意義的 +0%', () => {
    expect(resolveTrendDisplay(0)).toBeNull()
  })

  it('value > 0 時是上升樣式，文字帶正號', () => {
    expect(resolveTrendDisplay(12)).toEqual({
      direction: 'up',
      text: '+12%',
      // 深色模式對比：primary 配 secondary 只有 2.83，secondary-foreground 是 8.53。
      // 淺色模式兩個 token 值相同，所以這個改動在淺色下外觀不變。
      toneClass: 'text-secondary-foreground bg-secondary',
    })
  })

  it('value < 0 時是下降樣式，文字保留負號', () => {
    expect(resolveTrendDisplay(-8)).toEqual({
      direction: 'down',
      text: '-8%',
      toneClass: 'text-destructive bg-destructive/10',
    })
  })

  it('suffix 可以換成非百分比的單位', () => {
    expect(resolveTrendDisplay(5, ' 筆')?.text).toBe('+5 筆')
  })

  it('小數值也能正確顯示', () => {
    expect(resolveTrendDisplay(1.5)?.text).toBe('+1.5%')
  })
})

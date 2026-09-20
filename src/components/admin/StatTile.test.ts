import { describe, expect, it } from 'vitest'

import { resolveStatTileVisual } from './stat-tile'

describe('resolveStatTileVisual', () => {
  it('預設（非 hero）用 card 底色與 muted 輔助文字', () => {
    const visual = resolveStatTileVisual(false, undefined)
    expect(visual.containerClass).toBe('bg-card text-card-foreground')
    expect(visual.mutedTextClass).toBe('text-muted-foreground')
  })

  it('hero 用 primary-surface 當底色，不是 primary', () => {
    // --primary 深色被調亮到 0.6（它主要當文字色），拿來當填色時白字只有
    // 3.85 且那是天花板。--primary-surface 是專門調來承載文字的填色。
    const visual = resolveStatTileVisual(true, undefined)
    expect(visual.containerClass).toBe(
      'bg-primary-surface text-primary-surface-foreground',
    )
  })

  it('hero 的輔助文字配 surface 的前景色，且不需要 dark: 例外', () => {
    // surface 本身在深色已經壓暗過，所以 /80 在兩個模式都過 AA（實測 5.14），
    // 不必再為深色寫一條特例
    const visual = resolveStatTileVisual(true, undefined)
    expect(visual.mutedTextClass).toBe('text-primary-surface-foreground/80')
    expect(visual.mutedTextClass).not.toContain('dark:')
  })

  it('沒有 to 就不顯示鑽取箭頭', () => {
    expect(resolveStatTileVisual(false, undefined).showArrow).toBe(false)
  })

  it('有 to 才顯示鑽取箭頭', () => {
    expect(resolveStatTileVisual(false, '/admin/users').showArrow).toBe(true)
  })

  it('hero 與 to 互相獨立，不會互相影響', () => {
    const visual = resolveStatTileVisual(true, '/admin/users')
    expect(visual.containerClass).toBe(
      'bg-primary-surface text-primary-surface-foreground',
    )
    expect(visual.showArrow).toBe(true)
  })
})

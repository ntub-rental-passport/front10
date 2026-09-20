import { describe, expect, it } from 'vitest'

import { resolveStatTileVisual } from './stat-tile'

describe('resolveStatTileVisual', () => {
  it('預設（非 hero）用 card 底色與 muted 輔助文字', () => {
    const visual = resolveStatTileVisual(false, undefined)
    expect(visual.containerClass).toBe('bg-card text-card-foreground')
    expect(visual.mutedTextClass).toBe('text-muted-foreground')
  })

  it('hero 用 primary 底色，輔助文字換成半透明的 primary-foreground', () => {
    const visual = resolveStatTileVisual(true, undefined)
    expect(visual.containerClass).toBe('bg-primary text-primary-foreground')
    expect(visual.mutedTextClass).toBe('text-primary-foreground/75')
  })

  it('沒有 to 就不顯示鑽取箭頭', () => {
    expect(resolveStatTileVisual(false, undefined).showArrow).toBe(false)
  })

  it('有 to 才顯示鑽取箭頭', () => {
    expect(resolveStatTileVisual(false, '/admin/users').showArrow).toBe(true)
  })

  it('hero 與 to 互相獨立，不會互相影響', () => {
    const visual = resolveStatTileVisual(true, '/admin/users')
    expect(visual.containerClass).toBe('bg-primary text-primary-foreground')
    expect(visual.showArrow).toBe(true)
  })
})

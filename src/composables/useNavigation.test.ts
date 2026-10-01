import { describe, expect, it } from 'vitest'
import { useNavigation } from './useNavigation'

describe('mobile navigation', () => {
  const { mobileNavItems, navItems, accountItem } = useNavigation()
  it('has the six agreed slots in order', () => {
    expect(mobileNavItems.map((item) => item.path)).toEqual([
      '/app',
      '/app/handover',
      '/app/garbage',
      '/app/repairs',
      '/app/notes',
      '/app/account',
    ])
  })
  it('keeps the scanner out of the bottom bar and every mobile slot in desktop navigation', () => {
    expect(mobileNavItems).toHaveLength(6)
    expect(mobileNavItems.some((item) => item.path.startsWith('/app/contract'))).toBe(false)
    const desktopPaths = [...navItems, accountItem].map((item) => item.path)
    for (const item of mobileNavItems) expect(desktopPaths).toContain(item.path)
  })
})

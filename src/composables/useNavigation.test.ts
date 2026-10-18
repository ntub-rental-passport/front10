import { describe, expect, it } from 'vitest'
import { FileText } from 'lucide-vue-next'
import { isMobileNavItemActive, useNavigation } from './useNavigation'

describe('手機導覽', () => {
  const { mobileNavItems, navItems, accountItem } = useNavigation()
  it('依序顯示指定的五個入口與短標籤', () => {
    expect(mobileNavItems.map(({ path, label }) => ({ path, label }))).toEqual([
      { path: '/app/handover', label: '點交' },
      { path: '/app/contract/scanner', label: '契約辨識' },
      { path: '/app/garbage', label: '垃圾' },
      { path: '/app/repairs', label: '報修' },
      { path: '/app/notes', label: '備忘錄' },
    ])
  })
  it('契約辨識使用 FileText，桌面仍保有所有入口與帳戶', () => {
    expect(mobileNavItems[1].icon).toBe(FileText)
    const desktopPaths = [...navItems, accountItem].map((item) => item.path)
    for (const item of mobileNavItems) expect(desktopPaths).toContain(item.path)
    expect(navItems[0].path).toBe('/app')
    expect(accountItem.path).toBe('/app/account')
  })

  it.each(['/app/contract/scanner', '/app/contract/editor', '/app/contract-analysis'])(
    '契約辨識在 %s 與尾斜線路徑保持啟用', (path) => {
      expect(isMobileNavItemActive('/app/contract/scanner', path)).toBe(true)
      expect(isMobileNavItemActive('/app/contract/scanner', `${path}/`)).toBe(true)
    },
  )

  it.each([
    '/app/contract',
    '/app/contract/air-conditioner-repair',
    '/app/contract/electricity-fee',
    '/app/contract/combined',
    '/app/contract/document',
    '/app/contract/scanner-other',
    '/app/contract-analysis-other',
    '/app',
  ])('契約辨識不會在 %s 啟用', (path) => {
    expect(isMobileNavItemActive('/app/contract/scanner', path)).toBe(false)
  })

  it('其他入口包含子路由，但不誤判相同前綴', () => {
    expect(isMobileNavItemActive('/app/handover', '/app/handover')).toBe(true)
    expect(isMobileNavItemActive('/app/handover', '/app/handover/baseline')).toBe(true)
    expect(isMobileNavItemActive('/app/notes', '/app/notes/roommates')).toBe(true)
    expect(isMobileNavItemActive('/app/notes', '/app/notes-other')).toBe(false)
  })
})

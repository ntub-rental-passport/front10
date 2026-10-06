import { describe, expect, it } from 'vitest'
import { adminNavGroups } from './admin-rbac'

describe('adminNavGroups', () => {
  it('三個群組提供全部九個導覽項目', () => {
    expect(adminNavGroups.map((group) => ({
      label: group.label,
      paths: group.items.map((item) => item.path),
    }))).toEqual([
      {
        label: '營運管理',
        paths: ['/admin', '/admin/users', '/admin/maintenance-tickets'],
      },
      {
        label: '內容與通知',
        paths: ['/admin/content', '/admin/notifications', '/admin/notification-center'],
      },
      {
        label: '系統',
        paths: ['/admin/monitoring', '/admin/audit', '/admin/settings'],
      },
    ])
  })

  it('每個項目都有中文標籤，路徑不重複', () => {
    const items = adminNavGroups.flatMap((group) => group.items)
    expect(items.map((item) => item.label)).toEqual([
      '後台總覽', '使用者管理', '報修工單', '內容管理', '通知管理',
      '通知中心', '系統監控', '稽核紀錄', '系統設定',
    ])
    expect(new Set(items.map((item) => item.path)).size).toBe(items.length)
  })

  it('總覽保留頂部導覽用的簡稱', () => {
    expect(adminNavGroups[0].items[0].shortLabel).toBe('總覽')
  })

  it('已移除的模組不再出現在導覽中', () => {
    const paths = adminNavGroups.flatMap((group) => group.items.map((item) => item.path))
    expect(paths).not.toContain('/admin/review')
    expect(paths).not.toContain('/admin/knowledge')
  })

  it('押金與訂閱已整合進使用者管理，不再是獨立項目', () => {
    const paths = adminNavGroups.flatMap((group) => group.items.map((item) => item.path))
    expect(paths).not.toContain('/admin/deposits')
    expect(paths).not.toContain('/admin/subscription')
  })
})

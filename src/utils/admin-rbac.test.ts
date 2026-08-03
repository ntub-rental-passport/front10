import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROLES,
  adminNavGroups,
  adminRoleLabels,
  canAdminAccessPath,
  visibleNavGroupsFor,
} from './admin-rbac'
import type { AdminRole } from '@/src/mocks/admin/users'

// path -> role -> expected access
const MATRIX: Record<string, Record<AdminRole, boolean>> = {
  '/admin': { super: true, admin: true },
  '/admin/subscription': { super: true, admin: true },
  '/admin/content': { super: true, admin: true },
  '/admin/ai-usage': { super: true, admin: true },
  '/admin/users': { super: true, admin: false },
  '/admin/audit': { super: true, admin: false },
  '/admin/settings': { super: true, admin: false },
}

describe('ADMIN_ROLES', () => {
  it('只有兩種管理員角色', () => {
    expect(ADMIN_ROLES).toEqual(['super', 'admin'])
  })
})

describe('adminRoleLabels', () => {
  it('提供中文標籤', () => {
    expect(adminRoleLabels).toEqual({
      super: '超級管理員',
      admin: '一般管理員',
    })
  })
})

describe('canAdminAccessPath', () => {
  for (const [path, roles] of Object.entries(MATRIX)) {
    for (const [role, expected] of Object.entries(roles) as [AdminRole, boolean][]) {
      it(`${path} 對 ${role} 應為 ${expected}`, () => {
        expect(canAdminAccessPath(role, path)).toBe(expected)
      })
    }
  }

  it('已移除的模組不再出現在導覽中（未知路徑一律放行）', () => {
    expect(canAdminAccessPath('admin', '/admin/review')).toBe(true)
    expect(canAdminAccessPath('admin', '/admin/knowledge')).toBe(true)
  })

  it('未知子路徑一律放行（安全預設值，避免誤擋）', () => {
    expect(canAdminAccessPath('super', '/admin/unknown')).toBe(true)
    expect(canAdminAccessPath('admin', '/admin/unknown')).toBe(true)
  })

  it('帶有尾端子段落的路徑會依第一段解析', () => {
    expect(canAdminAccessPath('admin', '/admin/users/detail')).toBe(
      canAdminAccessPath('admin', '/admin/users'),
    )
    expect(canAdminAccessPath('super', '/admin/users/detail')).toBe(true)
    expect(canAdminAccessPath('admin', '/admin/users/detail')).toBe(false)
  })
})

describe('visibleNavGroupsFor', () => {
  function totalItems(role: AdminRole): number {
    return visibleNavGroupsFor(role).reduce((sum, g) => sum + g.items.length, 0)
  }

  it('super 可看到全部 7 個項目', () => {
    expect(totalItems('super')).toBe(7)
  })

  it('一般管理員可看到 4 個項目', () => {
    expect(totalItems('admin')).toBe(4)
  })

  it('不會回傳空群組（每個群組至少有一個項目）', () => {
    for (const role of ADMIN_ROLES) {
      const groups = visibleNavGroupsFor(role)
      for (const group of groups) {
        expect(group.items.length).toBeGreaterThan(0)
      }
    }
  })

  it('一般管理員看不到「系統」群組（稽核紀錄與系統設定皆無權限）', () => {
    const groups = visibleNavGroupsFor('admin')
    expect(groups.find((g) => g.label === '系統')).toBeUndefined()
  })
})

describe('adminNavGroups', () => {
  it('定義了三個群組，共 7 個項目', () => {
    const total = adminNavGroups.reduce((sum, g) => sum + g.items.length, 0)
    expect(adminNavGroups.length).toBe(3)
    expect(total).toBe(7)
  })

  it('已移除的模組不再出現在導覽中', () => {
    const paths = adminNavGroups.flatMap((g) => g.items.map((i) => i.path))
    expect(paths).not.toContain('/admin/review')
    expect(paths).not.toContain('/admin/knowledge')
    expect(paths).not.toContain('/admin/notifications')
  })
})

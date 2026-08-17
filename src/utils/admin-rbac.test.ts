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
  '/admin/content': { super: true, admin: true },
  '/admin/notifications': { super: true, admin: true },
  '/admin/monitoring': { super: true, admin: true },
  '/admin/subsidy': { super: true, admin: true },
  // 押金與訂閱整合進來後開放給一般管理員；高風險操作在詳情頁另外擋
  '/admin/users': { super: true, admin: true },
  '/admin/maintenance-tickets': { super: true, admin: true },
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

  it('使用者詳情 /admin/users/:id 沿用使用者管理的權限', () => {
    for (const role of ADMIN_ROLES) {
      expect(canAdminAccessPath(role, '/admin/users/u-tenant-1')).toBe(
        canAdminAccessPath(role, '/admin/users'),
      )
    }
    expect(canAdminAccessPath('admin', '/admin/users/u-tenant-1')).toBe(true)
  })

  it('稽核紀錄的子路徑不會因為多一段就被放行', () => {
    expect(canAdminAccessPath('admin', '/admin/audit/anything')).toBe(false)
  })
})

describe('visibleNavGroupsFor', () => {
  function totalItems(role: AdminRole): number {
    return visibleNavGroupsFor(role).reduce((sum, g) => sum + g.items.length, 0)
  }

  it('super 可看到全部 9 個項目', () => {
    expect(totalItems('super')).toBe(9)
  })

  it('一般管理員可看到 7 個項目（少了稽核紀錄與系統設定）', () => {
    expect(totalItems('admin')).toBe(7)
  })

  it('一般管理員看得到使用者管理', () => {
    const paths = visibleNavGroupsFor('admin').flatMap((g) => g.items.map((i) => i.path))
    expect(paths).toContain('/admin/users')
  })

  it('不會回傳空群組（每個群組至少有一個項目）', () => {
    for (const role of ADMIN_ROLES) {
      const groups = visibleNavGroupsFor(role)
      for (const group of groups) {
        expect(group.items.length).toBeGreaterThan(0)
      }
    }
  })

  it('一般管理員在「系統」群組裡只看得到系統監控', () => {
    const system = visibleNavGroupsFor('admin').find((g) => g.label === '系統')
    expect(system?.items.map((i) => i.path)).toEqual(['/admin/monitoring'])
  })
})

describe('adminNavGroups', () => {
  it('定義了三個群組，共 9 個項目', () => {
    const total = adminNavGroups.reduce((sum, g) => sum + g.items.length, 0)
    expect(adminNavGroups.length).toBe(3)
    expect(total).toBe(9)
  })

  it('已移除的模組不再出現在導覽中', () => {
    const paths = adminNavGroups.flatMap((g) => g.items.map((i) => i.path))
    expect(paths).not.toContain('/admin/review')
    expect(paths).not.toContain('/admin/knowledge')
  })

  it('內容管理與通知管理是並列的兩個獨立項目', () => {
    const paths = adminNavGroups.flatMap((g) => g.items.map((i) => i.path))
    expect(paths).toContain('/admin/content')
    expect(paths).toContain('/admin/notifications')
  })

  it('押金與訂閱已整合進使用者管理，不再是獨立項目', () => {
    const paths = adminNavGroups.flatMap((g) => g.items.map((i) => i.path))
    expect(paths).not.toContain('/admin/deposits')
    expect(paths).not.toContain('/admin/subscription')
  })
})

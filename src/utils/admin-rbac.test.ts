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
  '/admin': { super: true, ops: true, content: true },
  '/admin/users': { super: true, ops: true, content: false },
  '/admin/review': { super: true, ops: true, content: true },
  '/admin/subscription': { super: true, ops: true, content: false },
  '/admin/content': { super: true, ops: false, content: true },
  '/admin/knowledge': { super: true, ops: false, content: true },
  '/admin/ai-quality': { super: true, ops: false, content: true },
  '/admin/notifications': { super: true, ops: false, content: true },
  '/admin/audit': { super: true, ops: true, content: false },
  '/admin/settings': { super: true, ops: false, content: false },
}

describe('ADMIN_ROLES', () => {
  it('包含三種管理員角色', () => {
    expect(ADMIN_ROLES).toEqual(['super', 'ops', 'content'])
  })
})

describe('adminRoleLabels', () => {
  it('提供中文標籤', () => {
    expect(adminRoleLabels).toEqual({
      super: '超級管理員',
      ops: '營運管理員',
      content: '內容審核員',
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

  it('/admin 對三種角色皆為 true', () => {
    expect(canAdminAccessPath('super', '/admin')).toBe(true)
    expect(canAdminAccessPath('ops', '/admin')).toBe(true)
    expect(canAdminAccessPath('content', '/admin')).toBe(true)
  })

  it('/admin/settings 只有 super 為 true', () => {
    expect(canAdminAccessPath('super', '/admin/settings')).toBe(true)
    expect(canAdminAccessPath('ops', '/admin/settings')).toBe(false)
    expect(canAdminAccessPath('content', '/admin/settings')).toBe(false)
  })

  it('未知子路徑一律放行（安全預設值，避免誤擋）', () => {
    expect(canAdminAccessPath('super', '/admin/unknown')).toBe(true)
    expect(canAdminAccessPath('ops', '/admin/unknown')).toBe(true)
    expect(canAdminAccessPath('content', '/admin/unknown')).toBe(true)
  })

  it('帶有尾端子段落的路徑會依第一段解析', () => {
    expect(canAdminAccessPath('content', '/admin/users/detail')).toBe(
      canAdminAccessPath('content', '/admin/users'),
    )
    expect(canAdminAccessPath('ops', '/admin/users/detail')).toBe(true)
    expect(canAdminAccessPath('content', '/admin/users/detail')).toBe(false)
  })
})

describe('visibleNavGroupsFor', () => {
  function totalItems(role: AdminRole): number {
    return visibleNavGroupsFor(role).reduce((sum, g) => sum + g.items.length, 0)
  }

  it('super 可看到全部 10 個項目', () => {
    expect(totalItems('super')).toBe(10)
  })

  it('ops 可看到 5 個項目', () => {
    expect(totalItems('ops')).toBe(5)
  })

  it('content 可看到 6 個項目', () => {
    expect(totalItems('content')).toBe(6)
  })

  it('不會回傳空群組（每個群組至少有一個項目）', () => {
    for (const role of ADMIN_ROLES) {
      const groups = visibleNavGroupsFor(role)
      for (const group of groups) {
        expect(group.items.length).toBeGreaterThan(0)
      }
    }
  })

  it('content 角色看不到「系統」群組（稽核紀錄與系統設定皆無權限）', () => {
    const groups = visibleNavGroupsFor('content')
    expect(groups.find((g) => g.label === '系統')).toBeUndefined()
  })
})

describe('adminNavGroups', () => {
  it('定義了三個群組，共 10 個項目', () => {
    const total = adminNavGroups.reduce((sum, g) => sum + g.items.length, 0)
    expect(adminNavGroups.length).toBe(3)
    expect(total).toBe(10)
  })
})

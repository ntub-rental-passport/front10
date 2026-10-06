import { beforeEach, describe, expect, it, vi } from 'vitest'

const logAction = vi.hoisted(() => vi.fn())
vi.mock('./useAdminAudit', () => ({ useAdminAudit: () => ({ logAction }) }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('useAdminUsers', () => {
  it('展示管理員帳號使用同一種身分標籤', async () => {
    const { adminRoleLabels, useAdminUsers } = await import('./useAdminUsers')
    const { users } = useAdminUsers()
    expect(adminRoleLabels.admin).toBe('管理員')
    expect(users.value.find((user) => user.email === 'staff@rentmate.tw')?.role).toBe('admin')
    expect(users.value.find((user) => user.email === 'admin@rentmate.tw')?.role).toBe('admin')
  })

  it('展示帳號可以變更身分並記錄稽核', async () => {
    const { useAdminUsers } = await import('./useAdminUsers')
    const { users, setRole } = useAdminUsers()
    const user = users.value.find((item) => item.id === 'u-tenant-1')!
    setRole(user.id, 'landlord')
    expect(user.role).toBe('landlord')
    expect(logAction).toHaveBeenCalledWith('使用者管理', user.email, '角色由「租客」變更為「房東」')
  })

  it('展示帳號可以停用與啟用，停用原因會寫入稽核', async () => {
    const { useAdminUsers } = await import('./useAdminUsers')
    const { users, setStatus } = useAdminUsers()
    const user = users.value.find((item) => item.id === 'u-tenant-1')!
    setStatus(user.id, 'suspended', ' 測試原因 ')
    expect(user.status).toBe('suspended')
    expect(logAction).toHaveBeenLastCalledWith('使用者管理', user.email, '停用帳號：測試原因')
    setStatus(user.id, 'active')
    expect(user.status).toBe('active')
    expect(logAction).toHaveBeenLastCalledWith('使用者管理', user.email, '啟用帳號')
  })
})

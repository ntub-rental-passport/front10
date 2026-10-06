import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized, RouterOptions } from 'vue-router'
import type { AuthSession } from '@/src/composables/useAuth'

const state = vi.hoisted(() => ({
  session: null as AuthSession | null,
  guard: null as ((to: RouteLocationNormalized) => unknown) | null,
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    createWebHistory: actual.createMemoryHistory,
    createRouter: (options: RouterOptions) => {
      const router = actual.createRouter(options)
      vi.spyOn(router, 'beforeEach').mockImplementation((guard) => {
        state.guard = guard as (to: RouteLocationNormalized) => unknown
        return () => {}
      })
      return router
    },
  }
})

vi.mock('@/src/composables/useAuth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/src/composables/useAuth')>(),
  getAuthSession: () => state.session,
  syncSessionWithServer: vi.fn(async () => {}),
}))
vi.mock('@/src/composables/usePublicSettings', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/src/composables/usePublicSettings')>(),
  refreshPublicSettings: vi.fn(async () => {}),
  isMaintenanceBlocking: () => false,
}))

// 公開訪客載入 router 時，不應初始化後台展示集合。
vi.mock('@/src/composables/admin/useAdminUsers', () => {
  throw new Error('router 不應載入使用者展示集合')
})
vi.mock('@/src/composables/admin/useAdminAudit', () => {
  throw new Error('router 不應載入稽核展示集合')
})

beforeEach(() => {
  state.session = null
})

async function setup() {
  return (await import('./index')).default
}

function session(role: AuthSession['role']): AuthSession {
  return { email: 'staff@rentmate.tw', role, isAuthenticated: true, emailVerified: true, nickname: '管理員' }
}

describe('後台路由', () => {
  it('租補審核落入既有的未知後台路徑處理', async () => {
    const router = await setup()
    const removedPath = `/admin/${'subsidy'}`
    const removed = router.resolve(removedPath)
    const unknown = router.resolve('/admin/does-not-exist')
    expect(removed.matched.map((record) => record.path)).toEqual(unknown.matched.map((record) => record.path))
    expect(removed.matched.at(-1)?.redirect).toBe('/admin')
  })

  it('未登入者仍需先到內部登入入口', async () => {
    const router = await setup()
    expect(await state.guard!(router.resolve('/admin/settings'))).toEqual({
      path: '/staff-login', query: { redirect: '/admin/settings' },
    })
  })

  it.each(['tenant', 'landlord'] as const)('%s 不能使用後台', async (role) => {
    const router = await setup()
    state.session = session(role)
    expect(await state.guard!(router.resolve('/admin/settings'))).toBe(role === 'tenant' ? '/app' : '/landlord')
  })

  it.each(['/admin/users', '/admin/audit', '/admin/settings'])('管理員能使用 %s', async (path) => {
    const router = await setup()
    state.session = session('admin')
    expect(await state.guard!(router.resolve(path))).toBe(true)
  })
})

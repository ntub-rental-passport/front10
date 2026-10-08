import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized, RouterOptions } from 'vue-router'
import type { AuthSession } from '@/src/composables/useAuth'

const state = vi.hoisted(() => ({
  session: null as AuthSession | null,
  guard: null as ((to: RouteLocationNormalized) => unknown) | null,
  settingsLoaded: false,
  maintenanceOn: false,
  syncSessionWithServer: vi.fn(async () => {}),
  refreshPublicSettings: vi.fn(async () => {}),
  refreshPublicSettingsInBackground: vi.fn((): Promise<void> | null => null),
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
  syncSessionWithServer: state.syncSessionWithServer,
}))
vi.mock('@/src/composables/usePublicSettings', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/src/composables/usePublicSettings')>(),
  hasLoadedPublicSettings: () => state.settingsLoaded,
  refreshPublicSettings: state.refreshPublicSettings,
  refreshPublicSettingsInBackground: state.refreshPublicSettingsInBackground,
  isMaintenanceBlocking: () => state.maintenanceOn,
}))

// 公開訪客載入 router 時，不應初始化後台展示集合。
vi.mock('@/src/composables/admin/useAdminUsers', () => {
  throw new Error('router 不應載入使用者展示集合')
})
vi.mock('@/src/composables/admin/useAdminAudit', () => {
  throw new Error('router 不應載入稽核展示集合')
})

beforeEach(() => {
  vi.resetModules()
  state.session = null
  state.guard = null
  state.settingsLoaded = false
  state.maintenanceOn = false
  state.syncSessionWithServer.mockReset().mockResolvedValue(undefined)
  state.refreshPublicSettings.mockReset().mockImplementation(async () => {
    state.settingsLoaded = true
  })
  state.refreshPublicSettingsInBackground.mockReset().mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function setup() {
  return (await import('./index')).default
}

function session(role: AuthSession['role']): AuthSession {
  return { email: 'staff@rentmate.tw', role, isAuthenticated: true, emailVerified: true, nickname: '管理員' }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
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

describe('公開設定與維護模式', () => {
  it('首次對帳尚未完成時，公開設定已經開始讀取，並等待兩者完成', async () => {
    const router = await setup()
    state.session = session('admin')
    const sync = deferred()
    const settings = deferred()
    state.syncSessionWithServer.mockReturnValueOnce(sync.promise)
    state.refreshPublicSettings.mockReturnValueOnce(settings.promise)
    let finished = false
    const navigation = Promise.resolve(state.guard!(router.resolve('/admin/settings'))).then((result) => {
      finished = true
      return result
    })

    expect(state.syncSessionWithServer).toHaveBeenCalledTimes(1)
    expect(state.refreshPublicSettings).toHaveBeenCalledTimes(1)
    sync.resolve()
    await sync.promise
    expect(finished).toBe(false)

    state.session = null
    settings.resolve()
    expect(await navigation).toEqual({ path: '/staff-login', query: { redirect: '/admin/settings' } })
  })

  it('未登入者首次讀設定仍要等，維護模式開啟時先導向維護頁', async () => {
    const router = await setup()
    const settings = deferred()
    state.refreshPublicSettings.mockReturnValueOnce(settings.promise)
    let finished = false
    const navigation = Promise.resolve(state.guard!(router.resolve('/'))).then((result) => {
      finished = true
      return result
    })
    await Promise.resolve()
    expect(finished).toBe(false)
    expect(state.syncSessionWithServer).not.toHaveBeenCalled()
    state.maintenanceOn = true
    settings.resolve()
    expect(await navigation).toBe('/maintenance')
  })

  it('每次載入頁面只對帳一次', async () => {
    const router = await setup()
    state.session = session('admin')
    await state.guard!(router.resolve('/admin/settings'))
    await state.guard!(router.resolve('/admin/users'))
    expect(state.syncSessionWithServer).toHaveBeenCalledTimes(1)
  })

  it('設定讀過後，背景請求尚未完成也能換頁', async () => {
    const router = await setup()
    await state.guard!(router.resolve('/'))
    const refresh = deferred()
    state.refreshPublicSettingsInBackground.mockReturnValueOnce(refresh.promise)
    expect(await state.guard!(router.resolve('/login'))).toBe(true)
    expect(state.refreshPublicSettings).toHaveBeenCalledTimes(1)
    expect(state.refreshPublicSettingsInBackground).toHaveBeenCalledTimes(1)
    refresh.resolve()
    await refresh.promise
  })

  it.each([
    { maintenanceOn: true, currentPath: '/app', redirect: '/maintenance' },
    { maintenanceOn: false, currentPath: '/maintenance', redirect: '/' },
    { maintenanceOn: true, currentPath: '/admin/settings', redirect: null },
    { maintenanceOn: true, currentPath: '/staff-login', redirect: null },
    { maintenanceOn: true, currentPath: '/maintenance', redirect: null },
    { maintenanceOn: false, currentPath: '/login', redirect: null },
  ])('背景讀完時重新檢查目前路徑 $currentPath（維護：$maintenanceOn）', async ({ maintenanceOn, currentPath, redirect }) => {
    const router = await setup()
    state.settingsLoaded = true
    const refresh = deferred()
    state.refreshPublicSettingsInBackground.mockReturnValueOnce(refresh.promise)
    const replace = vi.spyOn(router, 'replace').mockResolvedValue(undefined)
    expect(await state.guard!(router.resolve('/'))).toBe(true)

    router.currentRoute.value = router.resolve(currentPath)
    state.maintenanceOn = maintenanceOn
    refresh.resolve()
    await refresh.promise
    if (redirect) {
      expect(replace).toHaveBeenCalledExactlyOnceWith(redirect)
    } else {
      expect(replace).not.toHaveBeenCalled()
    }
  })

  it.each([
    { maintenanceOn: true, target: '/', currentPath: '/', redirect: '/maintenance' },
    { maintenanceOn: false, target: '/maintenance', currentPath: '/maintenance', redirect: '/' },
  ])('守衛已導向 $redirect 時，背景讀完不重複跳轉', async ({ maintenanceOn, target, currentPath, redirect }) => {
    const router = await setup()
    state.settingsLoaded = true
    state.maintenanceOn = maintenanceOn
    router.currentRoute.value = router.resolve(currentPath)
    const refresh = deferred()
    state.refreshPublicSettingsInBackground.mockReturnValueOnce(refresh.promise)
    const replace = vi.spyOn(router, 'replace').mockResolvedValue(undefined)

    expect(await state.guard!(router.resolve(target))).toBe(redirect)
    refresh.resolve()
    await refresh.promise
    expect(replace).not.toHaveBeenCalled()
  })

  it('快取仍新鮮時，不安排背景維護檢查', async () => {
    const router = await setup()
    state.settingsLoaded = true
    router.currentRoute.value = router.resolve('/')
    const replace = vi.spyOn(router, 'replace').mockResolvedValue(undefined)
    expect(await state.guard!(router.resolve('/'))).toBe(true)
    state.maintenanceOn = true
    await Promise.resolve()
    expect(replace).not.toHaveBeenCalled()
    expect(state.refreshPublicSettings).not.toHaveBeenCalled()
  })

  it('背景維護跳轉失敗時忽略導覽錯誤', async () => {
    const router = await setup()
    state.settingsLoaded = true
    router.currentRoute.value = router.resolve('/')
    const refresh = deferred()
    state.refreshPublicSettingsInBackground.mockReturnValueOnce(refresh.promise)
    const replace = vi.spyOn(router, 'replace').mockRejectedValue(new Error('navigation cancelled'))
    expect(await state.guard!(router.resolve('/'))).toBe(true)
    state.maintenanceOn = true
    refresh.resolve()
    await refresh.promise
    expect(replace).toHaveBeenCalledExactlyOnceWith('/maintenance')
  })
})

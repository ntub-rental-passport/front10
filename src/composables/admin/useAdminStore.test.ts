import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const data = new Map<string, string>()
const storage = {
  getItem: vi.fn((key: string) => data.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
  removeItem: vi.fn((key: string) => { data.delete(key) }),
  key: vi.fn((index: number) => [...data.keys()][index] ?? null),
  get length() { return data.size },
}
const addEventListener = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  data.clear()
  vi.stubGlobal('window', { localStorage: storage, addEventListener })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('展示 collection 的環境隔離', () => {
  it('正式站回傳空陣列，不執行種子、遷移、儲存讀寫或跨分頁監聽', async () => {
    vi.stubEnv('DEV', false)
    data.set('rentmate-admin:users', '[{"name":"舊展示"}]')
    const { createAdminCollection, resetAdminData } = await import('./useAdminStore')
    const seed = vi.fn(() => [{ name: '展示' }])
    const migrate = vi.fn((rows) => rows)
    const collection = createAdminCollection('users', seed, migrate)
    expect(collection.value).toEqual([])
    collection.value.push({ name: '記憶體異動' })
    await nextTick()
    resetAdminData()
    expect(seed).not.toHaveBeenCalled()
    expect(migrate).not.toHaveBeenCalled()
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(addEventListener).not.toHaveBeenCalled()
  })

  it('本地仍初始化種子、共用 collection、監聽深層變動並可重置', async () => {
    vi.stubEnv('DEV', true)
    const { createAdminCollection, resetAdminData } = await import('./useAdminStore')
    const seed = vi.fn(() => [{ name: '展示' }])
    const collection = createAdminCollection('users', seed)
    expect(collection.value).toEqual([{ name: '展示' }])
    expect(seed).toHaveBeenCalledTimes(1)
    expect(createAdminCollection('users', seed)).toBe(collection)
    expect(storage.setItem).toHaveBeenCalledWith('rentmate-admin:users', '[{"name":"展示"}]')
    expect(addEventListener).toHaveBeenCalledWith('storage', expect.any(Function))
    collection.value[0]!.name = '更新'
    await nextTick()
    expect(data.get('rentmate-admin:users')).toBe('[{"name":"更新"}]')
    resetAdminData()
    await nextTick()
    expect(collection.value).toEqual([{ name: '展示' }])
    expect(seed).toHaveBeenCalledTimes(2)
  })

  it('本地仍讀取與遷移快取，跨分頁事件同步且不重複寫回', async () => {
    vi.stubEnv('DEV', true)
    data.set('rentmate-admin:users', '[{"name":"快取"}]')
    const { createAdminCollection } = await import('./useAdminStore')
    const seed = vi.fn(() => [{ name: '展示' }])
    const migrate = vi.fn((rows: { name: string }[]) => rows)
    const collection = createAdminCollection('users', seed, migrate)
    expect(seed).not.toHaveBeenCalled()
    expect(migrate).toHaveBeenCalledWith([{ name: '快取' }])
    expect(collection.value).toEqual([{ name: '快取' }])
    storage.setItem.mockClear()
    data.set('rentmate-admin:users', '[{"name":"另一分頁"}]')
    addEventListener.mock.calls[0]![1]({ key: 'rentmate-admin:users', newValue: data.get('rentmate-admin:users') })
    await nextTick()
    expect(collection.value).toEqual([{ name: '另一分頁' }])
    expect(migrate).toHaveBeenCalledTimes(2)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each([false, true])('DEV=%s 時只在正式站清除後台前綴，保留 session 與其他 key', async (dev) => {
    vi.stubEnv('DEV', dev)
    data.set('rentmate-admin:users-old', '[]')
    data.set('rentmate-admin:audit', '[]')
    data.set('rentmate-admin:unknown-old-module', '[]')
    data.set('rentmate-session', '登入憑證')
    data.set('rentmate-admin-other', '其他資料')
    const { clearLegacyAdminData } = await import('./useAdminStore')
    clearLegacyAdminData()
    expect([...data.keys()].filter((key) => key.startsWith('rentmate-admin:'))).toHaveLength(dev ? 3 : 0)
    expect(data.get('rentmate-session')).toBe('登入憑證')
    expect(data.get('rentmate-admin-other')).toBe('其他資料')
    expect(storage.removeItem).toHaveBeenCalledTimes(dev ? 0 : 3)
  })

  it('正式站 recordLogin 不讀寫展示帳號快取或新增監聽', async () => {
    vi.stubEnv('DEV', false)
    const { adminUsersCollection, recordLogin } = await import('./useAdminUsers')
    recordLogin('amy.wang@example.com')
    await nextTick()
    expect(adminUsersCollection.value).toEqual([])
    const { SEED_AUDIT_EVENT_IDS } = await import('@/src/mocks/admin/audit')
    expect([...SEED_AUDIT_EVENT_IDS]).toEqual([])
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(addEventListener).not.toHaveBeenCalled()
  })
})

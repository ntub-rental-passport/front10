import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { AuditEvent } from '@/src/mocks/admin-seed'

const api = vi.hoisted(() => ({ fetchAdminAudit: vi.fn(), fetchMonitorEvents: vi.fn() }))
const state = vi.hoisted(() => ({ localEvents: [] as AuditEvent[] }))
vi.mock('@/src/services/adminAuditApi', () => api)
vi.mock('@/src/services/adminMetricsApi', () => api)
vi.mock('./useAdminAudit', () => ({
  useAdminAudit: () => ({ events: ref(state.localEvents), retentionDays: ref(30) }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
  state.localEvents = [{
    id: 'local', at: '2026-10-06T10:00:00Z', actor: 'local@example.com',
    action: '訂閱', target: '展示', detail: '本地事件',
  }]
  api.fetchAdminAudit.mockResolvedValue([
    { id: 1, at: '2026-10-06T09:00:00Z', actor: 'admin', action: '使用者管理', target: '真實帳號', detail: '後端事件' },
    { id: 2, at: '2026-01-01T09:00:00Z', actor: 'admin', action: '使用者管理', target: '真實帳號', detail: '過期事件' },
  ])
  api.fetchMonitorEvents.mockResolvedValue([
    { id: 3, at: '2026-10-06T11:00:00Z', kind: 'down', serviceLabel: 'DB', detail: '斷線' },
  ])
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('useAuditLog', () => {
  it.each([false, true])('DEV=%s 共用排序與保留天數，只在本地合併瀏覽器事件', async (dev) => {
    vi.stubEnv('DEV', dev)
    const { useAuditLog } = await import('./useAuditLog')
    const audit = useAuditLog()
    await audit.reload()
    expect(audit.rows.value.map((event) => event.id)).toEqual(dev ? ['mon-3', 'local', 'srv-1'] : ['mon-3', 'srv-1'])
    expect(audit.serverFailed.value).toBe(false)
    expect(audit.loading.value).toBe(false)
  })

  it('正式站讀不到後端時不以本機紀錄取代，並回報讀取失敗', async () => {
    vi.stubEnv('DEV', false)
    api.fetchAdminAudit.mockResolvedValue(null)
    api.fetchMonitorEvents.mockResolvedValue(null)
    const { useAuditLog } = await import('./useAuditLog')
    const audit = useAuditLog()
    await audit.reload()
    expect(audit.rows.value).toEqual([])
    expect(audit.serverFailed.value).toBe(true)
  })
})

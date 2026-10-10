import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { realAccountToRow, type UserDirectoryRow } from '@/src/utils/admin-user-directory'
import type { UserNotification } from '@/src/mocks/admin/notifications'
import MaintenanceTickets from './maintenance-tickets.vue'
import NotificationsDetail from './notifications-detail.vue'
import SentLogTab from '@/src/components/admin/notifications/SentLogTab.vue'

const state = vi.hoisted(() => ({ rows: [] as UserDirectoryRow[], messages: [] as UserNotification[] }))
vi.mock('@/src/composables/admin/useAdminDirectory', () => ({
  useAdminDirectory: () => ({ rows: ref(state.rows) }),
}))
vi.mock('@/src/composables/admin/useAdminNotifications', () => ({
  useAdminNotifications: () => ({ messages: ref(state.messages), messagesState: ref('ready') }),
  loadMessages: vi.fn(), followPendingEmails: vi.fn(), TEST_SOURCE_LABEL: '測試發送',
}))
vi.mock('@/src/composables/useNow', () => ({ useNow: () => ref(new Date()) }))

beforeEach(() => {
  vi.stubEnv('DEV', false)
  state.rows = [realAccountToRow({
    id: 7, email: 'real@example.com', displayName: '真實暱稱', roles: ['user'],
    status: 'active', emailVerified: true, createdAt: null, lastLoginAt: null,
  })]
  state.messages = [{
    id: 'message-1', batchId: 'batch-1', recipientLabel: '指定使用者', sourceLabel: '',
    userEmail: 'real@example.com', title: '後端通知', body: '通知內容', category: '系統',
    channels: ['inapp'], deliveryStatus: { inapp: 'sent' }, createdAt: new Date().toISOString(), read: false,
  }]
})
afterEach(() => vi.unstubAllEnvs())

async function render(component: Component, path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/admin/maintenance-tickets', component: MaintenanceTickets },
    { path: '/admin/notifications/:batchId', component: NotificationsDetail },
    { path: '/admin/notifications', component: SentLogTab },
  ] })
  await router.push(path)
  const app = createSSRApp(component)
  app.use(router)
  return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, '')
}

describe('後台暱稱使用真實目錄', () => {
  it.each(['7', 'real-7'])('工單依 id=%s 找到真實帳號，查不到則保留 id', async (id) => {
    expect(await render(MaintenanceTickets, `/admin/maintenance-tickets?user=${id}`)).toContain('真實暱稱')
    state.rows = []
    const html = await render(MaintenanceTickets, `/admin/maintenance-tickets?user=${id}`)
    expect(html).not.toContain('真實暱稱')
    expect(html).toContain(`<span class="font-semibold">${id}</span>`)
  })

  it.each([
    ['通知詳情', NotificationsDetail, '/admin/notifications/batch-1'],
    ['寄送紀錄', SentLogTab, '/admin/notifications'],
  ] as const)('%s 依 email 找到真實暱稱，查不到則保留 email', async (_, component, path) => {
    expect(await render(component, path)).toContain('真實暱稱')
    state.rows = []
    const html = await render(component, path)
    expect(html).not.toContain('真實暱稱')
    expect(html).toContain('real@example.com')
  })
})

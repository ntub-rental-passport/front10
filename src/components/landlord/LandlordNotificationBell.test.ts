import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import LandlordNotificationBell from './LandlordNotificationBell.vue'
import { useNotifications } from '@/src/composables/useNotifications'
import { useLandlordOverviewTasks } from '@/src/composables/useLandlordOverviewTasks'
import type { OverviewTask } from '@/src/services/landlordWorkspaceApi'

const state = vi.hoisted(() => ({ unreadCount: 0, tasks: [] as OverviewTask[] }))

vi.mock('@/src/composables/useNotifications', () => ({
  useNotifications: vi.fn(() => ({
    inboxItems: ref([]),
    unreadCount: ref(state.unreadCount),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    loading: ref(false),
    loadError: ref(''),
    actionError: ref(''),
    refresh: vi.fn(),
  })),
}))

vi.mock('@/src/composables/useLandlordOverviewTasks', () => ({
  useLandlordOverviewTasks: vi.fn(() => ({
    tasks: ref(state.tasks),
    loading: ref(false),
    loadError: ref(''),
    refresh: vi.fn(),
  })),
}))

beforeEach(() => {
  state.unreadCount = 0
  state.tasks = []
  vi.mocked(useNotifications).mockClear()
  vi.mocked(useLandlordOverviewTasks).mockClear()
})

async function render(unreadCount = 0, buckets: OverviewTask['bucket'][] = []) {
  state.unreadCount = unreadCount
  state.tasks = buckets.map((bucket, index) => ({
    id: String(index),
    kind: 'rent',
    bucket,
    date: '2026-10-10',
    title: '待收租金',
    meta: '幸福公寓 101',
    timing: '到期待處理',
    route: '/landlord/finance',
  }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/landlord')
  const app = createSSRApp(LandlordNotificationBell)
  app.use(router)
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

describe('房東通知與待辦鈴鐺', () => {
  it('未讀與急件加總為徽章，無障礙標籤分別說明兩種數量', async () => {
    const html = await render(3, ['overdue', 'today', 'upcoming'])
    expect(html).toMatch(/<span\b[^>]*>5<\/span>/)
    expect(html).toContain('aria-label="通知，3 則未讀，2 件急件待辦"')
  })

  it('只有未讀時顯示未讀數，upcoming 不算急件', async () => {
    const html = await render(3, ['upcoming', 'upcoming'])
    expect(html).toMatch(/<span\b[^>]*>3<\/span>/)
    expect(html).toContain('aria-label="通知，3 則未讀，0 件急件待辦"')
  })

  it('只有急件時也顯示徽章', async () => {
    const html = await render(0, ['overdue', 'today'])
    expect(html).toMatch(/<span\b[^>]*>2<\/span>/)
    expect(html).toContain('aria-label="通知，0 則未讀，2 件急件待辦"')
  })

  it('只有 upcoming 待辦時沒有徽章，無障礙標籤只顯示通知', async () => {
    const html = await render(0, ['upcoming'])
    expect(html).not.toMatch(/<span\b/)
    expect(html).toContain('aria-label="通知"')
  })

  it('未讀與待辦都沒有時不渲染徽章', async () => {
    const html = await render()
    expect(html).not.toMatch(/<span\b/)
    expect(html).toContain('aria-label="通知"')
  })

  it('加總超過九十九時顯示上限，無障礙標籤保留各自真實數量', async () => {
    const html = await render(99, ['overdue', 'today'])
    expect(html).toMatch(/<span\b[^>]*>99\+<\/span>/)
    expect(html).toContain('aria-label="通知，99 則未讀，2 件急件待辦"')
  })

  it('同時使用房東通知來源與房東待辦來源', async () => {
    await render()
    expect(useNotifications).toHaveBeenCalledExactlyOnceWith('landlord')
    expect(useLandlordOverviewTasks).toHaveBeenCalledExactlyOnceWith()
  })
})

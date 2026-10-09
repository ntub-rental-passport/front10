import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import TenantNotificationBell from './TenantNotificationBell.vue'
import { useNotifications } from '@/src/composables/useNotifications'

const state = vi.hoisted(() => ({ unreadCount: 0 }))

vi.mock('@/src/composables/useNotifications', () => ({
  useNotifications: vi.fn(() => ({ unreadCount: ref(state.unreadCount) })),
}))

beforeEach(() => {
  state.unreadCount = 0
  vi.mocked(useNotifications).mockClear()
})

async function render(unreadCount = 0) {
  state.unreadCount = unreadCount
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/app')
  const app = createSSRApp(TenantNotificationBell)
  app.use(router)
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

describe('租客通知鈴鐺', () => {
  it('沒有未讀通知時不渲染徽章，無障礙標籤只顯示通知中心', async () => {
    const html = await render(0)
    expect(html).not.toMatch(/<span\b/)
    expect(html).toContain('aria-label="通知中心"')
  })

  it('三則未讀通知時徽章與無障礙標籤都顯示真實數量', async () => {
    const html = await render(3)
    expect(html).toMatch(/<span\b[^>]*>3<\/span>/)
    expect(html).toContain('aria-label="通知中心，3 則未讀"')
  })

  it('超過九十九則時徽章顯示上限，無障礙標籤仍保留真實數量', async () => {
    const html = await render(150)
    expect(html).toMatch(/<span\b[^>]*>99\+<\/span>/)
    expect(html).toContain('aria-label="通知中心，150 則未讀"')
    expect(html).not.toContain('aria-label="通知中心，99+ 則未讀"')
  })

  it('使用租客通知來源並連往租客通知中心', async () => {
    const html = await render()
    expect(useNotifications).toHaveBeenCalledExactlyOnceWith('tenant')
    expect(html).toMatch(/^<a\b[^>]*href="\/app\/notifications"/)
    expect(html).toMatch(/<svg\b[^>]*aria-hidden="true"/)
  })
})

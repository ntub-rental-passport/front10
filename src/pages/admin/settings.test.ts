import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/src/composables/admin/useSystemHealth', () => ({
  useSystemHealth: () => ({ responseMs: ref(null), checkedAt: ref(null) }),
}))
afterEach(() => vi.unstubAllEnvs())

describe('正式站設定頁', () => {
  it('保留訂閱到期提醒欄位，沒有訂閱時顯示明確空狀態', async () => {
    vi.stubEnv('DEV', false)
    const { default: Settings } = await import('./settings.vue')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/settings', component: Settings }] })
    await router.push('/admin/settings')
    const app = createSSRApp(Settings)
    app.use(router)
    const html = (await renderToString(app)).replace(/<!--.*?-->/g, '')
    expect(html).toContain('訂閱到期提醒天數（天）')
    expect(html).toContain('id="subscriptionExpiringSoonDays"')
    expect(html).toContain('目前沒有訂閱資料')
    expect(html).not.toContain('照這個值：目前沒有人會被標示')
    expect(html).not.toContain('維護與重置')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import TenantAvatarButton from './TenantAvatarButton.vue'
import type { AuthSession } from '@/src/composables/useAuth'

const state = vi.hoisted(() => ({ account: null as AuthSession | null }))
vi.mock('@/src/composables/useAuth', () => ({ getAuthSession: () => state.account }))

interface AvatarState {
  onImageError: () => void
}

beforeEach(() => {
  state.account = {
    email: 'tenant@example.com',
    isAuthenticated: true,
    role: 'tenant',
    emailVerified: true,
    nickname: '小明',
    picture: null,
  }
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/app')
  let handlers!: AvatarState
  const app = createSSRApp(TenantAvatarButton)
  app.use(router)
  app.mixin({
    created() {
      if (!this.$parent) {
        handlers = (this.$ as unknown as { setupState: AvatarState }).setupState
      }
    },
  })
  const html = await renderToString(app)
  return {
    html,
    async imageError() {
      handlers.onImageError()
      await nextTick()
      const snapshot = createSSRApp({ ...TenantAvatarButton, setup: () => handlers })
      snapshot.use(router)
      return renderToString(snapshot)
    },
  }
}

describe('租客帳戶頭像', () => {
  it('有圖片時渲染帳號圖片，保留帳戶連結與觸控尺寸', async () => {
    state.account!.picture = 'https://example.com/avatar.png'
    const { html } = await render()
    expect(html).toContain('href="/app/account"')
    expect(html).toContain('aria-label="我的帳戶"')
    expect(html).toContain('h-11 w-11')
    expect(html).toContain('h-8 w-8')
    expect(html).toMatch(/<img\b[^>]*src="https:\/\/example.com\/avatar.png"/)
    expect(html).not.toContain('>小</span>')
  })

  it.each([
    ['小明', '小'],
    [' alice ', 'A'],
    ['', 'R'],
    ['   ', 'R'],
    [null, 'R'],
  ])('沒有圖片時，名稱 %s 顯示 %s', async (nickname, initial) => {
    state.account!.nickname = nickname
    const { html } = await render()
    expect(html).not.toContain('<img')
    expect(html).toContain(`>${initial}</span>`)
    expect(html).toContain('rounded-full bg-primary/10')
  })

  it('舊版 session 沒有 picture 欄位時仍顯示首字', async () => {
    delete state.account!.picture
    expect((await render()).html).toContain('>小</span>')
  })

  it('沒有登入狀態時使用 R', async () => {
    state.account = null
    expect((await render()).html).toContain('>R</span>')
  })

  it('圖片載入錯誤後移除圖片並顯示名稱首字', async () => {
    state.account!.picture = 'https://example.com/missing.png'
    const avatar = await render()
    expect(avatar.html).toContain('<img')
    const html = await avatar.imageError()
    expect(html).not.toContain('<img')
    expect(html).toContain('>小</span>')
    expect(html).toContain('href="/app/account"')
  })
})

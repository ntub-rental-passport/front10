import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppLayout from './AppLayout.vue'

vi.mock('@/src/composables/useFeatureGate', () => ({
  useFeatureGate: () => ({ blocked: ref(false), outage: ref(null), isPathUnderMaintenance: () => false }),
}))
vi.mock('@/src/composables/useDeviceGate', () => ({
  useTenantDeviceGate: () => ({ blocked: ref(true) }),
  useFieldCaptureSupport: () => ({ coarsePointer: ref(false) }),
}))
vi.mock('@/src/composables/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: ref(0) }),
}))
vi.mock('@/src/composables/useAuth', () => ({ getAuthSession: () => null }))
vi.mock('@/src/components/maintenance/MaintenanceToaster.vue', () => ({
  default: { render: () => null },
}))

async function render(path: string, back?: string | null) {
  const page = { template: '<p>流程頁面內容</p>' }
  const history = createMemoryHistory()
  const router = createRouter({
    history,
    routes: [
      {
        path: '/app/contract/editor', component: page,
        meta: { mobileFlow: { title: '校對合約欄位', backPath: '/app/contract/scanner' } },
      },
      {
        path: '/app/contract-analysis', component: page,
        meta: { mobileFlow: { title: '契約風險分析', backPath: '/app/contract/editor' } },
      },
      { path: '/:pathMatch(.*)*', component: page },
    ],
  })
  await router.push(path)
  // memory history 不填 back，明確模擬瀏覽器由 Vue Router 維護的上一筆路徑。
  history.replace(path, { back })
  const push = vi.spyOn(router, 'push')
  const routerBack = vi.spyOn(router, 'back').mockImplementation(() => {})
  let handlers!: { goBack: () => void }
  const app = createSSRApp(AppLayout)
  app.use(router)
  app.mixin({
    created() {
      if (!this.$parent) {
        handlers = (this.$ as unknown as { setupState: typeof handlers }).setupState
      }
    },
  })
  const html = await renderToString(app)
  return { html, push, routerBack, goBack: () => handlers.goBack() }
}

describe('租客手機版型', () => {
  it('一般頁面頂部依序顯示品牌、通知與帳戶，底部為五個相同樣式的入口', async () => {
    const { html } = await render('/app/contract/scanner')
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0]
    expect(header).toContain('sm:hidden')
    expect(header).toMatch(/href="\/app"[\s\S]*租隊友[\s\S]*aria-label="通知中心"[\s\S]*aria-label="我的帳戶"/)
    expect(header).not.toContain('RentMate</span>')
    const nav = html.match(/<nav\b[^>]*class="fixed[\s\S]*?<\/nav>/)![0]
    expect([...nav.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)).toEqual([
      '/app/handover', '/app/contract/scanner', '/app/garbage', '/app/repairs', '/app/notes',
    ])
    expect(nav.match(/flex flex-1 flex-col/g)).toHaveLength(5)
    expect(nav).toMatch(/href="\/app\/contract\/scanner"[^>]*class="[^"]*text-primary/)
    expect(html).toContain('pb-[calc(4rem+env(safe-area-inset-bottom))]')
    expect(html).toContain('流程頁面內容')
    expect(html).not.toContain('這一頁請用電腦開')
  })

  it.each([
    ['/app/contract/editor', '校對合約欄位'],
    ['/app/contract-analysis', '契約風險分析'],
  ])('%s 隱藏手機底列與頁尾，只保留安全區留白及流程頂列', async (path, title) => {
    const { html } = await render(path)
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0]
    expect(header).toContain('sm:hidden')
    expect(header).toContain('aria-label="返回"')
    expect(header).toContain('h-11 w-11')
    expect(header).toContain(title)
    expect(header).not.toContain('我的帳戶')
    expect(header).not.toContain('通知中心')
    expect(html).not.toMatch(/<nav\b[^>]*class="fixed/)
    const main = html.match(/<main\b[^>]*>/)![0]
    expect(main).toContain('sm:pb-0')
    expect(main).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(html).not.toContain('pb-[calc(4rem+env(safe-area-inset-bottom))]')
    expect(html).toMatch(/<footer\b[^>]*class="[^"]*hidden sm:block/)
    expect(html).toContain('流程頁面內容')
  })

  it('有站內上一頁時使用 router.back', async () => {
    const layout = await render('/app/contract/editor', '/app/contract/scanner')
    layout.goBack()
    expect(layout.routerBack).toHaveBeenCalledOnce()
    expect(layout.push).not.toHaveBeenCalled()
  })

  it.each([
    ['/app/contract/editor', '/app/contract/scanner'],
    ['/app/contract-analysis', '/app/contract/editor'],
  ])('直接進入 %s 時導向預設返回頁', async (path, backPath) => {
    const layout = await render(path, null)
    layout.goBack()
    expect(layout.routerBack).not.toHaveBeenCalled()
    expect(layout.push).toHaveBeenCalledWith(backPath)
  })
})

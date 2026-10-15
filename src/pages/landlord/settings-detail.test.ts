import { beforeEach, expect, it, vi } from 'vitest'
import { computed, createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import SettingsDetail from './settings-detail.vue'

const refresh = vi.fn()
const pushState = ref('off')
const pushError = ref('')
vi.mock('@/src/composables/usePushSubscription', () => ({
  usePushSubscription: () => ({
    state: pushState,
    error: pushError,
    canToggle: computed(() => ['on', 'off'].includes(pushState.value)),
    statusText: computed(() => (pushState.value === 'on' ? '已開啟；此帳號共 2 台裝置' : '已關閉')),
    refresh,
    enable: vi.fn(),
    disable: vi.fn(),
  }),
}))
vi.mock('@/src/composables/useLandlordWorkspace', () => ({
  useLandlordWorkspace: () => ({
    properties: ref([]),
    tenants: ref([]),
    rooms: ref([]),
    activeTenants: ref([]),
    loading: ref(false),
  }),
}))
vi.mock('@/src/composables/useLandlordSettings', () => ({
  useLandlordSettings: () => ({
    state: { displayName: '測試房東', ownerOnly: true, emailNotifications: true },
    session: null,
    completeness: ref(0),
    saveProfile: vi.fn(),
    saveNotifications: vi.fn(),
    inviteMember: vi.fn(),
    changeMemberRole: vi.fn(),
    removeMember: vi.fn(),
  }),
}))
vi.mock('@/src/composables/usePublicSettings', () => ({ publicSettings: ref({}) }))
vi.mock('@/src/composables/useAuth', () => ({ signOut: vi.fn() }))
vi.mock('@/src/services/landlordApiClient', () => ({ landlordRequest: vi.fn() }))

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/landlord/settings/:section', component: SettingsDetail },
      { path: '/landlord/settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/landlord/settings/notifications')
  const app = createSSRApp(SettingsDetail)
  app.use(router)
  return renderToString(app)
}

beforeEach(() => {
  vi.clearAllMocks()
  pushState.value = 'off'
  pushError.value = ''
})

it('別人的工作區仍能切換自己的推播，且位於通知管道與提醒偏好之間的獨立 panel', async () => {
  const html = await render()
  const input = html.match(/<input\b[^>]*aria-label="推播通知"[^>]*>/)?.[0]
  expect(input).toBeDefined()
  expect(input).not.toContain('disabled')
  expect(refresh).toHaveBeenCalledOnce()
  expect(html).toMatch(/<section class="panel"[^>]*>[\s\S]*?推播通知[\s\S]*?<\/section>\s*<form/)
  expect(html.indexOf('通知管道')).toBeLessThan(html.indexOf('推播通知'))
  expect(html.indexOf('推播通知')).toBeLessThan(html.indexOf('<form'))
  expect(html.match(/<form\b[\s\S]*?<\/form>/)?.[0]).not.toContain('推播通知')
  expect(html.match(/<button[^>]*disabled[^>]*>[\s\S]*?儲存通知設定/)).not.toBeNull()
})

it('房東推播列顯示裝置數與切換失敗原因', async () => {
  pushState.value = 'on'
  pushError.value = '移除訂閱失敗'
  const html = await render()
  expect(html).toContain('已開啟；此帳號共 2 台裝置')
  expect(html).toContain('移除訂閱失敗')
  expect(html.match(/<input\b[^>]*aria-label="推播通知"[^>]*>/)?.[0]).toContain('checked')
})

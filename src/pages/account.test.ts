import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import Account from './account.vue'
import { useNotifications } from '@/src/composables/useNotifications'
import { publicSettings } from '@/src/composables/usePublicSettings'

const mocks = vi.hoisted(() => ({
  saveNickname: vi.fn(),
  signOut: vi.fn(),
  downloadAccountData: vi.fn(),
}))
const unreadCount = ref(0)
const pushState = ref('off')
const pushDeviceCount = ref(0)
const pushError = ref('')

vi.mock('@/src/composables/usePushSubscription', async () => {
  const { computed, ref } = await import('vue')
  return {
    usePushSubscription: () => ({
      state: pushState,
      loading: ref(false),
      error: pushError,
      deviceCount: pushDeviceCount,
      statusText: computed(() => {
        if (pushState.value === 'unsupported-server') return '伺服器尚未啟用推播'
        if (pushState.value === 'on') return `已開啟；此帳號共 ${pushDeviceCount.value} 台裝置`
        return '已關閉'
      }),
      canToggle: computed(() => ['on', 'off'].includes(pushState.value)),
      refresh: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
    }),
  }
})

vi.mock('@/src/composables/useAuth', () => ({
  getAuthSession: () => ({ nickname: '測試租客', email: 'tenant@example.com', role: 'tenant' }),
  finishNicknameSetup: mocks.saveNickname,
  signOut: mocks.signOut,
}))
vi.mock('@/src/services/tenantExportApi', () => ({ downloadAccountData: mocks.downloadAccountData }))
vi.mock('@/src/composables/useNotifications', () => ({
  useNotifications: vi.fn(() => ({ unreadCount })),
}))
vi.mock('@/src/composables/usePublicSettings', async () => {
  const { ref } = await import('vue')
  return { publicSettings: ref({ supportEmail: 'help@example.com' }) }
})

interface PageState {
  draftName: string
  isEditing: boolean
  feedback: string
  saveProfile: () => Promise<void>
  exportingData: boolean
  exportData: () => Promise<void>
}

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/app/account')
  let state!: PageState
  const app = createSSRApp(Account)
  app.use(router)
  app.mixin({
    created() {
      const setup = (this.$ as unknown as { setupState: PageState }).setupState
      if (setup.saveProfile) state = setup
    },
  })
  const html = await renderToString(app)
  return {
    html,
    state,
    async render() {
      const snapshot = createSSRApp({ ...Account, setup: () => state })
      snapshot.use(router)
      return renderToString(snapshot)
    },
  }
}

function button(html: string, label: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(([value]) => value)
    .find((value) => value.replace(/<[^>]*>/g, '').includes(label))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.saveNickname.mockResolvedValue({ nickname: '新暱稱' })
  unreadCount.value = 0
  pushState.value = 'off'
  pushDeviceCount.value = 0
  pushError.value = ''
  publicSettings.value.supportEmail = 'help@example.com'
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('我的帳戶的真實功能與未開放狀態', () => {
  it('通知入口連往通知中心，未讀徽章使用共用通知資料並隨資料更新', async () => {
    unreadCount.value = 7
    const page = await mount()
    expect(useNotifications).toHaveBeenCalledExactlyOnceWith('tenant')
    expect(page.html).toMatch(/<a\b[^>]*href="\/app\/notifications"/)
    expect(page.html).toMatch(/class="notification-count"[^>]*>7<\/span>/)
    expect(page.html).toContain('aria-label="通知中心，7 則未讀"')
    unreadCount.value = 2
    expect(await page.render()).toMatch(/class="notification-count"[^>]*>2<\/span>/)
  })

  it('零則未讀時不顯示徽章，也不假稱沒有新通知', async () => {
    const { html } = await mount()
    expect(html).toContain('aria-label="通知中心"')
    expect(html).not.toContain('notification-count')
    expect(html).not.toContain('目前沒有新的通知')
  })

  it('客服中心使用公開設定的信箱，設定更新時連結也會更新', async () => {
    const page = await mount()
    expect(page.html).toContain('href="mailto:help@example.com"')
    publicSettings.value.supportEmail = 'new-support@example.com'
    expect(await page.render()).toContain('href="mailto:new-support@example.com"')
  })

  it('沒有客服信箱時明確停用客服入口，不建立空 mailto 連結', async () => {
    publicSettings.value.supportEmail = ''
    const { html } = await mount()
    expect(button(html, '客服中心')).toMatch(/\bdisabled(?:[\s=>])/)
    expect(button(html, '客服中心')).toContain('尚未開放')
    expect(html).not.toContain('mailto:')
  })

  it.each([
    '身分驗證',
    '兩步驟驗證',
    '登出其他裝置',
    '電子郵件通知',
    '常見問題',
    '意見回饋',
    '語言設定',
    '隱私權政策',
    '安全檢查',
    '手機號碼',
  ])('%s 尚未提供，入口不可操作且不顯示成功訊息', async (label) => {
    const { html, state } = await mount()
    const control = button(html, label)
    expect(control).toBeDefined()
    expect(control).toMatch(/\bdisabled(?:[\s=>])/)
    expect(control).toContain('尚未開放')
    expect(control).not.toMatch(/已完成|已登出|已開啟|已驗證/)
    expect(state.feedback).toBe('')
    expect(html).not.toContain('role="status"')
  })

  it('移除虛構登入裝置與安全分數，不顯示可切換的假防護開關', async () => {
    const { html } = await mount()
    expect(html).toContain('登入紀錄尚未開放')
    expect(html).not.toMatch(/Windows · Chrome|iPhone 15|目前裝置|2024\/11\/18|80%|中等/)
    expect(html).not.toMatch(/role="switch"[^>]*aria-label="(?:兩步驟驗證|安全檢查)/)
  })

  it('資料匯出可操作，下載中停用，完成後顯示成功', async () => {
    let resolve!: () => void
    mocks.downloadAccountData.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
    const page = await mount()
    expect(button(page.html, '資料匯出')).not.toMatch(/\bdisabled(?:[\s=>])/)
    expect(button(page.html, '資料匯出')).toContain('下載個人資料與上傳檔案（zip）')
    const downloading = page.state.exportData()
    expect(page.state.exportingData).toBe(true)
    expect(page.state.feedback).toBe('')
    expect(button(await page.render(), '匯出中…')).toMatch(/\bdisabled(?:[\s=>])/)
    await page.state.exportData()
    expect(mocks.downloadAccountData).toHaveBeenCalledOnce()
    resolve()
    await downloading
    expect(page.state.exportingData).toBe(false)
    expect(page.state.feedback).toBe('資料已下載。')
    expect(button(await page.render(), '資料匯出')).not.toMatch(/\bdisabled(?:[\s=>])/)
  })

  it('資料匯出失敗顯示錯誤並恢復按鈕', async () => {
    mocks.downloadAccountData.mockRejectedValueOnce(new Error('資料庫暫時無法連線。'))
    const page = await mount()
    await page.state.exportData()
    expect(page.state.feedback).toBe('資料庫暫時無法連線。')
    expect(page.state.exportingData).toBe(false)
    expect(button(await page.render(), '資料匯出')).not.toMatch(/\bdisabled(?:[\s=>])/)
  })

  it('伺服器未啟用時推播開關停用並說明原因', async () => {
    pushState.value = 'unsupported-server'
    const { html } = await mount()
    expect(button(html, '推播通知')).toMatch(/\bdisabled(?:[\s=>])/)
    expect(button(html, '推播通知')).toContain('伺服器尚未啟用推播')
  })

  it('推播已開啟時顯示帳號裝置數', async () => {
    pushState.value = 'on'
    pushDeviceCount.value = 3
    const { html } = await mount()
    expect(button(html, '推播通知')).toContain('已開啟；此帳號共 3 台裝置')
    expect(button(html, '推播通知')).toContain('aria-checked="true"')
  })

  it('推播切換錯誤顯示在該列', async () => {
    pushError.value = '訂閱保存失敗'
    const { html } = await mount()
    expect(button(html, '推播通知')).toContain('訂閱保存失敗')
  })

  it('語言顯示目前支援的繁體中文', async () => {
    const { html } = await mount()
    expect(button(html, '語言設定')).toContain('目前語言：繁體中文')
  })

  it('儲存暱稱等待後端完成，成功訊息只宣稱暱稱已更新', async () => {
    let resolve!: () => void
    mocks.saveNickname.mockImplementation(() => new Promise<void>((done) => { resolve = done }))
    const { state } = await mount()
    state.draftName = '  新暱稱  '
    state.isEditing = true
    const saving = state.saveProfile()
    expect(mocks.saveNickname).toHaveBeenCalledWith('新暱稱')
    expect(state.feedback).toBe('')
    resolve()
    await saving
    expect(state.feedback).toBe('暱稱已更新')
    expect(state.isEditing).toBe(false)
  })

  it('暱稱儲存失敗時不顯示成功，保留編輯狀態', async () => {
    mocks.saveNickname.mockRejectedValueOnce(new Error('儲存失敗'))
    const { state } = await mount()
    state.draftName = '新暱稱'
    state.isEditing = true
    await state.saveProfile()
    expect(state.feedback).toBe('儲存失敗')
    expect(state.isEditing).toBe(true)
  })
})

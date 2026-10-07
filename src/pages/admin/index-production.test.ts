import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ChartData } from 'chart.js'
import type { AdminAccount } from '@/src/services/adminUsersApi'

const api = vi.hoisted(() => ({ fetchAdminAccounts: vi.fn(), fetchAdminDeposits: vi.fn() }))
const charts = vi.hoisted(() => ({ lines: [] as ChartData<'line'>[], donuts: [] as ChartData<'doughnut'>[] }))
vi.mock('@/src/services/adminUsersApi', () => ({ ...api, updateAccountStatus: vi.fn() }))
vi.mock('@/src/services/adminUserRecordsApi', () => api)
vi.mock('@/src/services/adminRepairApi', () => ({ fetchAdminRepairs: vi.fn().mockResolvedValue({ items: [] }) }))
vi.mock('@/src/services/adminAuditApi', () => ({ fetchAdminAudit: vi.fn().mockResolvedValue([]) }))
vi.mock('@/src/services/adminMetricsApi', () => ({ fetchMonitorEvents: vi.fn().mockResolvedValue([]) }))
vi.mock('@/src/composables/useAuth', () => ({ getAuthSession: () => ({ role: 'admin', userId: '1' }) }))
vi.mock('@/src/composables/useNow', () => ({ useNow: () => ref(new Date()) }))
vi.mock('@/src/composables/useTickingNow', () => ({ useTickingNow: () => ref(new Date()) }))
vi.mock('@/src/composables/admin/useSystemHealth', () => ({
  useSystemHealth: () => ({ dbPool: ref(null), requests: ref(null), services: ref([]), serverNow: () => new Date() }),
}))
vi.mock('vue-chartjs', () => {
  const Line = defineComponent({
    props: ['data'],
    setup(props) {
      charts.lines.push(props.data)
      return () => h('div', { 'data-chart': 'line' })
    },
  })
  const Doughnut = defineComponent({
    props: ['data'],
    setup(props) {
      charts.donuts.push(props.data)
      return () => h('div', { 'data-chart': 'doughnut' })
    },
  })
  return { Line, Doughnut, Bar: defineComponent(() => () => h('div')) }
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('DEV', false)
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 6, 12))
  charts.lines = []
  charts.donuts = []
  api.fetchAdminAccounts.mockResolvedValue(['user', 'landlord', 'admin'].map((role, index): AdminAccount => ({
    id: index + 1, email: `real-${index}@example.com`, displayName: `真實帳號${index}`, avatarUrl: null,
    roles: [role], status: index === 1 ? 'suspended' : 'active', emailVerified: true,
    hasPassword: true, providers: [],
    createdAt: index === 2 ? null : new Date(2026, 8 + index, 1, 12).toISOString(),
    lastLoginAt: index === 1 ? null : new Date().toISOString(),
  })))
  api.fetchAdminDeposits.mockResolvedValue({ deposits: [
    { id: 'lease-1', address: '真實押金地址', monthlyRent: 10000, landlordDeclared: 20000, tenantDeclared: 15000, landlordId: 2, tenantId: 1 },
  ] })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function render(load = true) {
  const { useAdminDirectory } = await import('@/src/composables/admin/useAdminDirectory')
  const directory = useAdminDirectory()
  if (load) await Promise.all([directory.reloadRealAccounts(), directory.reloadDeposits(), directory.reloadTickets()])
  const { default: Overview } = await import('./index.vue')
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/admin', component: Overview }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] })
  await router.push('/admin')
  const app = createSSRApp(Overview)
  app.use(router)
  return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, '')
}

function userKpi(html: string): string {
  return [...html.matchAll(/<a\b[\s\S]*?<\/a>/g)].map((match) => match[0]).find((link) => link.includes('使用者總數'))!
}

describe('正式站總覽使用真實來源', () => {
  it('使用者總數、角色、活躍、停用與成長來自 API，null 日期不進月份', async () => {
    const html = await render()
    expect(userKpi(html)).toMatch(/>3<\/span>/)
    expect(userKpi(html)).toContain('data-real="true"')
    expect(html).toContain('近 7 天活躍 2 位 · 停用中 1 筆')
    expect(html).toContain('本月 +1')
    expect(charts.lines[0]!.datasets[0]!.data.slice(-2)).toEqual([1, 2])
    const roles = charts.donuts.find((chart) => chart.labels?.includes('管理員'))!
    expect(roles.datasets[0]!.data).toEqual([1, 1, 1])
    expect(html).not.toContain('amy.wang@example.com')
    expect(html).not.toContain('chen.landlord@example.com')
  })

  it('押金 KPI 與對帳結果圖僅有 API 的一筆不符資料', async () => {
    const html = await render()
    const links = [...html.matchAll(/<a\b[\s\S]*?<\/a>/g)].map((match) => match[0])
    const kpi = links.find((link) => link.includes('押金不符'))!
    expect(kpi).toMatch(/>1<\/span>/)
    expect(kpi).toContain('data-real="true"')
    expect(html).toContain('房東聲明總額 NT$20,000')
    const depositChart = charts.donuts.find((chart) => chart.labels?.includes('金額不符'))!
    expect(depositChart.datasets[0]!.data).toEqual([0, 1, 0])
    expect(links.find((link) => link.includes('押金對帳結果'))).toContain('data-real="true"')
  })

  it('帳號 API 失敗時不顯示零人、活躍或空成長圖', async () => {
    api.fetchAdminAccounts.mockResolvedValue(null)
    const html = await render()
    expect(userKpi(html)).toMatch(/<span class="text-2xl[^"]*">—<\/span>/)
    expect(userKpi(html)).toMatch(/<span class="text-xs[^"]*">讀不到<\/span>/)
    expect(userKpi(html)).not.toMatch(/>0<\/span>/)
    expect(html).toContain('讀不到伺服器上的帳號資料')
    expect(html).not.toContain('近 7 天活躍')
    expect(html).not.toContain('位使用者')
    expect(html).not.toContain('近 12 個月累計人數')
    expect(charts.lines).toHaveLength(1)
  })

  it('押金讀不到時數字位置顯示佔位符，原因用小字說明', async () => {
    api.fetchAdminDeposits.mockResolvedValue(null)
    const html = await render()
    const kpi = [...html.matchAll(/<a\b[\s\S]*?<\/a>/g)]
      .map((match) => match[0]).find((link) => link.includes('押金不符'))!
    expect(kpi).toMatch(/<span class="text-2xl[^"]*">—<\/span>/)
    expect(kpi).toMatch(/<span class="text-xs[^"]*">讀不到<\/span>/)
    expect(kpi).not.toMatch(/>0<\/span>/)
  })

  it('帳號與押金讀取中時數字位置用省略號，狀態用小字說明', async () => {
    api.fetchAdminAccounts.mockReturnValue(new Promise(() => {}))
    api.fetchAdminDeposits.mockReturnValue(new Promise(() => {}))
    const html = await render(false)
    const kpis = [...html.matchAll(/<a\b[\s\S]*?<\/a>/g)]
      .map((match) => match[0]).filter((link) => link.includes('使用者總數') || link.includes('押金不符'))
    expect(kpis).toHaveLength(2)
    for (const kpi of kpis) {
      expect(kpi).toMatch(/<span class="text-2xl[^"]*">…<\/span>/)
      expect(kpi).toMatch(/<span class="text-xs[^"]*">讀取中<\/span>/)
    }
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { DepositStats } from '@/src/composables/admin/useAdminDeposits'
import Overview from './index.vue'
import { chartColor } from '@/src/constants/admin-chart'
import type { AuditRow } from '@/src/utils/admin-audit-sources'

const state = vi.hoisted(() => ({
  stats: null as DepositStats | null,
  loadState: 'error' as 'error' | 'ready',
  auditRows: [] as AuditRow[],
}))
vi.mock('@/src/composables/admin/useAdminDeposits', () => ({
  useAdminDeposits: () => ({
    records: ref([
      { landlordDeclared: 20000, tenantDeclared: 20000 },
      { landlordDeclared: 20000, tenantDeclared: 15000 },
      { landlordDeclared: 20000, tenantDeclared: null },
    ]),
    stats: ref(state.stats), loadState: ref(state.loadState), reload: vi.fn(),
  }),
}))
vi.mock('@/src/composables/admin/useAdminDirectory', () => ({
  useAdminDirectory: () => ({ rows: ref([]), realAccounts: ref([]), realAccountsLoading: ref(false), realAccountsError: ref('') }),
}))
vi.mock('@/src/composables/admin/useAuditLog', () => ({
  useAuditLog: () => ({ rows: ref(state.auditRows), loading: ref(false), serverFailed: ref(false), reload: vi.fn() }),
}))

vi.mock('@/src/composables/useTickingNow', () => ({ useTickingNow: () => ref(new Date()) }))
vi.mock('@/src/composables/admin/useSystemHealth', () => ({
  useSystemHealth: () => ({ dbPool: ref(null), requests: ref(null), services: ref([]), serverNow: () => new Date() }),
}))

beforeEach(() => {
  state.stats = null
  state.loadState = 'error'
  state.auditRows = []
})

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: Overview }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/admin')
  const app = createSSRApp(Overview)
  app.use(router)
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

describe('總覽混合押金統計', () => {
  it('真實資料讀不到時 KPI 與圖表都明示，沒有展示資料的總額或空圖', async () => {
    const html = await render()
    const kpi = [...html.matchAll(/<a\b[\s\S]*?<\/a>/g)]
      .map((match) => match[0]).find((link) => link.includes('押金不符'))!
    expect(kpi).toMatch(/<span class="text-2xl[^"]*">—<\/span>/)
    expect(kpi).toMatch(/<span class="text-xs[^"]*">讀不到<\/span>/)
    expect(html).toContain('押金對帳結果')
    expect(html).toContain('讀不到伺服器上的真實押金資料')
    expect(html).not.toContain('房東聲明總額')
    expect(html).not.toContain('筆記錄')
  })

  it('成功時呈現合併筆數、聲明總額與警示色，依正式站來源標記押金區塊', async () => {
    state.loadState = 'ready'
    state.stats = { declaredTotal: 60000, mismatchedCount: 1, pendingCount: 1 }
    const html = await render()
    expect(html).toContain('房東聲明總額 NT$60,000')
    expect(html).toContain('筆記錄')
    expect(html).toContain('金額不符')
    expect(html).not.toContain('讀不到真實資料')
    const depositLinks = [...html.matchAll(/<a\b[\s\S]*?<\/a>/g)]
      .map((match) => match[0])
      .filter((link) => link.includes('href="/admin/users?alert=deposit-mismatch"'))
    expect(depositLinks).toHaveLength(2)
    expect(depositLinks.every((link) => link.includes('data-real="true"'))).toBe(true)
    const depositCard = depositLinks.find((link) => link.includes('押金對帳結果'))!
    expect(depositCard).toContain('data-real="true"')
    expect(depositCard).toContain(chartColor('danger'))
  })

  it('最新稽核取共用合併來源的前五筆', async () => {
    state.auditRows = Array.from({ length: 6 }, (_, index) => ({
      id: `srv-${index}`, at: new Date().toISOString(), actor: '管理員', action: '使用者管理',
      target: '真實帳號', detail: `合併稽核第 ${index + 1} 筆`, source: 'server',
    }))
    const html = await render()
    for (let index = 1; index <= 5; index += 1) expect(html).toContain(`合併稽核第 ${index} 筆`)
    expect(html).not.toContain('合併稽核第 6 筆')
  })
})

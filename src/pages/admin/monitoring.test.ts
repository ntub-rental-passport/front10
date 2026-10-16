import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AiUsageDaily } from '@/src/mocks/admin/ai-usage'

const api = vi.hoisted(() => ({ fetchAiUsage: vi.fn() }))
vi.mock('@/src/services/aiUsageApi', () => api)
vi.mock('@/src/composables/admin/useSystemHealth', () => ({
  useSystemHealth: () => ({
    checking: ref(false), check: vi.fn(), liveMonitors: () => [], pendingMonitors: () => [],
    responseMs: ref(20), metricsLoaded: ref(true), metricsAvailable: ref(false),
    queues: ref(null), config: ref(null), summary: ref(null), events: ref([]),
    serverNow: () => Date.now(),
  }),
}))
vi.mock('@/src/composables/admin/useAdminFeatureOutages', () => ({
  useAdminFeatureOutages: () => ({ outages: ref([]) }),
}))
vi.mock('@/src/composables/useTickingNow', () => ({ useTickingNow: () => ref(Date.now()) }))
vi.mock('@/src/components/admin/FeatureOutageCard.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/src/components/admin/UsageTrendChart.vue', () => ({
  default: { props: ['series'], template: '<div data-chart>{{ JSON.stringify(series) }}</div>' },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 16))
})
afterEach(() => vi.useRealTimers())

async function render(daily: AiUsageDaily[]) {
  api.fetchAiUsage.mockResolvedValue({ providers: [], daily })
  const { loadAiUsage } = await import('@/src/composables/admin/useAdminAiUsage')
  await loadAiUsage()
  const { default: Monitoring } = await import('./monitoring.vue')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/monitoring', component: Monitoring }] })
  await router.push('/admin/monitoring')
  const app = createSSRApp(Monitoring)
  app.use(router)
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

describe('監控頁 AI 用量', () => {
  it('AI 區塊在事件前，NVIDIA 顯示失敗率、token 與功能，明細按供應商合併', async () => {
    const base = { date: '2026-10-16', provider: 'nvidia' as const, units: 1, calls: 1,
      failed: 0, prompt_tokens: 0, completion_tokens: 0 }
    const html = await render([
      { ...base, feature: 'contract-analysis', units: 2, calls: 2, failed: 1, prompt_tokens: 100, completion_tokens: 20 },
      { ...base, feature: 'law-chat', prompt_tokens: 30, completion_tokens: 10 },
      { ...base, provider: 'vision', feature: '', units: 5 },
    ])
    expect(html.indexOf('aria-labelledby="monitor-ai-usage"')).toBeLessThan(html.indexOf('aria-labelledby="monitor-events"'))
    expect(html).toContain('33%')
    expect(html).toContain('本月 token')
    expect(html).toContain('160')
    expect(html).toContain('合約分析')
    expect(html).toContain('Law Chat')
    expect(html).toContain('點交比對')
    expect(html).toMatch(/點交比對<\/dt>\s*<dd[^>]*>0 次<\/dd>/)
    const rows = html.match(/<tbody[^>]*>(.*?)<\/tbody>/s)![1]!
    expect(rows.match(/<tr\b/g)).toHaveLength(2)
    expect(rows).toContain('3 次')
    expect(rows).toContain('5 頁')
    expect(rows).toContain('160')
    expect(rows).toContain('—')
    const chart = html.match(/<div data-chart[^>]*>(.*?)<\/div>/s)![1]!
    expect(chart).toContain('Google Vision（% 月額度）')
    expect(chart).toContain('NVIDIA（% 月額度）')
    expect(html.match(/失敗次數/g)).toHaveLength(1)
  })

  it('沒有呼叫時失敗率顯示破折號，三個功能仍顯示零', async () => {
    const html = await render([])
    expect(html).toContain('（—）')
    expect(html.match(/<dd[^>]*>0 次<\/dd>/g)).toHaveLength(3)
  })
})

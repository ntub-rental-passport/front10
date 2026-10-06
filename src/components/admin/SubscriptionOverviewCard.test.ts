import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import SubscriptionOverviewCard from './SubscriptionOverviewCard.vue'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import { seedSubscriptions } from '@/src/mocks/admin/subscription'
import { joinUserDirectory } from '@/src/utils/admin-user-directory'
import type { PlanRole } from '@/src/utils/subscription-plans'

const chartState = vi.hoisted(() => ({
  doughnut: null as ChartData<'doughnut'> | null,
  bar: null as ChartData<'bar'> | null,
  options: null as ChartOptions<'bar'> | null,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-chartjs', () => {
  const stub = (type: 'doughnut' | 'bar') =>
    defineComponent({
      props: ['data', 'options', 'plugins'],
      setup(props) {
        if (type === 'bar') {
          chartState.bar = props.data
          chartState.options = props.options
        } else {
          chartState.doughnut = props.data
        }
        return () => h('div', { 'data-chart': type }, JSON.stringify(props.data))
      },
    })
  return { Doughnut: stub('doughnut'), Bar: stub('bar') }
})

const now = new Date(2026, 9, 20, 12)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function render(role?: PlanRole, freeOnly = false, trial = false) {
  chartState.doughnut = null
  chartState.bar = null
  chartState.options = null
  const users = ['landlord', 'user', 'user'].map((userRole, index) => ({
    ...seedAdminUsers().find((user) => user.role === userRole)!,
    id: `test-${index}`,
    status: 'active' as const,
  }))
  const subscriptions = seedSubscriptions(users).map((sub) => ({
    ...sub,
    planKey: freeOnly ? ('free' as const) : ('plus' as const),
    billingCycle: freeOnly ? null : ('monthly' as const),
    startedAt: new Date(2026, 8, 10, 12).toISOString(),
    expiresAt: new Date(2026, 10, 10, 12).toISOString(),
    trialEndsAt: trial && sub.role === 'landlord' ? new Date(2026, 10, 5).toISOString() : null,
  }))
  const rows = joinUserDirectory({ users, subscriptions, tickets: [], deposits: [] }, 14, now)
  const app = createSSRApp(SubscriptionOverviewCard, { role, rows, subscriptions })
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

describe('SubscriptionOverviewCard', () => {
  it('正式站沒有訂閱資料時說明尚未串接金流', async () => {
    vi.stubEnv('DEV', false)
    const html = await renderToString(createSSRApp(SubscriptionOverviewCard, { rows: [], subscriptions: [] }))
    expect(html).toContain('尚未串接金流，目前沒有收款紀錄')
    expect(html).not.toContain('data-chart="bar"')
  })

  it('外部控制角色時兩張圖都用對應資料，租客多檢查包系列，預設仍為房東', async () => {
    const landlord = await render()
    expect(landlord).toContain('全部 1 位房東')
    expect(landlord).toContain('本月收款 NT$199')
    expect(landlord).toMatch(/aria-pressed="true"[^>]*>房東/)
    expect(chartState.doughnut!.datasets[0].data).toEqual([1])
    expect(chartState.bar!.datasets.map((dataset) => dataset.label)).toEqual(['Plus', 'Pro'])
    expect(landlord).not.toContain('檢查包')

    const tenant = await render('tenant')
    expect(tenant).toContain('全部 2 位租客')
    expect(tenant).toContain('本月收款 NT$98')
    expect(tenant).toMatch(/aria-pressed="true"[^>]*>租客/)
    expect(chartState.doughnut!.datasets[0].data).toEqual([2])
    expect(chartState.bar!.datasets.map((dataset) => dataset.label)).toEqual([
      'Plus',
      'Pro',
      '檢查包',
    ])
    expect(chartState.bar!.datasets[0].data.at(-1)).toBe(98)
    expect(tenant).toContain('檢查包')

    const switchedBack = await render('landlord')
    expect(switchedBack).toContain('全部 1 位房東')
    expect(switchedBack).toContain('本月收款 NT$199')
  })
  it('試用人數為 0 不顯示註記，有試用才顯示且角色同步', async () => {
    expect(await render('landlord', false, true)).toContain('其中 1 位試用中')
    expect(await render('tenant', false, true)).not.toContain('位試用中')
    expect(await render('landlord')).not.toContain('位試用中')
  })
  it.each(['landlord', 'tenant'] as const)(
    '%s 全 Free 顯示無收款空狀態，不畫全 0 長條',
    async (role) => {
      const html = await render(role, true)
      expect(html).toContain('目前沒有收款紀錄')
      expect(html).toContain('本月收款 NT$0')
      expect(html).not.toContain('位試用中')
      expect(html).not.toContain('data-chart="bar"')
      expect(chartState.bar).toBeNull()
    },
  )
  it('長條堆疊，tooltip 各系列與合計用 NT$ 千分位', async () => {
    await render()
    const options = chartState.options!
    expect(options.scales?.x?.stacked).toBe(true)
    expect(options.scales?.y?.stacked).toBe(true)
    const callbacks = options.plugins!.tooltip!.callbacks!
    const item = { dataset: { label: 'Pro' }, parsed: { y: 3990 } } as TooltipItem<'bar'>
    expect(callbacks.label!.call({} as never, item)).toBe('Pro：NT$3,990')
    expect(callbacks.footer!.call({} as never, [item, { ...item, parsed: { x: 0, y: 199 } }])).toBe(
      '合計：NT$4,189',
    )
  })
})

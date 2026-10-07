import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, getCurrentInstance, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import SubscriptionOverviewCard from './SubscriptionOverviewCard.vue'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import { seedSubscriptions } from '@/src/mocks/admin/subscription'
import { joinUserDirectory } from '@/src/utils/admin-user-directory'
import { chartColor } from '@/src/constants/admin-chart'
import type { PlanRole } from '@/src/utils/subscription-plans'

interface ChartHandlers {
  chartRef: { chart?: { getElementsAtEventForMode: () => { index: number }[] } } | null
  handleChartClick: (event: MouseEvent) => void
  handleChartMove: (event: MouseEvent) => void
}

const chartState = vi.hoisted(() => ({
  doughnut: null as ChartData<'doughnut'> | null,
  bar: null as ChartData<'bar'> | null,
  options: null as ChartOptions<'bar'> | null,
  hitTest: vi.fn<() => { index: number }[]>(),
  push: vi.fn(),
  handlers: null as ChartHandlers | null,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: chartState.push }) }))
vi.mock('vue-chartjs', () => {
  const stub = (type: 'doughnut' | 'bar') =>
    defineComponent({
      props: ['data', 'options', 'plugins'],
      setup(props, { expose }) {
        if (type === 'bar') {
          chartState.bar = props.data
          chartState.options = props.options
          expose({ chart: { getElementsAtEventForMode: chartState.hitTest } })
          let owner = getCurrentInstance()?.parent
          while (
            owner &&
            (owner.type as { __name?: string }).__name !== 'SubscriptionOverviewCard'
          ) {
            owner = owner.parent
          }
          chartState.handlers = (owner as unknown as { setupState: ChartHandlers }).setupState
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
  chartState.doughnut = null
  chartState.bar = null
  chartState.options = null
  chartState.handlers = null
  chartState.hitTest.mockReset().mockReturnValue([])
  chartState.push.mockReset()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

function directoryRows(freeOnly = false, trial = false) {
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
  return joinUserDirectory({ users, subscriptions, tickets: [], deposits: [] }, 14, now)
}

async function render(role?: PlanRole, freeOnly = false, trial = false) {
  const app = createSSRApp(SubscriptionOverviewCard, { role, rows: directoryRows(freeOnly, trial) })
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

describe('SubscriptionOverviewCard', () => {
  it('各角色顯示全部方案的直條人數，預設為房東，不畫甜甜圈', async () => {
    const landlord = await render()
    expect(landlord).toContain('各方案訂閱人數')
    expect(landlord).toContain('全部 1 位房東，點方案可篩選')
    expect(landlord).toMatch(/aria-pressed="true"[^>]*>房東/)
    expect(chartState.bar!.labels).toEqual(['Free 基礎管理', 'Plus 進階管理', 'Pro 團隊管理'])
    expect(chartState.bar!.datasets).toHaveLength(1)
    expect(chartState.bar!.datasets[0].data).toEqual([0, 1, 0])
    expect(landlord).toContain('data-chart="bar"')
    expect(landlord).not.toContain('data-chart="doughnut"')
    expect(chartState.doughnut).toBeNull()
    expect(landlord).not.toContain('訂閱收款')

    const tenant = await render('tenant')
    expect(tenant).toContain('全部 2 位租客，點方案可篩選')
    expect(tenant).toMatch(/aria-pressed="true"[^>]*>租客/)
    expect(chartState.bar!.labels).toEqual(['Free 租屋入門', 'Plus 安心租住', 'Pro 合租進階'])
    expect(chartState.bar!.datasets).toHaveLength(1)
    expect(chartState.bar!.datasets[0].data).toEqual([0, 2, 0])
    expect(tenant).not.toContain('data-chart="doughnut"')
    expect(chartState.doughnut).toBeNull()

    expect(await render('landlord')).toContain('全部 1 位房東')
    expect(chartState.bar!.datasets[0].data).toEqual([0, 1, 0])
  })

  it('試用人數為 0 不顯示註記，有試用才顯示且角色同步', async () => {
    expect(await render('landlord', false, true)).toContain('其中 1 位試用中')
    expect(await render('tenant', false, true)).not.toContain('位試用中')
    expect(await render('landlord')).not.toContain('位試用中')
  })

  it.each(['landlord', 'tenant'] as const)('%s 全 Free 仍顯示方案人數', async (role) => {
    const html = await render(role, true)
    expect(html).toContain('data-chart="bar"')
    expect(html).not.toContain('位試用中')
    expect(chartState.bar!.datasets[0].data).toEqual([role === 'landlord' ? 1 : 2, 0, 0])
  })

  it.each(['landlord', 'tenant'] as const)('%s 無使用者時仍畫零人數直條圖', async (role) => {
    const html = await renderToString(createSSRApp(SubscriptionOverviewCard, { role, rows: [] }))
    expect(html).toContain(`全部 0 位${role === 'landlord' ? '房東' : '租客'}`)
    expect(html).toContain('data-chart="bar"')
    expect(chartState.bar!.labels).toHaveLength(3)
    expect(chartState.bar!.datasets[0].data).toEqual([0, 0, 0])
  })

  it('直條沿用方案顏色、整數人數軸並隱藏圖例', async () => {
    await render()
    const dataset = chartState.bar!.datasets[0]
    expect(dataset.backgroundColor).toEqual([
      chartColor('series-3'),
      chartColor('series-2'),
      chartColor('series-1'),
    ])
    expect(dataset.borderRadius).toBe(4)
    expect(dataset.maxBarThickness).toBe(48)
    expect(chartState.options!.indexAxis ?? 'x').toBe('x')
    expect(chartState.options!.scales?.y).toMatchObject({
      beginAtZero: true,
      ticks: { precision: 0 },
    })
    expect(chartState.options!.plugins?.legend?.display).toBe(false)
  })

  it('tooltip 顯示方案、人數，有試用才附註試用人數', async () => {
    await render()
    const item = { label: 'Plus 進階管理', dataIndex: 1, parsed: { y: 1 } } as TooltipItem<'bar'>
    const label = () => chartState.options!.plugins!.tooltip!.callbacks!.label!
    expect(label().call({} as never, item)).toBe('Plus 進階管理：1 位')

    await render('landlord', false, true)
    expect(label().call({} as never, item)).toBe('Plus 進階管理：1 位（試用 1 位）')

    await render('tenant', false, true)
    expect(
      label().call({} as never, { ...item, label: 'Plus 安心租住', parsed: { x: 1, y: 2 } }),
    ).toBe('Plus 安心租住：2 位')
  })

  it.each(['landlord', 'tenant'] as const)(
    '%s 點直條導向方案篩選，命中時顯示手形游標',
    async (role) => {
      await render(role)
      const handlers = chartState.handlers!
      // SSR 不會設定 template ref，補上 Bar stub 公開的 chart 實例來驗證事件處理。
      handlers.chartRef = { chart: { getElementsAtEventForMode: chartState.hitTest } }
      const wrapper = { style: { cursor: 'default' } }
      const event = { currentTarget: wrapper } as unknown as MouseEvent
      handlers.handleChartClick(event)
      expect(chartState.push).not.toHaveBeenCalled()
      for (const [index, planKey] of ['free', 'plus', 'pro'].entries()) {
        chartState.hitTest.mockReturnValue([{ index }])
        handlers.handleChartClick(event)
        expect(chartState.push).toHaveBeenLastCalledWith({
          path: '/admin/users',
          query: { role: role === 'landlord' ? 'landlord' : 'user', plan: `${role}-${planKey}` },
        })
      }
      expect(chartState.hitTest).toHaveBeenCalledWith(event, 'nearest', { intersect: true }, false)
      handlers.handleChartMove(event)
      expect(wrapper.style.cursor).toBe('pointer')
      chartState.hitTest.mockReturnValue([])
      handlers.handleChartMove(event)
      expect(wrapper.style.cursor).toBe('default')
      handlers.handleChartClick(event)
      expect(chartState.push).toHaveBeenCalledTimes(3)
      handlers.chartRef = null
      handlers.handleChartClick(event)
      expect(chartState.push).toHaveBeenCalledTimes(3)
    },
  )
})

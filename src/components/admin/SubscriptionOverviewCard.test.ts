import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, getCurrentInstance, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { Chart, ChartData, ChartOptions, Plugin, TooltipItem } from 'chart.js'
import SubscriptionOverviewCard from './SubscriptionOverviewCard.vue'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import {
  seedSubscriptions,
  type Subscription,
  type TenantSubscription,
} from '@/src/mocks/admin/subscription'
import { joinUserDirectory } from '@/src/utils/admin-user-directory'
import { chartColor } from '@/src/constants/admin-chart'
import type { PlanRole } from '@/src/utils/subscription-plans'

interface ChartHandlers {
  chartRef: { chart?: { getElementsAtEventForMode: () => { index: number }[] } } | null
  handleChartClick: (event: MouseEvent) => void
  handleChartMove: (event: MouseEvent) => void
}

interface BarProps {
  data: ChartData<'bar'>
  options: ChartOptions<'bar'>
  plugins: Plugin<'bar'>[]
}

const chartState = vi.hoisted(() => ({
  doughnut: null as ChartData<'doughnut'> | null,
  bar: null as ChartData<'bar'> | null,
  options: null as ChartOptions<'bar'> | null,
  bars: [] as BarProps[],
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
          if (chartState.bars.length === 0) {
            chartState.bar = props.data
            chartState.options = props.options
          }
          chartState.bars.push({ data: props.data, options: props.options, plugins: props.plugins })
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
  chartState.bars = []
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

async function render(
  role?: PlanRole,
  freeOnly = false,
  trial = false,
  subscriptions: Subscription[] = [],
) {
  chartState.bars = []
  const app = createSSRApp(SubscriptionOverviewCard, {
    role,
    rows: directoryRows(freeOnly, trial),
    subscriptions,
  })
  return (await renderToString(app)).replace(/<!--.*?-->/g, '')
}

function purchaseSubscriptions(): Subscription[] {
  const tenant = seedSubscriptions().find(
    (sub): sub is TenantSubscription => sub.role === 'tenant',
  )!
  const pack = (quantity: number, createdAt: Date, source: 'purchase' | 'admin' = 'purchase') => ({
    id: 'pack',
    quantity,
    source,
    createdAt: createdAt.toISOString(),
    usedAt: [],
  })
  return [
    {
      ...tenant,
      checkPacks: [
        pack(2, now),
        pack(3, now),
        pack(4, new Date(2026, 8, 10)),
        pack(30, now, 'admin'),
        pack(40, new Date(now.getTime() + 1)),
      ],
    },
  ]
}

describe('SubscriptionOverviewCard', () => {
  it('各角色顯示全部方案的直條人數，預設為房東，不畫甜甜圈', async () => {
    const landlord = await render()
    expect(landlord).toContain('各方案訂閱人數')
    expect(landlord).not.toContain('全部')
    expect(landlord).not.toContain('點方案可篩選')
    expect(landlord).not.toContain('單次加購')
    expect(landlord).not.toContain('md:grid-cols-2')
    expect(chartState.bars).toHaveLength(1)
    expect(landlord).toMatch(/aria-pressed="true"[^>]*>房東/)
    expect(chartState.bar!.labels).toEqual(['Free 基礎管理', 'Plus 進階管理', 'Pro 團隊管理'])
    expect(chartState.bar!.datasets).toHaveLength(1)
    expect(chartState.bar!.datasets[0].data).toEqual([0, 1, 0])
    expect(landlord).toContain('data-chart="bar"')
    expect(landlord).not.toContain('data-chart="doughnut"')
    expect(chartState.doughnut).toBeNull()
    expect(landlord).not.toContain('訂閱收款')

    const tenant = await render('tenant')
    expect(tenant).not.toContain('全部')
    expect(tenant).not.toContain('點方案可篩選')
    expect(tenant).toContain('單次加購')
    expect(tenant).toContain('md:grid-cols-2')
    expect(tenant).toMatch(/aria-pressed="true"[^>]*>租客/)
    expect(chartState.bar!.labels).toEqual(['Free 租屋入門', 'Plus 安心租住', 'Pro 合租進階'])
    expect(chartState.bar!.datasets).toHaveLength(1)
    expect(chartState.bar!.datasets[0].data).toEqual([0, 2, 0])
    expect(tenant).not.toContain('data-chart="doughnut"')
    expect(chartState.doughnut).toBeNull()

    expect(await render('landlord')).not.toContain('單次加購')
    expect(chartState.bar!.datasets[0].data).toEqual([0, 1, 0])
  })

  it('兩角色都移除試用與總人數輔助文字，即使有試用也不顯示', async () => {
    expect(await render('landlord', false, true)).not.toContain('位試用中')
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
    const html = await renderToString(
      createSSRApp(SubscriptionOverviewCard, { role, rows: [], subscriptions: [] }),
    )
    expect(html).not.toContain('全部')
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
    expect(chartState.options!.layout?.padding).toMatchObject({ top: 24 })
    expect(chartState.options!.scales?.y?.suggestedMax).toBeGreaterThan(1)
  })

  it('租客加購圖顯示近 12 個月購買包數與包數 tooltip，房東不顯示', async () => {
    const subscriptions = purchaseSubscriptions()
    const html = await render('tenant', false, false, subscriptions)
    expect(html).toContain('單次加購')
    expect(html).toContain('近 12 個月每月購買的契約檢查包數量（不含管理員贈送）')
    expect(html).not.toContain('目前沒有加購紀錄')
    expect(chartState.bars).toHaveLength(2)
    const purchases = chartState.bars[1]
    expect(purchases.data.labels).toEqual([
      '2025年11月',
      '12月',
      '2026年1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
    ])
    expect(purchases.data.datasets[0].data).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 5])
    expect(purchases.data.datasets[0].backgroundColor).toBe(chartColor('attention'))
    expect(purchases.options.indexAxis ?? 'x').toBe('x')
    expect(purchases.options.scales?.y).toMatchObject({
      beginAtZero: true,
      ticks: { precision: 0 },
    })
    expect(purchases.options.plugins?.legend?.display).toBe(false)
    expect(purchases.options.layout?.padding).toMatchObject({ top: 24 })
    expect(purchases.options.scales?.y?.suggestedMax).toBeGreaterThan(5)
    expect(purchases.options.onClick).toBeUndefined()
    expect(
      purchases.options.plugins!.tooltip!.callbacks!.label!.call(
        {} as never,
        {
          label: '10月',
          parsed: { y: 5 },
        } as TooltipItem<'bar'>,
      ),
    ).toBe('10月：5 包')
    expect(await render('landlord', false, false, subscriptions)).not.toContain('單次加購')
    expect(chartState.bars).toHaveLength(1)
  })

  it('沒有購買或只有管理員贈送時，加購區顯示 h-60 空狀態', async () => {
    const subscriptions = purchaseSubscriptions().map((sub) =>
      sub.role === 'tenant'
        ? { ...sub, checkPacks: sub.checkPacks.filter((pack) => pack.source === 'admin') }
        : sub,
    )
    for (const collection of [[], subscriptions]) {
      const html = await render('tenant', false, false, collection)
      expect(html).toMatch(
        /class="[^"]*h-60[^"]*items-center[^"]*justify-center[^"]*"[^>]*>\s*目前沒有加購紀錄/,
      )
      expect(chartState.bars).toHaveLength(1)
    }
  })

  it('Bar 收到共用數值標籤 plugin，方案包含零值，加購只畫非零值', async () => {
    await render('tenant', false, false, purchaseSubscriptions())
    for (const [index, { data, plugins }] of chartState.bars.entries()) {
      expect(plugins).toHaveLength(1)
      expect(plugins[0].id).toBe('barValueLabels')
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillText: vi.fn(),
        font: '',
        fillStyle: '',
        textAlign: '',
        textBaseline: '',
      }
      const chart = {
        ctx,
        data,
        getDatasetMeta: () => ({
          data: data.datasets[0].data.map((_, i) => ({ x: i * 20, y: 100 })),
        }),
      } as unknown as Chart<'bar'>
      plugins[0].afterDatasetsDraw!(chart, {}, {}, false)
      expect(ctx.save).toHaveBeenCalledOnce()
      expect(ctx.restore).toHaveBeenCalledOnce()
      expect(ctx.font).toBe('500 12px "Geist Variable", sans-serif')
      expect(ctx.fillStyle).toBe(chartColor('label'))
      expect(ctx.textAlign).toBe('center')
      expect(ctx.textBaseline).toBe('bottom')
      expect(ctx.fillText.mock.calls).toEqual(
        index === 0
          ? [
              ['0', 0, 94],
              ['2', 20, 94],
              ['0', 40, 94],
            ]
          : [
              ['4', 200, 94],
              ['5', 220, 94],
            ],
      )
    }
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
      await render(role, false, false, purchaseSubscriptions())
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

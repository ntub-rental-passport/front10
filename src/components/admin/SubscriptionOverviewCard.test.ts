import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, getCurrentInstance, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  Chart as ChartJS,
  type Chart,
  type ChartData,
  type ChartOptions,
  type Plugin,
  type TooltipItem,
} from 'chart.js'
import SubscriptionOverviewCard from './SubscriptionOverviewCard.vue'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import {
  seedSubscriptions,
  type Subscription,
  type TenantSubscription,
} from '@/src/mocks/admin/subscription'
import { joinUserDirectory, planDistribution } from '@/src/utils/admin-user-directory'
import { chartColor } from '@/src/constants/admin-chart'
import type { PlanRole } from '@/src/utils/subscription-plans'

interface ChartHandlers {
  chartRef: {
    chart?: { getElementsAtEventForMode: () => { index: number; datasetIndex: number }[] }
  } | null
  handleChartClick: (event: MouseEvent) => void
  handleChartMove: (event: MouseEvent) => void
}

interface BarProps {
  data: ChartData<'bar' | 'line'>
  options: ChartOptions<'bar' | 'line'>
  plugins: Plugin<'bar' | 'line'>[]
}
interface LineProps {
  data: ChartData<'line'>
  options: ChartOptions<'line'>
  plugins: Plugin<'line'>[]
}

const chartState = vi.hoisted(() => ({
  doughnut: null as ChartData<'doughnut'> | null,
  bar: null as ChartData<'bar' | 'line'> | null,
  options: null as ChartOptions<'bar' | 'line'> | null,
  bars: [] as BarProps[],
  line: null as LineProps | null,
  hitTest: vi.fn<() => { index: number; datasetIndex: number }[]>(),
  push: vi.fn(),
  handlers: null as ChartHandlers | null,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: chartState.push }) }))
vi.mock('vue-chartjs', () => {
  const stub = (type: 'doughnut' | 'bar' | 'line') =>
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
        } else if (type === 'line') {
          chartState.line = { data: props.data, options: props.options, plugins: props.plugins }
        } else {
          chartState.doughnut = props.data
        }
        return () => h('div', { 'data-chart': type }, JSON.stringify(props.data))
      },
    })
  return { Doughnut: stub('doughnut'), Bar: stub('bar'), Line: stub('line') }
})

const now = new Date(2026, 9, 20, 12)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  chartState.doughnut = null
  chartState.bar = null
  chartState.options = null
  chartState.bars = []
  chartState.line = null
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
  chartState.line = null
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
  it.each(['landlord', 'tenant'] as const)('%s 顯示單一組合圖與十二個月標籤', async (role) => {
    const html = await render(role)
    expect(html).toContain(role === 'tenant' ? '各方案訂閱人數與單次加購' : '各方案訂閱人數')
    expect(html).toContain('近 12 個月各月月底人數，本月為今日；點長條可篩選方案')
    expect(html).toContain('relative h-72 min-w-0')
    expect(html).not.toContain('md:grid-cols-2')
    expect(html).not.toContain('目前沒有加購紀錄')
    expect(html).not.toContain('位試用中')
    expect(html.match(/data-chart="bar"/g)).toHaveLength(1)
    expect(html).not.toContain('data-chart="line"')
    expect(html).not.toContain('data-chart="doughnut"')
    expect(chartState.line).toBeNull()
    expect(chartState.doughnut).toBeNull()
    expect(chartState.bars).toHaveLength(1)
    expect(chartState.bar!.datasets).toHaveLength(role === 'landlord' ? 3 : 4)
    expect(chartState.bar!.labels).toEqual([
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
    const distribution = planDistribution(directoryRows(), role, now)
    expect(chartState.bar!.datasets.slice(0, 3).map((dataset) => dataset.label)).toEqual(
      distribution.map((segment) => segment.label),
    )
    expect(chartState.bar!.datasets.slice(0, 3).map((dataset) => dataset.data.at(-1))).toEqual(
      distribution.map((segment) => segment.value),
    )
    expect(html).toMatch(
      role === 'landlord' ? /aria-pressed="true"[^>]*>房東/ : /aria-pressed="true"[^>]*>租客/,
    )
  })

  it('預設房東且保留角色切換標頭', async () => {
    const html = await render()
    expect(html).toMatch(/aria-pressed="true"[^>]*>房東/)
    expect(html).toContain('方案角色')
    expect(html).not.toContain('單次加購')
    expect(chartState.bar!.datasets).toHaveLength(3)
  })

  it.each(['landlord', 'tenant'] as const)(
    '%s 全 Free 和試用的本月堆疊等於方案分布',
    async (role) => {
      for (const [freeOnly, trial] of [
        [true, false],
        [false, true],
      ]) {
        await render(role, freeOnly, trial)
        expect(chartState.bar!.datasets.slice(0, 3).map((dataset) => dataset.data.at(-1))).toEqual(
          planDistribution(directoryRows(freeOnly, trial), role, now).map(
            (segment) => segment.value,
          ),
        )
      }
    },
  )

  it.each(['landlord', 'tenant'] as const)('%s 無使用者仍畫十二個月零人數圖', async (role) => {
    const html = await renderToString(
      createSSRApp(SubscriptionOverviewCard, { role, rows: [], subscriptions: [] }),
    )
    expect(html).toContain('data-chart="bar"')
    expect(chartState.bar!.labels).toHaveLength(12)
    expect(
      chartState.bar!.datasets.every((dataset) => dataset.data.every((value) => value === 0)),
    ).toBe(true)
  })

  it('直條沿用方案顏色、堆疊人數軸及底部圖例', async () => {
    await render()
    for (const [index, color] of ['plan-free', 'plan-plus', 'plan-pro'].entries()) {
      expect(chartState.bar!.datasets[index]).toMatchObject({
        type: 'bar',
        backgroundColor: chartColor(color as 'plan-free' | 'plan-plus' | 'plan-pro'),
        stack: 'plans',
        yAxisID: 'y',
        borderRadius: 4,
        maxBarThickness: 36,
        order: 1,
      })
    }
    expect(chartState.options!.scales?.x).toMatchObject({ stacked: true, grid: { display: false } })
    expect(chartState.options!.scales?.y).toMatchObject({
      stacked: true,
      beginAtZero: true,
      ticks: { precision: 0 },
      title: { display: true, text: '人數' },
    })
    expect(chartState.options!.scales?.y1).toBeUndefined()
    expect(chartState.options!.plugins?.legend).toMatchObject({
      display: true,
      position: 'bottom',
      labels: { color: chartColor('label'), boxWidth: 12 },
    })
    expect(chartState.options!.layout?.padding).toMatchObject({ top: 24 })
    expect(chartState.options!.scales?.y?.suggestedMax).toBeGreaterThan(1)
    expect(chartState.options!.interaction).toEqual({ mode: 'index', intersect: false })
  })

  it('租客加購折線使用右軸並繪製在長條上方', async () => {
    expect(ChartJS.registry.getController('line')).toBeDefined()
    await render('tenant', false, false, purchaseSubscriptions())
    expect(chartState.bar!.datasets[3]).toMatchObject({
      type: 'line',
      label: '單次加購',
      data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 5],
      yAxisID: 'y1',
      borderColor: chartColor('attention'),
      pointBackgroundColor: chartColor('attention'),
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      order: 0,
      fill: false,
    })
    expect(chartState.options!.scales?.y1).toMatchObject({
      position: 'right',
      beginAtZero: true,
      ticks: { precision: 0 },
      grid: { drawOnChartArea: false },
      title: { display: true, text: '加購包數' },
    })
    expect(chartState.options!.scales?.y1?.suggestedMax).toBeGreaterThan(5)
  })

  it('沒有購買或只有管理員贈送時仍顯示零值加購折線', async () => {
    const subscriptions = purchaseSubscriptions().map((sub) =>
      sub.role === 'tenant'
        ? { ...sub, checkPacks: sub.checkPacks.filter((pack) => pack.source === 'admin') }
        : sub,
    )
    for (const collection of [[], subscriptions]) {
      const html = await render('tenant', false, false, collection)
      expect(html).not.toContain('目前沒有加購紀錄')
      expect(chartState.bar!.datasets[3].data).toEqual(Array(12).fill(0))
      expect(chartState.line).toBeNull()
    }
  })

  it('tooltip 顯示方案位數、加購包數，合計排除折線', async () => {
    await render('tenant', false, false, purchaseSubscriptions())
    const callbacks = chartState.options!.plugins!.tooltip!.callbacks!
    const items = chartState.bar!.datasets.map(
      (dataset, datasetIndex) =>
        ({
          dataset,
          datasetIndex,
          dataIndex: 11,
          label: '10月',
          parsed: { x: 11, y: dataset.data[11] },
        }) as TooltipItem<'bar' | 'line'>,
    )
    expect(callbacks.label!.call({} as never, items[0])).toBe('Free 租屋入門：0 位')
    expect(callbacks.label!.call({} as never, items[1])).toBe('Plus 安心租住：2 位')
    expect(callbacks.label!.call({} as never, items[2])).toBe('Pro 合租進階：0 位')
    expect(callbacks.label!.call({} as never, items[3])).toBe('5 包')
    expect(callbacks.footer!.call({} as never, items)).toBe('合計：2 位')
    expect(callbacks.footer!.call({} as never, [])).toBe('合計：0 位')
  })

  it('標籤插件每月只畫一個非零堆疊合計及非零折線值', async () => {
    await render('tenant', false, false, purchaseSubscriptions())
    const { plugins } = chartState.bars[0]
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
    const data: ChartData<'bar' | 'line'> = {
      labels: ['1月', '2月', '3月'],
      datasets: [
        { type: 'bar', data: [0, 2, 1] },
        { type: 'bar', data: [0, 3, 0] },
        { type: 'bar', data: [0, 4, 0] },
        { type: 'line', data: [0, 6, 7] },
      ],
    }
    const chart = {
      ctx,
      data,
      getDatasetMeta: (datasetIndex: number) => ({
        data: data.datasets[datasetIndex].data.map((_, index) => ({
          x: index * 20,
          y: datasetIndex === 3 ? 40 : 100 - datasetIndex * 10,
        })),
      }),
    } as unknown as Chart<'bar' | 'line'>
    plugins[0].afterDatasetsDraw!(chart, {}, {}, false)
    expect(ctx.save).toHaveBeenCalledOnce()
    expect(ctx.restore).toHaveBeenCalledOnce()
    expect(ctx.font).toBe('500 12px "Geist Variable", sans-serif')
    expect(ctx.fillStyle).toBe(chartColor('label'))
    expect(ctx.textAlign).toBe('center')
    expect(ctx.textBaseline).toBe('bottom')
    expect(ctx.fillText.mock.calls).toEqual([
      ['9', 20, 74],
      ['1', 40, 74],
      ['6', 20, 34],
      ['7', 40, 34],
    ])
  })

  it.each(['landlord', 'tenant'] as const)(
    '%s 點長條依 dataset 篩選方案，折線及空白無操作也不顯示手形',
    async (role) => {
      await render(role, false, false, purchaseSubscriptions())
      const handlers = chartState.handlers!
      // SSR 不會設定 template ref，補上 Bar stub 公開的 chart 實例來驗證事件處理。
      handlers.chartRef = { chart: { getElementsAtEventForMode: chartState.hitTest } }
      const wrapper = { style: { cursor: 'default' } }
      const event = { currentTarget: wrapper } as unknown as MouseEvent
      handlers.handleChartClick(event)
      expect(chartState.push).not.toHaveBeenCalled()
      for (const [datasetIndex, planKey] of ['free', 'plus', 'pro'].entries()) {
        chartState.hitTest.mockReturnValue([{ index: 11, datasetIndex }])
        handlers.handleChartClick(event)
        expect(chartState.push).toHaveBeenLastCalledWith({
          path: '/admin/users',
          query: { role: role === 'landlord' ? 'landlord' : 'user', plan: `${role}-${planKey}` },
        })
        handlers.handleChartMove(event)
        expect(wrapper.style.cursor).toBe('pointer')
      }
      expect(chartState.hitTest).toHaveBeenCalledWith(event, 'nearest', { intersect: true }, false)
      for (const hits of [[{ index: 11, datasetIndex: 3 }], []]) {
        chartState.hitTest.mockReturnValue(hits)
        handlers.handleChartMove(event)
        expect(wrapper.style.cursor).toBe('default')
        handlers.handleChartClick(event)
        expect(chartState.push).toHaveBeenCalledTimes(3)
      }
      handlers.chartRef = null
      handlers.handleChartClick(event)
      expect(chartState.push).toHaveBeenCalledTimes(3)
    },
  )
})

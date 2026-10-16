import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import Dashboard from './dashboard.vue'
import type { CycleView } from '@/src/utils/dashboard-contract'

const mocks = vi.hoisted(() => ({
  selected: true,
  cycles: [] as CycleView[],
  contract: {
    id: 'rental-1',
    title: 'pp 1',
    city: '',
    accent: 'sky',
    cycles: [],
    leaseMonths: 24,
    paidCount: 12,
    dueDay: 5,
  },
  stats: {
    totalMonthlyRent: 40000,
    totalPending: 120000,
    nearestDue: '2026-10-20',
    overdueCount: 0,
    totalPaid: 12,
    totalCycles: 24,
    pendingUtilityCount: 2,
  },
}))

vi.mock('@/src/composables/useDashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/composables/useDashboard')>()
  const { ref } = await import('vue')
  return {
    useDashboard: () => ({
      ...actual.useDashboard(),
      activeContractView: ref(mocks.selected ? mocks.contract : null),
      globalStats: ref(mocks.stats),
      filteredCycles: ref(mocks.cycles),
    }),
  }
})
vi.mock('@/src/composables/usePublicContent', async () => {
  const { ref } = await import('vue')
  return { usePublicContent: () => ({ tenantAnnouncements: ref([]), banners: ref([]) }) }
})
vi.mock('@/src/composables/useAnnouncementDismissal', () => ({
  useAnnouncementDismissal: () => ({ isDismissed: () => false, dismiss: vi.fn() }),
}))
vi.mock('@/src/composables/useFeatureGate', () => ({
  useFeatureGate: () => ({ isPathUnderMaintenance: () => false }),
}))

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/app')
  const app = createSSRApp(Dashboard)
  app.use(router)
  return renderToString(app)
}

beforeEach(() => {
  mocks.selected = true
  mocks.contract.title = 'pp 1'
  mocks.contract.city = ''
  mocks.stats.overdueCount = 0
  mocks.cycles = []
})

describe('租屋總覽手機文案', () => {
  it.each([
    ['pp 1', '', 'pp 1'],
    ['pp 1', '臺北市', 'pp 1 · 臺北市'],
    ['', '臺北市', '臺北市'],
    ['', '', ''],
  ])('副標只連接非空的租約名稱與城市：%s / %s', async (title, city, subtitle) => {
    mocks.contract.title = title
    mocks.contract.city = city
    const header = (await render()).match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1]
    expect(header?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1]?.trim()).toBe(subtitle)
  })

  it('未選擇租約時保留提示', async () => {
    mocks.selected = false
    expect(await render()).toContain('尚未選擇租約')
  })

  it('統計卡保留完整數值、手機短文案與電腦原文案', async () => {
    const cards = (await render()).match(/<section\b[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
    for (const value of ['$40,000', '$120,000', '12 / 24']) {
      expect(cards).toContain(value)
    }
    for (const [mobile, desktop] of [
      ['合計', '所有租約合計'],
      ['本期待繳', '所有租約本期已知待繳金額'],
      ['待繳期限', '最近待繳期限'],
      ['已繳 / 全部', '已繳期數 / 全部期數'],
    ]) {
      expect(cards).toContain(`<span class="sm:hidden">${mobile}</span>`)
      expect(cards).toContain(`<span class="hidden sm:inline">${desktop}</span>`)
    }
    expect(cards).toContain('另有 2 期水電資料待填寫')
  })

  it('逾期警示保留原文並取代一般期限說明', async () => {
    mocks.stats.overdueCount = 3
    const cards = (await render()).match(/<section\b[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
    expect(cards).toContain('有 3 筆逾期帳單')
    expect(cards).not.toContain('待繳期限')
  })

  it.each([true, false])('已繳憑證依實際存檔狀態顯示下載或舊紀錄提示：%s', async (stored) => {
    mocks.cycles = [{
      contractId: 'rental-1', contractTitle: 'pp 1', status: 'paid',
      totalAmount: 20000, partialAmount: 20000, daysLeft: 0, utilityReady: true,
      cycle: {
        id: '12', periodIndex: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31',
        dueDate: '2026-10-05', rentAmount: 20000, electricityAmount: 0, waterAmount: 0,
        paidAt: '2026-10-03', paymentMethod: 'bank-transfer', paymentNote: '',
        paymentProofName: '轉帳憑證.png', paymentProofStored: stored,
      },
    }]
    const html = await render()
    expect(html).toContain('轉帳憑證.png')
    if (stored) {
      expect(html).toMatch(/<button[^>]*>轉帳憑證.png<\/button>/)
      expect(html).not.toContain('舊紀錄僅保存檔名')
    } else {
      expect(html).not.toMatch(/<button[^>]*>轉帳憑證.png<\/button>/)
      expect(html).toContain('舊紀錄僅保存檔名')
    }
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { joinUserCases, joinUserDirectory, realAccountToRow, type UserDirectoryRow } from '@/src/utils/admin-user-directory'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import { seedSubscriptions } from '@/src/mocks/admin/subscription'
import { seedAccountUsage } from '@/src/mocks/admin/usage'
import UserDetail from './user-detail.vue'

const state = vi.hoisted(() => ({
  row: null as UserDirectoryRow | null,
  ticketsState: 'ready' as 'ready' | 'error',
}))
vi.mock('@/src/composables/admin/useAdminMaintenance', () => ({
  useAdminMaintenance: () => ({ ticketViews: ref([]), loadState: ref(state.ticketsState), reload: vi.fn() }),
}))
vi.mock('@/src/composables/admin/useAdminDirectory', () => ({
  useAdminDirectory: () => ({ rowOf: () => state.row, setRealAccountStatus: vi.fn() }),
}))
vi.mock('vue-router', async (original) => ({
  ...(await original<typeof import('vue-router')>()),
  useRoute: () => ({ params: { id: 'test' }, path: '/admin/users/test' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/components/ui/select/index', () => {
  const slotComponent = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('div', attrs, slots.default?.())
    },
  })
  const Select = defineComponent({
    props: { modelValue: { type: String, default: undefined } },
    setup(props, { slots }) {
      return () => h('div', { 'data-model-value': props.modelValue }, slots.default?.())
    },
  })
  return {
    Select,
    SelectContent: slotComponent,
    SelectItem: slotComponent,
    SelectTrigger: slotComponent,
    SelectValue: slotComponent,
  }
})

beforeEach(() => {
  state.ticketsState = 'ready'
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 6, 12))
})
afterEach(() => vi.useRealTimers())

async function render(role: 'user' | 'landlord' | 'admin', withSubscription = true) {
  const user = seedAdminUsers().find((user) => user.role === role)!
  const subscriptions = withSubscription ? seedSubscriptions([user]) : []
  const usageByUserId = withSubscription ? seedAccountUsage([user], subscriptions, new Date()) : undefined
  state.row = joinUserDirectory({ users: [user], subscriptions, usageByUserId, tickets: [], deposits: [] }, 14)[0]
  return (await renderToString(createSSRApp(UserDetail))).replace(/<!--.*?-->/g, '')
}

describe('訂閱與容量角色呈現', () => {
  it('管理員不顯示方案或補發功能', async () => {
    const html = await render('admin')
    expect(html).toContain('管理員帳號不適用方案')
    expect(html).not.toContain('生效方案')
    expect(html).not.toContain('補發契約檢查包')
  })
  it.each([
    ['user', 'Free 租屋入門'],
    ['landlord', 'Free 基礎管理'],
  ] as const)('%s 無紀錄仍顯示 Free 與權益入口，用量未知', async (role, name) => {
    const html = await render(role, false)
    expect(html).toContain(name)
    expect(html).toContain(`${name}包含什麼`)
    expect(html).toContain('讀不到用量')
    if (role === 'user') {
      expect(html).toContain('AI 契約分析：尚未串接')
      expect(html).toContain('附件容量：尚未串接')
    }
    expect(html).not.toContain('補發契約檢查包')
    expect(html).not.toContain('下次扣款日')
  })
  it('房東不顯示租客用量進度條與加購區塊', async () => {
    const html = await render('landlord')
    expect(html).toContain('Free 基礎管理')
    expect(html.match(/role="progressbar"/g)).toHaveLength(3)
    expect(html).toContain('管理物件 1 / 1 個')
    expect(html).toContain('管理房間 5 / 5 間')
    expect(html).toContain('管理者席次 1 / 1 席（含擁有者）')
    expect(html).not.toContain('契約檢查包')
  })
  it('租客顯示一次性額度、容量、包數與補發入口', async () => {
    const html = await render('user')
    expect(html).toContain('驗證帳號一次性贈送')
    expect(html).toContain('附件容量')
    expect(html).toContain('剩餘 0 包；購買 0 包、補發 0 包')
    expect(html).toContain('補發契約檢查包')
  })
  it('Free 租客試用 Plus 時，選單仍綁 Free 訂閱且生效文字為 Plus', async () => {
    const user = seedAdminUsers().find((item) => item.role === 'user')!
    const [subscription] = seedSubscriptions([user])
    if (subscription?.role !== 'tenant') throw new Error('需要租客測試資料')
    subscription.planKey = 'free'
    subscription.billingCycle = null
    subscription.trialEndsAt = new Date(2026, 9, 8, 12).toISOString()
    state.row = joinUserDirectory({
      users: [user],
      subscriptions: [subscription],
      tickets: [],
      deposits: [],
    }, 14)[0]

    const html = (await renderToString(createSSRApp(UserDetail))).replace(/<!--.*?-->/g, '')
    expect(html).toContain('生效方案')
    expect(html).toContain('<p class="font-medium">Plus 安心租住</p>')
    expect(html).toContain('期間享 Plus 安心租住權益')
    expect(html).toContain('訂閱方案')
    expect(html).toContain('data-model-value="free"')
  })
})

const realAccount = {
  id: 7, email: 'real@example.com', displayName: '真實帳號', roles: ['tenant'],
  status: 'active', emailVerified: true, createdAt: null, lastLoginAt: null,
}

async function renderCurrentRow() {
  return (await renderToString(createSSRApp(UserDetail))).replace(/<!--.*?-->/g, '')
}

describe('帳號計數用量', () => {
  it('真實房東超出物件上限，顯示逐項與整體警示、進度封頂與左欄計數', async () => {
    state.row = realAccountToRow({ ...realAccount, roles: ['landlord'], usage: {
      landlord: { properties: 2, rooms: 5, seats: 1 }, tenant: null,
    } })
    const html = await renderCurrentRow()
    expect(html).toContain('管理物件 2 / 1 個')
    expect(html.match(/超出上限/g)).toHaveLength(1)
    expect(html).toContain('超出方案上限')
    expect(html).toContain('aria-valuenow="100"')
    expect(html).toContain('[&amp;&gt;div]:bg-accent')
    expect(html).toMatch(/物件<\/dt>.*?2 \/ 1/s)
    expect(html).toMatch(/房間<\/dt>.*?5 \/ 5/s)
    expect(html).not.toContain('AI 用量')
    expect(html).not.toContain('儲存用量')
  })
  it('只加入別人空間的租客顯示擁有者及人數、不算超出', async () => {
    state.row = realAccountToRow({ ...realAccount, usage: {
      landlord: null, tenant: { ownedSpaces: [], joinedSpaces: [
        { id: 1, name: '室友空間', ownerId: 8, ownerName: '小艾', memberCount: 6 },
      ] },
    } })
    expect(state.row.overLimit).toBe(false)
    const html = await renderCurrentRow()
    expect(html).toContain('加入 小艾 的空間（共 6 人），不佔此帳號額度')
    expect(html).toContain('共享空間 0 / 1 個')
    expect(html).not.toContain('超出方案上限')
    expect(html).not.toContain('超出上限')
    expect(html).not.toContain('空間人數 6 /')
  })
  it('真實租客無訂閱，AI 與附件各自顯示尚未串接', async () => {
    state.row = realAccountToRow({ ...realAccount, usage: {
      landlord: null, tenant: { ownedSpaces: [], joinedSpaces: [] },
    } })
    const html = await renderCurrentRow()
    expect(html).toContain('AI 契約分析：尚未串接')
    expect(html).toContain('附件容量：尚未串接')
    expect(html).toContain('尚未建立共享空間')
  })
  it.each(['tenant', 'landlord'])('%s usage null 顯示讀不到、不顯示零計數或進度', async (role) => {
    state.row = realAccountToRow({ ...realAccount, roles: [role], usage: null })
    const html = await renderCurrentRow()
    expect(html).toContain('讀不到用量')
    expect(html).not.toMatch(/0 \/ \d/)
    expect(html).not.toContain('role="progressbar"')
    expect(html).not.toContain('尚未建立共享空間')
  })
  it('多個自建空間逐一顯示名稱與人數，人數和空間數超出各有警示', async () => {
    state.row = realAccountToRow({ ...realAccount, usage: {
      landlord: null, tenant: { joinedSpaces: [], ownedSpaces: [
        { id: 1, name: '第一個家', ownerId: 7, ownerName: '真實帳號', memberCount: 3 },
        { id: 2, name: '第二個家', ownerId: 7, ownerName: '真實帳號', memberCount: 4 },
      ] },
    } })
    const html = await renderCurrentRow()
    expect(html).toContain('共享空間 2 / 1 個')
    expect(html).toContain('第一個家')
    expect(html).toContain('第二個家')
    expect(html).toContain('空間人數 3 / 3 人（含付費者）')
    expect(html).toContain('空間人數 4 / 3 人（含付費者）')
    expect(html.match(/超出上限/g)).toHaveLength(2)
    expect(html).toContain('超出方案上限')
  })
})


describe('真實帳號的報修工單卡', () => {
  const realRow = () => realAccountToRow({
    id: 7, email: 'real@example.com', displayName: '真實租客', roles: ['user'],
    status: 'active', emailVerified: true, createdAt: null, lastLoginAt: null,
  })

  it('顯示關聯工單及待處理數，並可導向工單頁', async () => {
    state.row = joinUserCases(realRow(), [], [{
      id: 'R-real-7', address: '真實報修地址', tenantUserId: 'real-7', landlordUserId: 'real-3',
      category: 'leak', description: '漏水', status: 'submitted', createdAt: '2026-10-01',
      notifiedAt: null, firstResponseAt: null, completedAt: null, timeline: [], adminNote: '',
      interventionRequested: false, manuallyQueued: false, overdue: true,
    }])
    const html = await renderToString(createSSRApp(UserDetail))
    expect(html).toContain('R-real-7')
    expect(html).toContain('真實報修地址')
    expect(html).toContain('1 件逾期')
    expect(html).toContain('在工單頁查看全部')
    expect(html).not.toContain('沒有相關的報修工單。')
  })

  it('讀不到時呈現提示，不聲稱沒有相關工單或待處理數為零', async () => {
    state.row = realRow()
    state.ticketsState = 'error'
    const html = await renderToString(createSSRApp(UserDetail))
    expect(html).toContain('讀不到伺服器上的報修工單')
    expect(html).toContain('讀不到工單資料')
    expect(html).not.toContain('沒有相關的報修工單。')
    expect(html).not.toContain('0 件')
  })
})

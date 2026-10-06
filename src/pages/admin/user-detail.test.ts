import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { joinUserDirectory, type UserDirectoryRow } from '@/src/utils/admin-user-directory'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import { seedSubscriptions } from '@/src/mocks/admin/subscription'
import UserDetail from './user-detail.vue'

const state = vi.hoisted(() => ({ row: null as UserDirectoryRow | null }))
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
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 6, 12))
})
afterEach(() => vi.useRealTimers())

async function render(role: 'user' | 'landlord' | 'admin', withSubscription = true) {
  const user = seedAdminUsers().find((user) => user.role === role)!
  const subscriptions = withSubscription ? seedSubscriptions([user]) : []
  state.row = joinUserDirectory({ users: [user], subscriptions, tickets: [], deposits: [] }, 14)[0]
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
    expect(html).toContain('用量：尚未串接')
    expect(html).not.toContain('補發契約檢查包')
    expect(html).not.toContain('下次扣款日')
  })
  it('房東不顯示租客用量進度條與加購區塊', async () => {
    const html = await render('landlord')
    expect(html).toContain('Free 基礎管理')
    expect(html).not.toContain('role="progressbar"')
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

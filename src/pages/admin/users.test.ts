import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import Users from './users.vue'
import { userPlan } from '@/src/utils/admin-plans'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import { fetchAdminAccounts, type AdminAccount } from '@/src/services/adminUsersApi'

vi.mock('@/src/services/adminUsersApi', () => ({
  fetchAdminAccounts: vi.fn(async () => []),
  updateAccountStatus: vi.fn(),
}))
vi.mock('@/components/ui/select/index', () => {
  const slotComponent = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('div', attrs, slots.default?.())
    },
  })
  const Select = defineComponent({
    props: ['modelValue'],
    setup(props, { slots }) {
      return () => h('div', { 'data-model-value': props.modelValue }, slots.default?.())
    },
  })
  return {
    Select,
    SelectContent: slotComponent,
    SelectItem: slotComponent,
    SelectGroup: slotComponent,
    SelectLabel: slotComponent,
    SelectTrigger: slotComponent,
    SelectValue: slotComponent,
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 6, 12))
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function render(query: Record<string, string | string[]>, accounts: AdminAccount[] = []) {
  vi.mocked(fetchAdminAccounts).mockResolvedValue(accounts)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/users', component: Users }],
  })
  await router.push({ path: '/admin/users', query })
  let directory!: ReturnType<typeof useAdminDirectory>
  const app = createSSRApp(
    defineComponent({
      async setup() {
        directory = useAdminDirectory()
        directory.clearFilter()
        await directory.reloadRealAccounts()
        return () => h(Users)
      },
    }),
  )
  app.use(router)
  const html = await renderToString(app)
  return { html, directory }
}

describe('使用者列表多重身分', () => {
  const account: AdminAccount = {
    id: 7, email: 'dual@example.com', displayName: '雙重身分', roles: ['tenant', 'landlord'],
    status: 'active', emailVerified: true, createdAt: null, lastLoginAt: null,
    providers: [], hasPassword: true, avatarUrl: null,
  }

  it.each(['user', 'landlord'])('篩選 %s 仍列出雙重身分並顯示兩個標籤', async (role) => {
    const { html, directory } = await render({ role }, [account])
    expect(directory.filteredRows.value.some((row) => row.realAccountId === account.id)).toBe(true)
    const cells = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)?.find((row) => row.includes(account.email))
    expect(cells).toMatch(/<span[^>]*>房東<\/span>/)
    expect(cells).toMatch(/<span[^>]*>租客<\/span>/)
  })

  it('管理員只顯示管理身分', async () => {
    const { html } = await render({ role: 'admin' }, [{ ...account, roles: ['tenant', 'landlord', 'admin'] }])
    const cells = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)?.find((row) => row.includes(account.email))
    expect(cells).toMatch(/<span[^>]*>管理員<\/span>/)
    expect(cells).not.toMatch(/<span[^>]*>(房東|租客)<\/span>/)
  })
})

describe('使用者列表 query 預選', () => {
  it('over-limit query 預選且僅列出超出帳號，列表亮出警示', async () => {
    const { html, directory } = await render({ alert: 'over-limit' })
    expect(directory.filter.value.alert).toBe('over-limit')
    expect(directory.filteredRows.value.length).toBeGreaterThan(0)
    expect(directory.filteredRows.value.every((row) => row.overLimit)).toBe(true)
    expect(html).toContain('data-model-value="over-limit"')
    expect(html).toContain('超出方案上限')
  })
  it('房東 Plus query 預選兩個篩選與甜甜圈角色，確實只列出對應方案', async () => {
    const { html, directory } = await render({ role: 'landlord', plan: 'landlord-plus' })
    expect(directory.filter.value).toMatchObject({ role: 'landlord', plan: 'landlord-plus' })
    expect(html.replace(/<!--.*?-->/g, '')).toMatch(/aria-pressed="true"[^>]*>房東/)
    expect(directory.filteredRows.value.length).toBeGreaterThan(0)
    expect(
      directory.filteredRows.value.every(
        (row) =>
          row.user.role === 'landlord' && userPlan(row.user, row.subscription)?.key === 'plus',
      ),
    ).toBe(true)
    expect(html).toContain('data-model-value="landlord-plus"')
    expect(html).toContain('data-model-value="landlord"')
  })
  it('租客 Free query 對應 tenant 甜甜圈，原 alert query 同時保留', async () => {
    const { html, directory } = await render({
      role: 'user',
      plan: 'tenant-free',
      alert: 'subscription-expiring',
    })
    expect(directory.filter.value).toMatchObject({
      role: 'user',
      plan: 'tenant-free',
      alert: 'subscription-expiring',
    })
    expect(html.replace(/<!--.*?-->/g, '')).toMatch(/aria-pressed="true"[^>]*>租客/)
  })
  it.each([
    { role: 'tenant', plan: 'plus' },
    { role: ['landlord', 'user'], plan: ['tenant-free', 'landlord-plus'] },
    { role: 'invalid', plan: 'tenant-enterprise' },
  ])('忽略無效或重複 query：%j', async (query) => {
    const { directory } = await render(query)
    expect(directory.filter.value).toMatchObject({ role: 'all', plan: 'all' })
  })
})

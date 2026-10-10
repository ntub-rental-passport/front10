import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import Users from './users.vue'
import { userPlan } from '@/src/utils/admin-plans'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'

vi.mock('@/src/services/adminUsersApi', () => ({
  fetchAdminAccounts: async () => [],
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

async function render(query: Record<string, string | string[]>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/users', component: Users }],
  })
  await router.push({ path: '/admin/users', query })
  let directory!: ReturnType<typeof useAdminDirectory>
  const app = createSSRApp(
    defineComponent({
      setup() {
        directory = useAdminDirectory()
        directory.clearFilter()
        return () => h(Users)
      },
    }),
  )
  app.use(router)
  const html = await renderToString(app)
  return { html, directory }
}

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

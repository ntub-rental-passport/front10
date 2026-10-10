import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, getCurrentInstance, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BannersTab from './BannersTab.vue'
import type { BannerImage, BannerImageLibrary } from '@/src/services/bannerImageApi'
import type { BannerLibraryEntry } from '@/src/utils/banner-library'
import type { Banner } from '@/src/mocks/admin/content'

const api = vi.hoisted(() => ({
  fetchBannerImages: vi.fn(), uploadBannerImage: vi.fn(), deleteBannerImage: vi.fn(),
}))
const content = vi.hoisted(() => ({
  banners: [] as Banner[], saveBanner: vi.fn(), removeBanner: vi.fn(),
  moveBanner: vi.fn(), reorderBanner: vi.fn(),
}))
vi.mock('@/src/services/bannerImageApi', () => api)
vi.mock('@/src/composables/admin/useAdminContent', () => ({
  loadAdminContent: vi.fn(),
  useAdminContent: () => ({ ...content, banners: ref(content.banners), loadState: ref('ready') }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: () => ({ matched: [{ path: '/tenant/subsidy' }] }) }),
}))
const view = vi.hoisted(() => ({ handlers: null as unknown }))
vi.mock('@/src/components/content/BannerCarousel.vue', () => ({
  default: defineComponent({
    setup() {
      const owner = getCurrentInstance()!.parent!
      view.handlers = (owner as unknown as { setupState: Handlers }).setupState
      return () => h('div')
    },
  }),
}))
vi.mock('@/src/components/admin/AdminRowActions.vue', () => ({
  default: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
}))
vi.mock('@/components/ui/dialog/index', () => {
  const slot = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
  return {
    Dialog: defineComponent({
      props: ['open'], setup: (props, { slots }) => () => props.open ? h('div', slots.default?.()) : null,
    }),
    DialogContent: slot, DialogDescription: slot, DialogFooter: slot,
    DialogHeader: slot, DialogTitle: slot,
  }
})
vi.mock('@/components/ui/select/index', () => {
  const slot = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
  return Object.fromEntries([
    'Select', 'SelectContent', 'SelectGroup', 'SelectItem', 'SelectLabel', 'SelectTrigger', 'SelectValue',
  ].map((name) => [name, slot]))
})

interface Handlers {
  loadUploadedImages: () => Promise<void>
  pickLibraryImage: (image: BannerLibraryEntry) => void
  openCreate: () => void
  openEdit: (banner: Banner) => void
  pickUpload: (select: boolean) => void
  onPickFile: (event: Event) => Promise<void>
  openImageDelete: (image: BannerLibraryEntry) => void
  confirmImageDelete: () => Promise<void>
  confirmDelete: () => void
  submit: (force: boolean) => Promise<void>
  run: (action: () => Promise<void>) => Promise<void>
  libraryEntries: BannerLibraryEntry[]
  draft: { title: string; imageUrl: string; linkUrl: string }
  deleteTarget: Banner | null
  dialogOpen: boolean
  fileInput: { click: () => void } | null
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await nextTick()
}

async function snapshot(handlers: Handlers): Promise<string> {
  return renderToString(createSSRApp({ ...BannersTab, setup: () => handlers }))
}

function buttons(html: string, label: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(([button]) => button)
    .filter((button) => button.replace(/<[^>]*>/g, '').trim() === label)
}

async function mount() {
  await renderToString(createSSRApp(BannersTab))
  const handlers = view.handlers as Handlers
  // SSR 不執行 mounted；手動讀取圖庫，再以同一份狀態驗證渲染與事件處理。
  await handlers.loadUploadedImages()
  await flush()
  return { handlers }
}

function image(name: string, usedBy: BannerImage['usedBy'] = []): BannerImage {
  return {
    name, url: `/api/content/banner-images/${name}`, size: 123, uploadedAt: 1791437579,
    usedBy, deletable: usedBy.length === 0,
  }
}

const banner: Banner = {
  id: 'ban-1', title: 'A', imageUrl: '/banners/subsidy.webp', linkUrl: '/tenant/subsidy',
  audience: 'all', published: false, startAt: '2026-10-08T00:00:00Z', endAt: null,
  order: 0, updatedAt: '2026-10-08T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  content.banners = []
  api.fetchBannerImages.mockResolvedValue({ items: [], count: 0, limit: 30 })
})
afterEach(() => {
  view.handlers = null
})

describe('BannersTab 圖片庫', () => {
  it('載入後計數只算上傳圖，標示內建、未使用與使用中', async () => {
    const items = [image('unused.webp'), image('used.webp', [{ id: 'ban-1', title: 'A' }])]
    api.fetchBannerImages.mockResolvedValue({ items, count: 2, limit: 30 })
    const { handlers } = await mount()
    expect(api.fetchBannerImages).toHaveBeenCalledOnce()
    expect((await snapshot(handlers))).toContain('2 / 30')
    expect((await snapshot(handlers))).toContain('另有 3 張內建圖片')
    expect((await snapshot(handlers))).toContain('未使用')
    expect((await snapshot(handlers))).toContain('使用中 1')
    const deletes = buttons(await snapshot(handlers), '刪除')
    expect(deletes).toHaveLength(2)
    expect(deletes[0]).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(deletes[1]).toMatch(/\sdisabled(?:=|\s|>)/)
    expect(deletes[1]).toContain('title="還有 1 則輪播在用：「A」"')
    expect(deletes[1]).toContain('aria-label="還有 1 則輪播在用：「A」"')
  })

  it('滿額時頁面與編輯對話框都停用上傳並顯示相同說明', async () => {
    api.fetchBannerImages.mockResolvedValue({ items: [], count: 30, limit: 30 })
    const { handlers } = await mount()
    handlers.openCreate()
    await flush()
    const uploads = buttons(await snapshot(handlers), '上傳圖片')
    expect(uploads).toHaveLength(2)
    for (const upload of uploads) {
      expect(upload).toMatch(/\sdisabled(?:=|\s|>)/)
      expect(upload).toContain('title="圖庫已滿（30 張），請先刪除未使用的圖片。"')
    }
    expect((await snapshot(handlers)).match(/30 \/ 30/g)).toHaveLength(2)
  })

  it('讀取失敗隱藏縮圖並提供重試，重試後顯示圖片', async () => {
    api.fetchBannerImages.mockResolvedValueOnce(null)
    const { handlers } = await mount()
    expect((await snapshot(handlers))).toContain('圖片庫讀取失敗')
    expect((await snapshot(handlers)).match(/<img /g) ?? []).toHaveLength(0)
    expect(buttons(await snapshot(handlers), '重試')).toHaveLength(1)
    await handlers.loadUploadedImages()
    await flush()
    expect((await snapshot(handlers))).not.toContain('圖片庫讀取失敗')
    expect((await snapshot(handlers)).match(/<img /g)).toHaveLength(3)
  })

  it('點縮圖開啟新增輪播並預選圖片', async () => {
    const { handlers } = await mount()
    expect(await snapshot(handlers)).toContain('aria-label="選用租補試算新增輪播"')
    handlers.pickLibraryImage(handlers.libraryEntries[0]!)
    expect(handlers.dialogOpen).toBe(true)
    expect(handlers.draft.imageUrl).toBe('/banners/subsidy.webp')
  })

  it.each([false, true])('上傳來源 select=%s，重載 API 計數且只有對話框會自動選圖', async (select) => {
    const { handlers } = await mount()
    const uploaded = image('new.webp')
    if (select) handlers.openCreate()
    await flush()
    handlers.fileInput = { click: vi.fn() }
    handlers.pickUpload(select)
    api.fetchBannerImages.mockResolvedValue({ items: [uploaded], count: 1, limit: 30 })
    let resolveUpload!: (value: BannerImage) => void
    api.uploadBannerImage.mockReturnValue(new Promise<BannerImage>((resolve) => { resolveUpload = resolve }))
    const file = new File(['image'], 'new.webp')
    const input = { files: [file], value: 'new.webp' }
    const pending = handlers.onPickFile({ target: input } as unknown as Event)
    await flush()
    const uploads = buttons(await snapshot(handlers), '上傳中…')
    expect(uploads.length).toBeGreaterThan(0)
    expect(uploads.every((button) => /\sdisabled(?:=|\s|>)/.test(button))).toBe(true)
    resolveUpload(uploaded)
    await pending
    await flush()
    expect(api.uploadBannerImage).toHaveBeenCalledWith(file)
    expect(input.value).toBe('')
    expect(handlers.draft.imageUrl).toBe(select ? uploaded.url : '')
    expect((await snapshot(handlers))).toContain('1 / 30')
    expect(handlers.libraryEntries.at(-1)?.url).toBe(uploaded.url)
  })

  it('刪除先確認，失敗原樣顯示理由，成功後重載圖片庫', async () => {
    api.fetchBannerImages.mockResolvedValue({ items: [image('unused.webp')], count: 1, limit: 30 })
    const { handlers } = await mount()
    handlers.openImageDelete(handlers.libraryEntries.at(-1)!)
    await flush()
    expect(api.deleteBannerImage).not.toHaveBeenCalled()
    expect((await snapshot(handlers))).toContain('「unused.webp」刪除後無法復原。')
    const detail = '這張圖片還有 2 則輪播在用：「A」、「B」。請先替那些輪播換圖再刪除。'
    api.deleteBannerImage.mockRejectedValueOnce(new Error(detail))
    await handlers.confirmImageDelete()
    await flush()
    expect((await snapshot(handlers))).toContain(detail)
    api.fetchBannerImages.mockResolvedValue({ items: [], count: 0, limit: 30 })
    await handlers.confirmImageDelete()
    await flush()
    expect(api.deleteBannerImage).toHaveBeenLastCalledWith('unused.webp')
    expect(api.fetchBannerImages).toHaveBeenCalledTimes(2)
    expect((await snapshot(handlers))).toContain('0 / 30')
    expect((await snapshot(handlers))).not.toContain('刪除後無法復原')
  })

  it.each(['create', 'update', 'delete', 'move', 'reorder'])(
    '輪播 %s 成功後重載圖片庫', async (action) => {
      const { handlers } = await mount()
      if (action === 'create' || action === 'update') {
        if (action === 'update') handlers.openEdit(banner)
        else handlers.openCreate()
        await flush()
        handlers.draft.title = 'A'
        handlers.draft.imageUrl = '/banners/subsidy.webp'
        handlers.draft.linkUrl = '/tenant/subsidy'
        api.fetchBannerImages.mockClear()
        await handlers.submit(true)
        expect(content.saveBanner).toHaveBeenCalledOnce()
      } else if (action === 'delete') {
        handlers.deleteTarget = banner
        handlers.confirmDelete()
        await flush()
        expect(content.removeBanner).toHaveBeenCalledWith(banner.id)
      } else {
        await handlers.run(() => action === 'move'
          ? content.moveBanner(banner.id, 'up') : content.reorderBanner(banner.id, 1))
      }
      expect(api.fetchBannerImages).toHaveBeenCalledTimes(action === 'create' || action === 'update' ? 1 : 2)
    },
  )

  it('重疊讀取只採用最後一個請求，避免舊的使用狀態蓋回來', async () => {
    const { handlers } = await mount()
    let resolveOld!: (value: BannerImageLibrary) => void
    api.fetchBannerImages.mockReturnValueOnce(new Promise<BannerImageLibrary>((resolve) => { resolveOld = resolve }))
    const old = handlers.loadUploadedImages()
    api.fetchBannerImages.mockResolvedValueOnce({ items: [], count: 0, limit: 30 })
    await handlers.loadUploadedImages()
    resolveOld({ items: [image('old.webp')], count: 1, limit: 30 })
    await old
    await flush()
    expect((await snapshot(handlers))).toContain('0 / 30')
    expect(handlers.libraryEntries).toHaveLength(3)
  })
})

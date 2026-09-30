import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Announcement, Banner } from '@/src/mocks/admin/content'

function banner(id: string, order: number): Banner {
  return {
    id, title: id, imageUrl: '/banners/subsidy.webp', linkUrl: '/app/subsidy', order,
    published: true, startAt: '2026-09-01T00:00:00.000Z', endAt: null, updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

function announcement(id: string): Announcement {
  return {
    id, title: id, body: '內容', level: 'info', audience: 'all', published: true,
    startAt: '2026-09-01T00:00:00.000Z', endAt: null, updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

const api = vi.hoisted(() => ({
  fetchAdminContent: vi.fn(),
  reorderBanners: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  createBanner: vi.fn(),
  updateBanner: vi.fn(),
  deleteBanner: vi.fn(),
}))

vi.mock('@/src/services/contentApi', () => api)
vi.mock('@/src/composables/usePublicContent', () => ({ refreshPublicContent: vi.fn(async () => {}) }))

async function loaded() {
  const module = await import('./useAdminContent')
  await module.loadAdminContent()
  return module.useAdminContent()
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  api.fetchAdminContent.mockResolvedValue({
    announcements: [announcement('an-1')],
    banners: [banner('ban-1', 0), banner('ban-2', 1), banner('ban-3', 2)],
  })
  api.reorderBanners.mockImplementation(async (ids: string[]) => ids.map((id, order) => banner(id, order)))
})

describe('輪播排序', () => {
  it('上移是跟前一張交換，送出排好的完整清單', async () => {
    const content = await loaded()
    await content.moveBanner('ban-2', 'up')
    expect(api.reorderBanners).toHaveBeenCalledWith(['ban-2', 'ban-1', 'ban-3'], 'ban-2')
    expect(content.banners.value.map((item) => item.id)).toEqual(['ban-2', 'ban-1', 'ban-3'])
  })

  it('已經在最上面就不用送', async () => {
    const content = await loaded()
    await content.moveBanner('ban-1', 'up')
    expect(api.reorderBanners).not.toHaveBeenCalled()
  })

  it('拖曳可以一次跨好幾個位置', async () => {
    const content = await loaded()
    await content.reorderBanner('ban-1', 2)
    expect(api.reorderBanners).toHaveBeenCalledWith(['ban-2', 'ban-3', 'ban-1'], 'ban-1')
  })

  it('拖回原位不用送', async () => {
    const content = await loaded()
    await content.reorderBanner('ban-2', 1)
    expect(api.reorderBanners).not.toHaveBeenCalled()
  })
})

describe('公告', () => {
  it('新增的放最前面，並回傳後端給的 id', async () => {
    api.createAnnouncement.mockResolvedValue(announcement('an-new'))
    const content = await loaded()
    const { id: _ignored, ...fields } = announcement('草稿')
    const created = await content.saveAnnouncement(fields)
    expect(created.id).toBe('an-new')
    expect(content.announcements.value.map((item) => item.id)).toEqual(['an-new', 'an-1'])
  })

  it('後端拒絕時丟出理由，清單不變', async () => {
    api.deleteAnnouncement.mockRejectedValue(new Error('找不到這筆資料'))
    const content = await loaded()
    await expect(content.removeAnnouncement('an-1')).rejects.toThrow('找不到這筆資料')
    expect(content.announcements.value.map((item) => item.id)).toEqual(['an-1'])
  })
})

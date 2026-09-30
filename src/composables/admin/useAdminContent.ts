/**
 * 後台的公告與首頁輪播，存在後端（backend/admin/content_service.py），
 * 所有管理員、所有裝置看同一份。稽核由後端記。
 *
 * 前台（公開首頁、租客首頁、通知中心）讀的是 usePublicContent，只有生效中的；
 * 這裡是後台用的完整清單與增刪改。每個操作失敗時丟出後端的理由，畫面原樣顯示。
 */
import { ref } from 'vue'
import { refreshPublicContent } from '@/src/composables/usePublicContent'
import {
  createAnnouncement,
  createBanner,
  deleteAnnouncement,
  deleteBanner,
  fetchAdminContent,
  reorderBanners,
  updateAnnouncement,
  updateBanner,
  type AnnouncementInput,
  type BannerInput,
} from '@/src/services/contentApi'
import { reorderByIndex } from '@/src/utils/reorder'
import type { Announcement, Banner } from '@/src/mocks/admin/content'

const announcements = ref<Announcement[]>([])
const banners = ref<Banner[]>([])
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

export async function loadAdminContent(): Promise<void> {
  loadState.value = 'loading'
  const result = await fetchAdminContent()
  if (!result) {
    loadState.value = 'error'
    return
  }
  announcements.value = result.announcements
  banners.value = result.banners
  loadState.value = 'ready'
}

/** 改完之後，這台瀏覽器的首頁與租客畫面馬上看到，不等公開內容的快取過期 */
function afterChange(): void {
  void refreshPublicContent({ force: true })
}

/** 目前的順序（照 order 排）的 id 清單 */
function orderedIds(): string[] {
  return [...banners.value].sort((a, b) => a.order - b.order).map((item) => item.id)
}

export function useAdminContent() {
  if (loadState.value === 'idle') void loadAdminContent()

  // --- 公告 ---
  /** 回傳存好的那一筆：新增時才知道後端給的 id */
  async function saveAnnouncement(input: AnnouncementInput & { id?: string }): Promise<Announcement> {
    const { id, ...fields } = input
    if (id) {
      const saved = await updateAnnouncement(id, fields)
      announcements.value = announcements.value.map((item) => (item.id === id ? saved : item))
      afterChange()
      return saved
    }
    const created = await createAnnouncement(fields)
    announcements.value = [created, ...announcements.value]
    afterChange()
    return created
  }

  async function removeAnnouncement(id: string): Promise<void> {
    await deleteAnnouncement(id)
    announcements.value = announcements.value.filter((item) => item.id !== id)
    afterChange()
  }

  // --- 輪播 ---
  async function saveBanner(input: BannerInput & { id?: string }): Promise<Banner> {
    const { id, ...fields } = input
    if (id) {
      const saved = await updateBanner(id, fields)
      banners.value = banners.value.map((item) => (item.id === id ? saved : item))
      afterChange()
      return saved
    }
    const created = await createBanner(fields)
    banners.value = [...banners.value, created]
    afterChange()
    return created
  }

  async function removeBanner(id: string): Promise<void> {
    await deleteBanner(id)
    banners.value = banners.value.filter((item) => item.id !== id)
    afterChange()
  }

  async function applyOrder(ids: string[], movedId: string): Promise<void> {
    banners.value = await reorderBanners(ids, movedId)
    afterChange()
  }

  async function moveBanner(id: string, direction: 'up' | 'down'): Promise<void> {
    const ids = orderedIds()
    const index = ids.indexOf(id)
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || swapWith < 0 || swapWith >= ids.length) return
    ;[ids[index], ids[swapWith]] = [ids[swapWith], ids[index]]
    await applyOrder(ids, id)
  }

  /** 拖曳排序用：一次跨越多個位置，相鄰交換的 moveBanner 做不到。 */
  async function reorderBanner(id: string, targetIndex: number): Promise<void> {
    const draft = banners.value.map((item) => ({ ...item }))
    reorderByIndex(draft, id, targetIndex)
    const ids = draft.sort((a, b) => a.order - b.order).map((item) => item.id)
    if (ids.join() === orderedIds().join()) return
    await applyOrder(ids, id)
  }

  return {
    announcements,
    banners,
    loadState,
    saveAnnouncement,
    removeAnnouncement,
    saveBanner,
    removeBanner,
    moveBanner,
    reorderBanner,
  }
}

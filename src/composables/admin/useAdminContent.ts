import { computed } from 'vue'
import { createAdminCollection, newId } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  isAnnouncementActive,
  isAnnouncementVisibleToTenant,
  migrateAnnouncements,
} from '@/src/utils/announcement'
import {
  seedAnnouncements,
  seedBanners,
  seedFaqs,
  seedLegalDocs,
  type Announcement,
  type Banner,
  type FaqEntry,
  type LegalDoc,
} from '@/src/mocks/admin-seed'

const announcements = createAdminCollection<Announcement[]>(
  'content-announcements',
  seedAnnouncements,
  migrateAnnouncements,
)
const faqs = createAdminCollection<FaqEntry[]>('content-faqs', seedFaqs)
const legalDocs = createAdminCollection<LegalDoc[]>('content-legal', seedLegalDocs)
const banners = createAdminCollection<Banner[]>('content-banners', seedBanners)

function nowIso(): string {
  return new Date().toISOString()
}

function move<T extends { id: string; order: number }>(list: T[], id: string, direction: 'up' | 'down'): void {
  const sorted = [...list].sort((a, b) => a.order - b.order)
  const index = sorted.findIndex((item) => item.id === id)
  if (index === -1) return
  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= sorted.length) return
  const a = sorted[index]
  const b = sorted[swapWith]
  const temp = a.order
  a.order = b.order
  b.order = temp
}

export function useAdminContent() {
  const { logAction } = useAdminAudit()

  const activeAnnouncements = computed(() => {
    const now = new Date()
    return announcements.value
      .filter((item) => isAnnouncementActive(item, now))
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
  })

  // 後台管理頁要看得到全部生效中公告（不分受眾），租客端（首頁、通知中心）
  // 則只該看到跟自己身分有關的，所以另外導出一份過濾過的清單而不是改掉上面那個。
  const tenantAnnouncements = computed(() =>
    activeAnnouncements.value.filter((item) => isAnnouncementVisibleToTenant(item)),
  )

  // --- 公告 ---
  function saveAnnouncement(input: Omit<Announcement, 'id' | 'updatedAt'> & { id?: string }): void {
    if (input.id) {
      const target = announcements.value.find((item) => item.id === input.id)
      if (!target) return
      Object.assign(target, input, { updatedAt: nowIso() })
      logAction('內容管理', '公告', `更新公告「${input.title}」`)
    } else {
      announcements.value.unshift({ ...input, id: newId('an'), updatedAt: nowIso() })
      logAction('內容管理', '公告', `新增公告「${input.title}」`)
    }
  }

  function removeAnnouncement(id: string): void {
    const target = announcements.value.find((item) => item.id === id)
    if (!target) return
    announcements.value = announcements.value.filter((item) => item.id !== id)
    logAction('內容管理', '公告', `刪除公告「${target.title}」`)
  }

  // --- FAQ ---
  function saveFaq(input: Omit<FaqEntry, 'id' | 'updatedAt' | 'order'> & { id?: string; order?: number }): void {
    if (input.id) {
      const target = faqs.value.find((item) => item.id === input.id)
      if (!target) return
      Object.assign(target, input, { updatedAt: nowIso() })
      logAction('內容管理', 'FAQ', `更新問答「${input.question}」`)
    } else {
      const maxOrder = faqs.value.reduce((max, item) => Math.max(max, item.order), -1)
      faqs.value.push({ ...input, order: maxOrder + 1, id: newId('faq'), updatedAt: nowIso() })
      logAction('內容管理', 'FAQ', `新增問答「${input.question}」`)
    }
  }

  function removeFaq(id: string): void {
    const target = faqs.value.find((item) => item.id === id)
    if (!target) return
    faqs.value = faqs.value.filter((item) => item.id !== id)
    logAction('內容管理', 'FAQ', `刪除問答「${target.question}」`)
  }

  function moveFaq(id: string, direction: 'up' | 'down'): void {
    move(faqs.value, id, direction)
  }

  // --- 法律文件 ---
  function saveLegalDoc(id: string, title: string, body: string): void {
    const target = legalDocs.value.find((item) => item.id === id)
    if (!target) return
    target.title = title
    target.body = body
    target.version += 1
    target.updatedAt = nowIso()
    logAction('內容管理', '法律文件', `更新「${title}」至 v${target.version}`)
  }

  // --- Banner ---
  function saveBanner(input: Omit<Banner, 'id' | 'updatedAt' | 'order'> & { id?: string; order?: number }): void {
    if (input.id) {
      const target = banners.value.find((item) => item.id === input.id)
      if (!target) return
      Object.assign(target, input, { updatedAt: nowIso() })
      logAction('內容管理', 'Banner', `更新輪播「${input.title}」`)
    } else {
      const maxOrder = banners.value.reduce((max, item) => Math.max(max, item.order), -1)
      banners.value.push({ ...input, order: maxOrder + 1, id: newId('ban'), updatedAt: nowIso() })
      logAction('內容管理', 'Banner', `新增輪播「${input.title}」`)
    }
  }

  function removeBanner(id: string): void {
    const target = banners.value.find((item) => item.id === id)
    if (!target) return
    banners.value = banners.value.filter((item) => item.id !== id)
    logAction('內容管理', 'Banner', `刪除輪播「${target.title}」`)
  }

  function moveBanner(id: string, direction: 'up' | 'down'): void {
    move(banners.value, id, direction)
  }

  return {
    announcements,
    faqs,
    legalDocs,
    banners,
    activeAnnouncements,
    tenantAnnouncements,
    saveAnnouncement,
    removeAnnouncement,
    saveFaq,
    removeFaq,
    moveFaq,
    saveLegalDoc,
    saveBanner,
    removeBanner,
    moveBanner,
  }
}

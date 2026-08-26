import { computed } from 'vue'
import { createAdminCollection } from './admin/useAdminStore'
import { getAuthSession } from './useAuth'
import { announcementDismissKey, isAnnouncementDismissed } from '@/src/utils/announcement'
import type { Announcement } from '@/src/mocks/admin/content'

/**
 * 首頁公告的關閉狀態，依 email 分開存，做法比照 useNotifications.ts 的
 * readAnnouncements：一個 email 對應一份「已關閉的 id+updatedAt」清單。
 * 用 id+updatedAt 當 key 而不是單純 id，是因為管理員改了公告內容後
 * updatedAt 會變，先前關閉過的舊版本不該繼續蓋住新內容。
 */
const dismissedAnnouncements = createAdminCollection<Record<string, string[]>>(
  'dismissed-announcements',
  () => ({}),
)

export function useAnnouncementDismissal() {
  const currentEmail = computed(() => getAuthSession()?.email ?? '')

  const dismissedKeys = computed<string[]>(
    () => dismissedAnnouncements.value[currentEmail.value] ?? [],
  )

  function isDismissed(item: Pick<Announcement, 'id' | 'updatedAt'>): boolean {
    return isAnnouncementDismissed(dismissedKeys.value, item)
  }

  function dismiss(item: Pick<Announcement, 'id' | 'updatedAt'>): void {
    const email = currentEmail.value
    if (!email) return
    const key = announcementDismissKey(item)
    const current = dismissedAnnouncements.value[email] ?? []
    if (current.includes(key)) return
    dismissedAnnouncements.value = {
      ...dismissedAnnouncements.value,
      [email]: [...current, key],
    }
  }

  return { isDismissed, dismiss }
}

import { computed } from 'vue'
import { refreshInbox, useInbox } from './useInbox'
import { announcementDismissKey, isAnnouncementDismissed } from '@/src/utils/announcement'
import type { Announcement } from '@/src/mocks/admin/content'

/**
 * 首頁公告橫幅的關閉狀態，存在後端（見 useInbox），換一台裝置也不會再冒出來。
 * 用 id+updatedAt 當 key 而不是單純 id，是因為管理員改了公告內容後
 * updatedAt 會變，先前關閉過的舊版本不該繼續蓋住新內容。
 */
export function useAnnouncementDismissal() {
  const { state, dismissAnnouncement } = useInbox()
  void refreshInbox()

  const dismissedKeys = computed<string[]>(() => state.value.dismissedAnnouncementKeys)

  function isDismissed(item: Pick<Announcement, 'id' | 'updatedAt'>): boolean {
    return isAnnouncementDismissed(dismissedKeys.value, item)
  }

  function dismiss(item: Pick<Announcement, 'id' | 'updatedAt'>): void {
    dismissAnnouncement(announcementDismissKey(item))
  }

  return { isDismissed, dismiss }
}

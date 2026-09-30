import { computed } from 'vue'
import { usePublicContent } from './usePublicContent'
import { refreshInbox, useInbox } from './useInbox'
import type { AnnouncementLevel, NotifChannel, NotifSourceType } from '@/src/mocks/admin-seed'

export interface InboxItem {
  /** 跨來源唯一，避免公告與通知 id 相撞 */
  key: string
  sourceId: string
  source: 'announcement' | 'notification'
  title: string
  body: string
  category: string
  channels: NotifChannel[]
  createdAt: string
  read: boolean
  /** 僅公告有，用於顯示等級色彩 */
  level?: AnnouncementLevel
  /** 通知來源類型，用於來源 badge */
  sourceType?: NotifSourceType
  /** 操作連結 */
  actionUrl?: string
  /** 操作按鈕文字 */
  actionLabel?: string
}

/**
 * 通知中心的收件匣：公告與站內通知合在一起。
 *
 * 站內通知與已讀狀態都存在後端（見 useInbox），換一台裝置看到的是同一份。
 * 公告是廣播內容、本身沒有收件人，已讀記的是「這個人讀過哪幾則公告」。
 */
export function useNotifications() {
  // 通知中心是租客端的收件匣，只該收到跟租客身分有關的公告（audience 為 tenant 或 all）。
  const { tenantAnnouncements } = usePublicContent()
  const { state, markMessageRead, markAnnouncementRead, markAllRead: markEverythingRead } = useInbox()
  void refreshInbox()

  const announcementItems = computed<InboxItem[]>(() =>
    tenantAnnouncements.value.map((item) => ({
      key: `an:${item.id}`,
      sourceId: item.id,
      source: 'announcement' as const,
      title: item.title,
      body: item.body,
      category: '公告',
      channels: [],
      createdAt: item.startAt,
      read: state.value.readAnnouncementIds.includes(item.id),
      level: item.level,
      sourceType: 'system' as NotifSourceType,
    })),
  )

  const notificationItems = computed<InboxItem[]>(() =>
    state.value.messages.map((item) => ({
      key: `nm:${item.id}`,
      sourceId: item.id,
      source: 'notification' as const,
      title: item.title,
      body: item.body,
      category: item.category,
      channels: item.channels,
      createdAt: item.createdAt,
      read: item.read,
      sourceType: item.sourceType,
      actionUrl: item.actionUrl,
      actionLabel: item.actionLabel,
    })),
  )

  /** 公告與通知合併成單一收件匣，新到舊排序 */
  const inboxItems = computed<InboxItem[]>(() =>
    [...announcementItems.value, ...notificationItems.value].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  )

  const unreadCount = computed(() => inboxItems.value.filter((item) => !item.read).length)

  function markRead(item: InboxItem): void {
    if (item.read) return
    if (item.source === 'announcement') markAnnouncementRead(item.sourceId)
    else markMessageRead(item.sourceId)
  }

  function markAllRead(): void {
    markEverythingRead(announcementItems.value.map((item) => item.sourceId))
  }

  return { inboxItems, unreadCount, markRead, markAllRead }
}

import { computed } from 'vue'
import { notifMessagesCollection } from './admin/useAdminNotifications'
import { createAdminCollection } from './admin/useAdminStore'
import { useAdminContent } from './admin/useAdminContent'
import { getAuthSession } from './useAuth'
import type { AnnouncementLevel, NotifChannel, NotifSourceType } from '@/src/mocks/admin-seed'

/** 公告是廣播內容，本身沒有收件人；已讀狀態改以「email → 已讀公告 id」記錄 */
const readAnnouncements = createAdminCollection<Record<string, string[]>>(
  'read-announcements',
  () => ({}),
)

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

export function useNotifications() {
  // 通知中心是租客端的收件匣，只該收到跟租客身分有關的公告（audience 為 tenant 或 all）。
  const { tenantAnnouncements } = useAdminContent()

  const currentEmail = computed(() => getAuthSession()?.email ?? '')

  const readAnnouncementIds = computed<string[]>(
    () => readAnnouncements.value[currentEmail.value] ?? [],
  )

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
      read: readAnnouncementIds.value.includes(item.id),
      level: item.level,
      sourceType: 'system' as NotifSourceType,
    })),
  )

  const notificationItems = computed<InboxItem[]>(() => {
    if (!currentEmail.value) return []
    return notifMessagesCollection.value
      .filter((item) => item.userEmail === currentEmail.value)
      .map((item) => ({
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
      }))
  })

  /** 公告與通知合併成單一收件匣，新到舊排序 */
  const inboxItems = computed<InboxItem[]>(() =>
    [...announcementItems.value, ...notificationItems.value].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  )

  const unreadCount = computed(() => inboxItems.value.filter((item) => !item.read).length)

  function markAnnouncementRead(id: string): void {
    const email = currentEmail.value
    if (!email) return
    const current = readAnnouncements.value[email] ?? []
    if (current.includes(id)) return
    readAnnouncements.value = {
      ...readAnnouncements.value,
      [email]: [...current, id],
    }
  }

  function markRead(item: InboxItem): void {
    if (item.read) return
    if (item.source === 'announcement') {
      markAnnouncementRead(item.sourceId)
      return
    }
    const target = notifMessagesCollection.value.find((entry) => entry.id === item.sourceId)
    if (target) target.read = true
  }

  function markAllRead(): void {
    for (const item of inboxItems.value) markRead(item)
  }

  return { inboxItems, unreadCount, markRead, markAllRead }
}

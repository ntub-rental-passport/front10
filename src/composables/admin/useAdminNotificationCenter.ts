import { computed } from 'vue'
import { createAdminCollection, newId } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedAdminNotifications,
  type AdminNotifSource,
  type AdminNotification,
} from '@/src/mocks/admin/admin-notifications'

const notifications = createAdminCollection<AdminNotification[]>(
  'admin-notification-center',
  seedAdminNotifications,
)

export function useAdminNotificationCenter() {
  const { logAction } = useAdminAudit()

  const items = computed(() =>
    [...notifications.value].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  )

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)

  function markRead(id: string): void {
    const target = notifications.value.find((n) => n.id === id)
    if (target && !target.read) target.read = true
  }

  /**
   * 標回未讀。
   *
   * 原本點開一則就回不去了 —— 想把它留成待辦就不能點開看內容，
   * 這讓「已讀」變成一個不小心就會踩到的單向操作。
   * 主流的通知中心（Linear、GitHub）都允許切回未讀。
   */
  function markUnread(id: string): void {
    const target = notifications.value.find((n) => n.id === id)
    if (target && target.read) target.read = false
  }

  function markAllRead(): void {
    for (const n of notifications.value) {
      if (!n.read) n.read = true
    }
  }

  function sendNote(title: string, body: string, senderName: string): void {
    notifications.value.unshift({
      id: newId('an'),
      source: 'admin-note',
      title,
      body,
      senderName,
      createdAt: new Date().toISOString(),
      read: false,
    })
    logAction('通知中心', '內部備註', `發送備註「${title}」`)
  }

  function addAlert(
    title: string,
    body: string,
    actionUrl?: string,
    actionLabel?: string,
  ): void {
    notifications.value.unshift({
      id: newId('an'),
      source: 'alert',
      title,
      body,
      actionUrl,
      actionLabel,
      createdAt: new Date().toISOString(),
      read: false,
    })
  }

  return { items, unreadCount, markRead, markUnread, markAllRead, sendNote, addAlert }
}

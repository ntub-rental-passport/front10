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

  return { items, unreadCount, markRead, markAllRead, sendNote, addAlert }
}

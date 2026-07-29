import { computed } from 'vue'
import { notifMessagesCollection } from './admin/useAdminNotifications'
import { getAuthSession } from './useAuth'
import type { UserNotification } from '@/src/mocks/admin-seed'

export function useNotifications() {
  const myNotifications = computed<UserNotification[]>(() => {
    const session = getAuthSession()
    if (!session?.email) return []
    return notifMessagesCollection.value
      .filter((item) => item.userEmail === session.email)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  })

  const unreadCount = computed(() => myNotifications.value.filter((item) => !item.read).length)

  function markRead(id: string): void {
    const target = notifMessagesCollection.value.find((item) => item.id === id)
    if (!target || target.read) return
    target.read = true
  }

  function markAllRead(): void {
    for (const item of myNotifications.value) {
      if (!item.read) item.read = true
    }
  }

  return { myNotifications, unreadCount, markRead, markAllRead }
}

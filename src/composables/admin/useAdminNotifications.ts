import { createAdminCollection, newId } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import { renderTemplate } from '@/src/utils/notif-template'
import {
  seedNotifTemplates,
  seedUserNotifications,
  type NotifTemplate,
  type UserNotification,
} from '@/src/mocks/admin-seed'

const templates = createAdminCollection<NotifTemplate[]>('notif-templates', seedNotifTemplates)
export const notifMessagesCollection = createAdminCollection<UserNotification[]>(
  'notif-messages',
  seedUserNotifications,
)

export type NotifRecipient =
  | { kind: 'role'; role: 'user' | 'landlord' | 'all' }
  | { kind: 'user'; email: string }

function nowIso(): string {
  return new Date().toISOString()
}

export function useAdminNotifications() {
  const { logAction } = useAdminAudit()

  function saveTemplate(
    input: Omit<NotifTemplate, 'id' | 'updatedAt'> & { id?: string },
  ): void {
    if (input.id) {
      const target = templates.value.find((item) => item.id === input.id)
      if (!target) return
      Object.assign(target, input, { updatedAt: nowIso() })
      logAction('通知管理', '模板', `更新模板「${input.name}」`)
    } else {
      templates.value.unshift({ ...input, id: newId('nt'), updatedAt: nowIso() })
      logAction('通知管理', '模板', `新增模板「${input.name}」`)
    }
  }

  function removeTemplate(id: string): void {
    const target = templates.value.find((item) => item.id === id)
    if (!target) return
    templates.value = templates.value.filter((item) => item.id !== id)
    logAction('通知管理', '模板', `刪除模板「${target.name}」`)
  }

  function toggleTemplate(id: string): void {
    const target = templates.value.find((item) => item.id === id)
    if (!target) return
    target.enabled = !target.enabled
    target.updatedAt = nowIso()
    logAction('通知管理', '模板', `${target.enabled ? '啟用' : '停用'}模板「${target.name}」`)
  }

  function resolveRecipients(recipient: NotifRecipient): string[] {
    if (recipient.kind === 'user') return [recipient.email]
    const nonAdmins = adminUsersCollection.value.filter((user) => user.role !== 'admin')
    if (recipient.role === 'all') return nonAdmins.map((user) => user.email)
    return nonAdmins.filter((user) => user.role === recipient.role).map((user) => user.email)
  }

  function sendFromTemplate(
    templateId: string,
    vars: Record<string, string>,
    recipient: NotifRecipient,
  ): number {
    const template = templates.value.find((item) => item.id === templateId)
    if (!template) return 0

    const emails = resolveRecipients(recipient)
    if (emails.length === 0) return 0

    const createdAt = nowIso()
    for (const email of emails) {
      notifMessagesCollection.value.unshift({
        id: newId('nm'),
        userEmail: email,
        title: renderTemplate(template.title, vars),
        body: renderTemplate(template.body, vars),
        category: template.category,
        channels: [...template.channels],
        createdAt,
        read: false,
      })
    }

    logAction('通知管理', template.name, `發送給 ${emails.length} 位使用者`)
    return emails.length
  }

  return {
    templates,
    messages: notifMessagesCollection,
    saveTemplate,
    removeTemplate,
    toggleTemplate,
    sendFromTemplate,
  }
}

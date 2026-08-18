import { createAdminCollection, newId } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import { renderTemplate } from '@/src/utils/notif-template'
import { notifMessagesCollection, sendNotification } from '@/src/services/notificationApi'
import {
  seedNotifTemplates,
  type NotifCategory,
  type NotifChannel,
  type NotifTemplate,
} from '@/src/mocks/admin-seed'

const templates = createAdminCollection<NotifTemplate[]>('notif-templates', seedNotifTemplates)

// 通知中心（useNotifications.ts）沿用這條匯入路徑讀取發送紀錄，
// 實際的集合定義搬到 notificationApi.ts 之後在這裡重新導出，呼叫端不用跟著改路徑。
export { notifMessagesCollection }

export type NotifRecipient =
  | { kind: 'role'; role: 'user' | 'landlord' | 'all' }
  | { kind: 'users'; emails: string[] }

/** 自由撰寫（不套模板）發送時要填的欄位，與模板發送共用同一套收件人／確認流程 */
export interface OneOffNotification {
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
}

const ROLE_LABELS: Record<'user' | 'landlord' | 'all', string> = {
  all: '全部使用者',
  user: '全部租客',
  landlord: '全部房東',
}

/** 一次性撰寫沒有模板名稱可記，固定用這個字串標示來源 */
export const ONE_OFF_SOURCE_LABEL = '一次性撰寫'

/** 發送當下就把收件人條件記進通知，事後光看 email 清單無法還原「當初是選了哪個群組」。 */
export function describeRecipient(recipient: NotifRecipient): string {
  return recipient.kind === 'users' ? '指定使用者' : ROLE_LABELS[recipient.role]
}

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
    if (recipient.kind === 'users') return recipient.emails
    const nonAdmins = adminUsersCollection.value.filter((user) => user.role !== 'admin')
    if (recipient.role === 'all') return nonAdmins.map((user) => user.email)
    return nonAdmins.filter((user) => user.role === recipient.role).map((user) => user.email)
  }

  async function sendFromTemplate(
    templateId: string,
    vars: Record<string, string>,
    recipient: NotifRecipient,
  ): Promise<number> {
    const template = templates.value.find((item) => item.id === templateId)
    if (!template) return 0

    const emails = resolveRecipients(recipient)
    if (emails.length === 0) return 0

    const result = await sendNotification({
      emails,
      title: renderTemplate(template.title, vars),
      body: renderTemplate(template.body, vars),
      category: template.category,
      channels: template.channels,
      recipientLabel: describeRecipient(recipient),
      sourceLabel: template.name,
    })

    logAction('通知管理', template.name, `發送給 ${emails.length} 位使用者`)
    return result.successCount
  }

  /** 自由撰寫發送：不套模板、不新增模板，來源固定記成「一次性撰寫」。 */
  async function sendOneOff(
    notice: OneOffNotification,
    recipient: NotifRecipient,
  ): Promise<number> {
    const emails = resolveRecipients(recipient)
    if (emails.length === 0) return 0

    const result = await sendNotification({
      emails,
      title: notice.title,
      body: notice.body,
      category: notice.category,
      channels: notice.channels,
      recipientLabel: describeRecipient(recipient),
      sourceLabel: ONE_OFF_SOURCE_LABEL,
    })

    logAction('通知管理', ONE_OFF_SOURCE_LABEL, `發送給 ${emails.length} 位使用者`)
    return result.successCount
  }

  return {
    templates,
    messages: notifMessagesCollection,
    saveTemplate,
    removeTemplate,
    toggleTemplate,
    sendFromTemplate,
    sendOneOff,
    resolveRecipients,
  }
}

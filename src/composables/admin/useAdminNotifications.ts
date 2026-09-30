import { ref } from 'vue'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import { notifMessagesCollection, sendNotification } from '@/src/services/notificationApi'
import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  setTemplateEnabled,
  updateTemplate,
  type TemplateInput,
} from '@/src/services/contentApi'
import type { NotifCategory, NotifChannel, NotifTemplate } from '@/src/mocks/admin-seed'

/**
 * 通知模板存在後端（backend/admin/content_service.py），所有管理員看同一份，
 * 稽核由後端記。發送（立即發送、收件匣）目前仍在瀏覽器，見 notificationApi.ts。
 */
const templates = ref<NotifTemplate[]>([])
const templatesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

export async function loadTemplates(): Promise<void> {
  templatesState.value = 'loading'
  const result = await fetchTemplates()
  if (result) {
    templates.value = result
    templatesState.value = 'ready'
  } else {
    templatesState.value = 'error'
  }
}

// 通知中心（useNotifications.ts）沿用這條匯入路徑讀取發送紀錄，
// 實際的集合定義搬到 notificationApi.ts 之後在這裡重新導出，呼叫端不用跟著改路徑。
export { notifMessagesCollection }

export type NotifRecipient =
  | { kind: 'role'; role: 'user' | 'landlord' | 'all' }
  | { kind: 'users'; emails: string[] }

/** 自由撰寫（不套模板）發送時要填的欄位，與模板發送共用同一套收件人／確認流程 */
/**
 * 編輯器組好、可以直接送出的一則通知。
 *
 * 原本這裡是 sendFromTemplate 與 sendOneOff 兩條路：前者從模板重新 render、
 * 後者只收自由撰寫的欄位，而且**兩條都把 actionUrl 丟掉了** —— 結果是
 * 管理員送出的每一則通知都沒有操作按鈕，即使租客端早就會 render 它。
 *
 * 合成一條之後，變數代入由編輯器負責（它本來就要即時預覽），這裡只管送。
 * sourceLabel 記住內容從哪來（模板名稱／一次性撰寫／測試發送）。
 */
export interface ComposedNotification {
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
  actionUrl?: string
  actionLabel?: string
  sourceLabel: string
}

const ROLE_LABELS: Record<'user' | 'landlord' | 'all', string> = {
  all: '全部使用者',
  user: '全部租客',
  landlord: '全部房東',
}

/** 一次性撰寫沒有模板名稱可記，固定用這個字串標示來源 */
export const ONE_OFF_SOURCE_LABEL = '一次性撰寫'

/**
 * 「先寄給我自己」用的來源標籤。
 *
 * 測試發送走的是跟正式發送一模一樣的路徑（真的寫進收件匣、真的產生一個批次），
 * 所以它會出現在發送紀錄裡。不標記的話紀錄會被測試灌滿；完全不寫進紀錄的話，
 * 又會有一筆真實存在的通知查無此事。標記 + 預設濾掉，兩邊都顧到。
 */
export const TEST_SOURCE_LABEL = '測試發送'

/** 發送當下就把收件人條件記進通知，事後光看 email 清單無法還原「當初是選了哪個群組」。 */
export function describeRecipient(recipient: NotifRecipient): string {
  return recipient.kind === 'users' ? '指定使用者' : ROLE_LABELS[recipient.role]
}

export function useAdminNotifications() {
  const { logAction } = useAdminAudit()
  if (templatesState.value === 'idle') void loadTemplates()

  /** 失敗時丟出後端給的理由，畫面原樣顯示 */
  async function saveTemplate(input: TemplateInput & { id?: string }): Promise<void> {
    const { id, ...fields } = input
    if (id) {
      const saved = await updateTemplate(id, fields)
      templates.value = templates.value.map((item) => (item.id === id ? saved : item))
    } else {
      templates.value = [await createTemplate(fields), ...templates.value]
    }
  }

  async function removeTemplate(id: string): Promise<void> {
    await deleteTemplate(id)
    templates.value = templates.value.filter((item) => item.id !== id)
  }

  async function toggleTemplate(id: string): Promise<void> {
    const target = templates.value.find((item) => item.id === id)
    if (!target) return
    const saved = await setTemplateEnabled(id, !target.enabled)
    templates.value = templates.value.map((item) => (item.id === id ? saved : item))
  }

  function resolveRecipients(recipient: NotifRecipient): string[] {
    if (recipient.kind === 'users') return recipient.emails
    const nonAdmins = adminUsersCollection.value.filter((user) => user.role !== 'admin')
    if (recipient.role === 'all') return nonAdmins.map((user) => user.email)
    return nonAdmins.filter((user) => user.role === recipient.role).map((user) => user.email)
  }

  /**
   * 送出一則已經組好的通知。
   *
   * 收件人在這裡才解析成 email —— 編輯器顯示的人數與這裡算的必須是同一套
   * 規則（resolveRecipients），否則畫面說 128 人、實際送給 130 人。
   */
  async function sendComposed(
    message: ComposedNotification,
    recipient: NotifRecipient,
  ): Promise<number> {
    const emails = resolveRecipients(recipient)
    if (emails.length === 0) return 0

    const result = await sendNotification({
      emails,
      title: message.title,
      body: message.body,
      category: message.category,
      channels: message.channels,
      recipientLabel: describeRecipient(recipient),
      sourceLabel: message.sourceLabel,
      actionUrl: message.actionUrl?.trim() || undefined,
      // 有連結才有按鈕文字；只有文字沒有連結的話租客端不會 render 任何東西
      actionLabel: message.actionUrl?.trim() ? message.actionLabel?.trim() || undefined : undefined,
    })

    logAction('通知管理', message.sourceLabel, `發送給 ${emails.length} 位使用者`)
    return result.successCount
  }

  return {
    templates,
    templatesState,
    messages: notifMessagesCollection,
    saveTemplate,
    removeTemplate,
    toggleTemplate,
    sendComposed,
    resolveRecipients,
  }
}

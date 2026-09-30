import { ref } from 'vue'
import {
  fetchAdminMessages,
  sendAdminNotification,
  type NotifRecipient,
} from '@/src/services/inboxApi'
import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  setTemplateEnabled,
  updateTemplate,
  type TemplateInput,
} from '@/src/services/contentApi'
import type { NotifCategory, NotifChannel, NotifTemplate, UserNotification } from '@/src/mocks/admin-seed'

export type { NotifRecipient }

/**
 * 通知模板、立即發送與發送紀錄都在後端（backend/admin/content_service.py、
 * backend/notifications/inbox_service.py），所有管理員看同一份，稽核由後端記。
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

/** 發送紀錄：每位收件人一筆，發送紀錄頁與詳情頁依 batchId 分組成批次 */
const messages = ref<UserNotification[]>([])
const messagesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

export async function loadMessages(): Promise<void> {
  messagesState.value = 'loading'
  const result = await fetchAdminMessages()
  if (result) {
    messages.value = result
    messagesState.value = 'ready'
  } else {
    messagesState.value = 'error'
  }
}

const FOLLOW_UP_MS = 3000
const FOLLOW_UP_LIMIT = 10
let followUpTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Email 由後端在背景寄：發送完馬上讀，看到的是「寄送中」。還有寄送中的就每 3 秒
 * 再讀一次，寄完就停；最多追 10 次，萬一後端卡住也不會一直打下去。
 */
export function followPendingEmails(attempt = 0): void {
  if (followUpTimer) clearTimeout(followUpTimer)
  followUpTimer = null
  const pending = messages.value.some((item) => item.deliveryStatus?.email === 'pending')
  if (!pending || attempt >= FOLLOW_UP_LIMIT) return
  followUpTimer = setTimeout(() => {
    void loadMessages().then(() => followPendingEmails(attempt + 1))
  }, FOLLOW_UP_MS)
}

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
  if (templatesState.value === 'idle') void loadTemplates()
  if (messagesState.value === 'idle') void loadMessages()

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

  /**
   * 送出一則已經組好的通知，回傳實際送給幾人。
   *
   * 收件人由後端從真實帳號解析（跟排程同一套規則），編輯器上的人數用的是
   * 同一份帳號清單（GET /api/admin/users）算出來的，兩邊才會一致。
   */
  async function sendComposed(
    message: ComposedNotification,
    recipient: NotifRecipient,
  ): Promise<number> {
    const result = await sendAdminNotification({
      recipient,
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

    void loadMessages().then(() => followPendingEmails())
    return result.recipientCount
  }

  return {
    templates,
    templatesState,
    messages,
    messagesState,
    saveTemplate,
    removeTemplate,
    toggleTemplate,
    sendComposed,
  }
}

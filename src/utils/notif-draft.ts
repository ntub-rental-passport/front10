/**
 * 編輯器草稿。
 *
 * 發送通知從對話框改成整頁之後，「離開」變得比以前容易 —— 側欄就在旁邊，
 * 點一下就走了，而對話框至少要按 Esc 或點外面。加上瀏覽器分頁本來就可能
 * 被關掉，所以編輯到一半的內容要留下來。
 *
 * 刻意不做「確定要離開嗎」的攔截框：那個框在你自己按下「發送」導走時
 * 也會跳出來（要額外排除），而且它救不了「整個分頁被關掉」。
 * 存草稿單獨就夠，而且安靜得多。
 */

export interface ComposeDraft {
  templateId: string
  title: string
  body: string
  category: string
  channels: string[]
  actionUrl: string
  actionLabel: string
  recipientKind: string
  recipientEmails: string[]
  when: 'now' | 'schedule'
  scheduledAt: string
  vars: Record<string, string>
  savedAt: string
}

export const DRAFT_KEY = 'rentmate-admin-notif-draft'

/**
 * 這份草稿有沒有東西值得留。
 *
 * 只看「管理員真的打了字」的欄位。分類、管道、預定時間都有預設值，
 * 把它們算進來的話，光是打開編輯器再離開就會存下一份草稿，
 * 於是每次進來都看到「已回復上次未送出的內容」——那個提示就沒意義了。
 */
export function isEmptyDraft(draft: Partial<ComposeDraft> | null | undefined): boolean {
  if (!draft) return true
  const typed = [draft.title, draft.body, draft.actionUrl, draft.actionLabel, draft.templateId]
  if (typed.some((value) => (value ?? '').trim() !== '')) return false
  if ((draft.recipientEmails ?? []).length > 0) return false
  return Object.values(draft.vars ?? {}).every((value) => value.trim() === '')
}

/**
 * localStorage 在無痕視窗、停用 cookie、或空間滿了的時候會丟例外。
 * 草稿是方便功能，讀不到就當作沒有 —— 絕對不能讓它把整頁炸掉。
 */
export function readDraft(storage: Storage | undefined = safeStorage()): ComposeDraft | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ComposeDraft>
    if (typeof parsed !== 'object' || parsed === null) return null
    if (isEmptyDraft(parsed)) return null
    return normalize(parsed)
  } catch {
    return null
  }
}

export function writeDraft(
  draft: Partial<ComposeDraft>,
  storage: Storage | undefined = safeStorage(),
): void {
  if (!storage) return
  try {
    if (isEmptyDraft(draft)) {
      storage.removeItem(DRAFT_KEY)
      return
    }
    storage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }))
  } catch {
    // 存不下去就算了，不要打斷管理員正在做的事
  }
}

export function clearDraft(storage: Storage | undefined = safeStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(DRAFT_KEY)
  } catch {
    /* 同上 */
  }
}

/** 舊版草稿可能缺欄位；缺的補成空值，不要讓 undefined 流進 v-model。 */
function normalize(raw: Partial<ComposeDraft>): ComposeDraft {
  return {
    templateId: raw.templateId ?? '',
    title: raw.title ?? '',
    body: raw.body ?? '',
    category: raw.category ?? '系統',
    channels: Array.isArray(raw.channels) ? raw.channels : [],
    actionUrl: raw.actionUrl ?? '',
    actionLabel: raw.actionLabel ?? '',
    recipientKind: raw.recipientKind ?? 'all',
    recipientEmails: Array.isArray(raw.recipientEmails) ? raw.recipientEmails : [],
    when: raw.when === 'schedule' ? 'schedule' : 'now',
    scheduledAt: raw.scheduledAt ?? '',
    vars: typeof raw.vars === 'object' && raw.vars !== null ? raw.vars : {},
    savedAt: raw.savedAt ?? '',
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

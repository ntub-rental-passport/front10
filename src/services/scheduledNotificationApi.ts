/**
 * 後台排程通知的 API。
 *
 * 這是整個通知功能裡**唯一真的打後端**的部分。立即發送仍然寫 localStorage
 * （見 notificationApi.ts），但排程不行 —— 排程的重點就是「沒人開著瀏覽器
 * 的時候也要送出去」，那件事只有後端做得到。
 *
 * 後端：backend/scheduled_notification_service.py（SQLite 佇列 + 每 20 秒
 * 醒來的 dispatcher），端點在 backend/routers/scheduled_notifications.py。
 */
import { getAuthSession } from '@/src/composables/useAuth'
import type { ScheduledNotif } from '@/src/utils/notif-schedule'

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL
const ENDPOINT = `${API_BASE_URL}/admin/scheduled-notifications`

export interface ScheduleCapabilities {
  email: boolean
  inapp: boolean
  push: boolean
  unsupportedReason: Record<string, string>
}

export interface ScheduleListing {
  items: ScheduledNotif[]
  capabilities: ScheduleCapabilities
}

export interface CreateScheduleInput {
  title: string
  body: string
  category: string
  channels: string[]
  recipient: { kind: 'role'; role: string } | { kind: 'users'; emails: string[] }
  recipientLabel: string
  sourceLabel: string
  /** 帶時區偏移量的 ISO 字串，用 fromDateTimeLocal() 產生 */
  scheduledAt: string
}

function authHeaders(): Record<string, string> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入狀態已失效，請重新登入後再試。')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/**
 * 後端用 400/409 的 detail 說明為什麼不行（時間在過去、管道送不出去、
 * 已經在送了…）。這些訊息是寫給管理員看的，必須原樣帶到畫面上 ——
 * 吞掉換成「操作失敗」等於要他自己猜。
 */
async function failureOf(response: Response): Promise<Error> {
  let detail = ''
  try {
    detail = ((await response.json()) as { detail?: string }).detail ?? ''
  } catch {
    detail = ''
  }
  if (response.status === 401 || response.status === 403) {
    return new Error('沒有權限或登入已失效，請重新登入。')
  }
  return new Error(detail || `操作失敗（HTTP ${response.status}）。`)
}

/**
 * 讀不到就回 null（後端掛了、token 過期、權限被撤銷），由呼叫端決定畫面
 * 怎麼呈現 —— 這裡不回空陣列，那會讓「連不上後端」看起來像「沒有排程」。
 */
export async function listScheduled(signal?: AbortSignal): Promise<ScheduleListing | null> {
  const token = getAuthSession()?.accessToken
  if (!token) return null
  try {
    const response = await fetch(ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    return (await response.json()) as ScheduleListing
  } catch {
    return null
  }
}

export async function createScheduled(input: CreateScheduleInput): Promise<ScheduledNotif> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await failureOf(response)
  return (await response.json()) as ScheduledNotif
}

export async function cancelScheduled(id: string): Promise<ScheduledNotif> {
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) throw await failureOf(response)
  return (await response.json()) as ScheduledNotif
}

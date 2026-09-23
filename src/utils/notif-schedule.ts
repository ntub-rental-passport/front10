import type { StatusDotTone } from '@/src/components/admin/status-dot'

/**
 * 排程通知的畫面邏輯。
 *
 * 狀態機在**後端**（backend/scheduled_notification_service.py），這裡只負責
 * 把後端回來的狀態翻成畫面語言。前端不自己推算「時間到了沒」——
 * 真正決定送不送的是後端那個每 20 秒醒來的迴圈，前端再算一次只會出現
 * 「畫面說已到時間、實際上還沒送」這種兩套說法。
 */

export type ScheduleStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'missed' | 'cancelled'

export interface ScheduleResult {
  email?: { sent: number; failed: number }
}

export interface ScheduledNotif {
  id: string
  createdBy: string
  title: string
  body: string
  category: string
  channels: string[]
  recipient: { kind: 'role'; role: string } | { kind: 'users'; count: number }
  recipientLabel: string
  sourceLabel: string
  scheduledAt: string
  createdAt: string
  status: ScheduleStatus
  sentAt: string | null
  result: ScheduleResult | null
}

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  pending: '待送出',
  sending: '傳送中',
  sent: '已送出',
  failed: '送出失敗',
  missed: '未送出',
  cancelled: '已取消',
}

/**
 * missed 需要解釋，不然管理員只會看到一個沒頭沒尾的「未送出」。
 * 其他狀態字面上就講完了，多寫一句反而是雜訊。
 */
export const SCHEDULE_STATUS_HINT: Partial<Record<ScheduleStatus, string>> = {
  missed: '後端在預定時間之後停機超過 30 分鐘，這則通知沒有送出，也不會補送 —— 過期太久的公告晚寄比不寄更糟。',
  failed: '所有收件者都寄送失敗。可以查後端記錄找原因，這則不會自動重試。',
  sending: '正在寄送中。這個狀態停留超過幾分鐘通常代表寄送過程被中斷。',
}

/**
 * warn／danger 在這個後台一律代表「你必須動手」。
 * pending 是排程正常等著，管理員什麼都不用做，所以是 idle 不是 warn。
 */
export const SCHEDULE_STATUS_TONE: Record<ScheduleStatus, StatusDotTone> = {
  pending: 'idle',
  sending: 'warn',
  sent: 'ok',
  failed: 'danger',
  missed: 'danger',
  cancelled: 'idle',
}

/** 只有還沒開始送的能取消。已進入 sending 就不給取消 —— SMTP 可能正在進行中。 */
export function canCancel(status: ScheduleStatus): boolean {
  return status === 'pending'
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * 「還有多久」。只到「天」為止，不寫成「3 天 4 小時 12 分」——
 * 管理員要的是輕重緩急，多一位精度不會改變他的決定，卻讓整欄難掃。
 */
export function scheduleLeadText(scheduledAt: string, now: Date): string {
  const diff = new Date(scheduledAt).getTime() - now.getTime()
  const abs = Math.abs(diff)
  if (abs < MINUTE) return diff >= 0 ? '即將送出' : '剛過時間'
  const unit =
    abs < HOUR
      ? `${Math.floor(abs / MINUTE)} 分鐘`
      : abs < DAY
        ? `${Math.floor(abs / HOUR)} 小時`
        : `${Math.floor(abs / DAY)} 天`
  return diff >= 0 ? `${unit}後` : `${unit}前`
}

/**
 * 寄送結果。沒有結果就回空字串，由呼叫端決定要不要留位置 ——
 * 這裡不編「0 人」，那會讓「還沒送」看起來像「送了但沒人收到」。
 */
export function scheduleResultText(item: ScheduledNotif): string {
  const email = item.result?.email
  if (!email) return ''
  if (email.failed === 0) return `${email.sent} 人已寄出`
  if (email.sent === 0) return `${email.failed} 人全部失敗`
  return `${email.sent} 人已寄出・${email.failed} 人失敗`
}

/**
 * 排程時間的最小值：後端要求必須在現在之後，前端也先擋一次，
 * 免得管理員填完整張表才被退回。給 1 分鐘緩衝，避免填寫過程中時間就過了。
 */
export function minScheduleValue(now: Date): string {
  return toDateTimeLocal(new Date(now.getTime() + MINUTE))
}

export function maxScheduleValue(now: Date): string {
  return toDateTimeLocal(new Date(now.getTime() + 365 * DAY))
}

/** `<input type="datetime-local">` 要的是不帶時區的本地時間字串。 */
export function toDateTimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * datetime-local 的值沒有時區，直接丟給後端會被當成 UTC 而差八小時。
 * 轉成帶偏移量的 ISO 字串再送。
 */
export function fromDateTimeLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('排程時間格式不正確。')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  return `${toDateTimeLocal(date)}:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`
}

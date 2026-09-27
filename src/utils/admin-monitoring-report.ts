/**
 * 系統監控頁「後端回報」的部分：背景工作佇列、外部服務設定、總結列、事件紀錄。
 * 純邏輯，不依賴 Vue。資料來源是 backend/monitoring_service.py。
 *
 * 跟 admin-monitoring.ts 的分工：那邊是「一個監控項現在健不健康」，
 * 這邊是「整頁加起來要跟管理員說什麼」。
 */

import type { StatusDotTone } from '@/src/components/admin/status-dot'
import {
  MONITOR_STATE_TONE,
  formatDuration,
  formatPairedTime,
  formatShortDateTime,
  parseIsoTime,
  type MonitorReading,
} from './admin-monitoring'

/* -------------------- 後端回傳的形狀 -------------------- */

export interface QueueSnapshot {
  pending: number
  /** 到期超過 2 分鐘還是待送：派送迴圈沒在處理 */
  overdue: number
  /** 卡在寄送中超過 5 分鐘：寄送過程被中斷 */
  stuck: number
  failed7d: number
  missed7d: number
  /** 最近一次失敗或錯過的預定時間 */
  lastIssueAt: string | null
  nextDue: string | null
}

export interface QueuesSnapshot {
  scheduledNotifications: QueueSnapshot
  garbageReminders: QueueSnapshot
}

export interface ConfigItem {
  key: string
  label: string
  ok: boolean
  hint: string
}

export interface MonitorSummary {
  /** 目前掛著的服務數 */
  down: number
  /** 過去 24 小時的異常次數（恢復不另算一次） */
  events24h: number
  lastHeartbeat: string | null
  serverTime: string | null
}

export type MonitorEventKind =
  | 'down'
  | 'recovered'
  | 'backend-downtime'
  | 'server-error'
  | 'notification-missed'
  | 'notification-failed'

export interface MonitorEvent {
  id: number
  at: string
  service: string
  serviceLabel: string
  kind: MonitorEventKind
  detail: string | null
  durationSeconds: number | null
}

/* -------------------- 背景工作佇列 -------------------- */

/**
 * 失敗或錯過發生在這段時間內才亮警示。
 *
 * 後端給的是 7 天內的次數。拿它直接判斷的話，一次寄送失敗會讓這張卡黃一整週，
 * 管理員點進來發現早就處理過、無事可做 —— 幾次之後就不會再看這個顏色了。
 * 7 天的數字照樣顯示，只是不再催人。
 */
export const RECENT_ISSUE_MS = 24 * 3600_000

export interface QueueView {
  tone: StatusDotTone
  statusLabel: string
  /** 需要立刻處理的狀況，一句一個 */
  alerts: string[]
}

export function queueView(queue: QueueSnapshot, now: Date): QueueView {
  const alerts: string[] = []
  if (queue.overdue > 0) {
    alerts.push(`${queue.overdue} 筆到期超過 2 分鐘還沒送出：派送迴圈可能停了，請查看後端 log。`)
  }
  if (queue.stuck > 0) {
    alerts.push(`${queue.stuck} 筆卡在「寄送中」超過 5 分鐘：寄送過程可能被中斷，這些不會自動重送。`)
  }

  if (queue.overdue > 0) return { tone: 'danger', statusLabel: `${queue.overdue} 筆逾時未送`, alerts }
  if (queue.stuck > 0) return { tone: 'danger', statusLabel: `${queue.stuck} 筆卡住`, alerts }

  const lastIssue = parseIsoTime(queue.lastIssueAt)
  if (lastIssue !== null && now.getTime() - lastIssue < RECENT_ISSUE_MS) {
    return { tone: 'warn', statusLabel: '24 小時內有失敗或錯過', alerts }
  }
  return { tone: 'ok', statusLabel: '正常', alerts }
}

/* -------------------- 心跳 -------------------- */

/** 心跳每 20 秒一次。超過這麼久沒更新，就是背景迴圈停了（或整個後端卡住）。 */
export const HEARTBEAT_STALE_MS = 2 * 60_000

/**
 * 背景檢查是不是停了。
 *
 * 用後端給的 serverTime 比，不用瀏覽器的時鐘 —— 管理員的筆電快個幾分鐘，
 * 正常的心跳就會被當成停了。
 */
export function isHeartbeatStale(summary: MonitorSummary): boolean {
  const beat = parseIsoTime(summary.lastHeartbeat)
  const server = parseIsoTime(summary.serverTime)
  if (beat === null || server === null) return true
  return server - beat > HEARTBEAT_STALE_MS
}

/* -------------------- 總結列 -------------------- */

export interface AttentionItem {
  label: string
  tone: 'warn' | 'danger'
}

function isAlarming(tone: StatusDotTone): tone is 'warn' | 'danger' {
  return tone === 'warn' || tone === 'danger'
}

/**
 * 整頁有哪些事要管理員處理。
 *
 * 只收 warn／danger —— 這個後台的 warn／danger 意思是「你必須動手」。
 * 「未設定」「資料過期」這類 idle 的監控項不算：沒設定的服務會在「外部服務設定」
 * 那裡以缺少的設定出現一次，不會在這裡被數兩次。
 */
export function collectAttention(input: {
  readings: MonitorReading[]
  queues: { label: string; view: QueueView }[]
  config: ConfigItem[] | null
  heartbeatStale: boolean
  /** 目前被維護關閉的功能 */
  closedFeatures: string[]
}): AttentionItem[] {
  const items: AttentionItem[] = []
  if (input.heartbeatStale) items.push({ label: '背景檢查', tone: 'danger' })
  for (const reading of input.readings) {
    const tone = MONITOR_STATE_TONE[reading.state]
    if (isAlarming(tone)) items.push({ label: reading.label, tone })
  }
  for (const queue of input.queues) {
    if (isAlarming(queue.view.tone)) items.push({ label: queue.label, tone: queue.view.tone })
  }
  for (const item of input.config ?? []) {
    if (!item.ok) items.push({ label: item.label, tone: 'warn' })
  }
  for (const name of input.closedFeatures) items.push({ label: `${name}（維護中）`, tone: 'warn' })

  // 紅的排前面：總結列只列得下前幾項
  return items.sort((a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'))
}

export interface MonitorOverview {
  tone: StatusDotTone
  title: string
  detail: string
}

/** 總結列最多點名幾項，再多就「等 N 項」 */
const NAMED_LIMIT = 3

export function monitorOverview(input: {
  /** 第一輪量測還沒回來 */
  loading: boolean
  backendDown: boolean
  metricsAvailable: boolean
  attention: AttentionItem[]
}): MonitorOverview {
  if (input.loading) return { tone: 'idle', title: '量測中', detail: '' }

  if (!input.metricsAvailable) {
    return input.backendDown
      ? { tone: 'danger', title: '後端沒有回應', detail: '其他項目都要等後端恢復才讀得到。' }
      : {
          tone: 'warn',
          title: '讀不到監控數據',
          detail: '後端有回應，但監控數據讀取失敗。登入可能已經過期，重新整理或重新登入後再試。',
        }
  }

  const count = input.attention.length
  if (count === 0) return { tone: 'ok', title: '全部正常', detail: '' }

  const names = input.attention.map((item) => item.label)
  const named = names.slice(0, NAMED_LIMIT).join('、')
  return {
    tone: input.attention.some((item) => item.tone === 'danger') ? 'danger' : 'warn',
    title: `${count} 項需要注意`,
    detail: count > NAMED_LIMIT ? `${named} 等 ${count} 項` : named,
  }
}

/* -------------------- 事件紀錄 -------------------- */

export type EventCategory = 'outage' | 'server-error' | 'notification' | 'other'

export interface EventRow {
  key: string
  kind: MonitorEventKind
  service: string
  category: EventCategory
  title: string
  detail: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  /** 斷線到現在還沒恢復 */
  ongoing: boolean
  /** 連續發生的同一個伺服器錯誤合併成一列，這是合併了幾次 */
  count: number
  /** 合併後最早那一次 */
  firstAt: string
}

const CATEGORY_BY_KIND: Record<MonitorEventKind, EventCategory> = {
  down: 'outage',
  recovered: 'outage',
  'backend-downtime': 'outage',
  'server-error': 'server-error',
  'notification-missed': 'notification',
  'notification-failed': 'notification',
}

export const BACKEND_DOWNTIME_DETAIL = '這段期間後端沒有在執行：可能是重新部署、當機或主機休眠。'

function toIso(time: number): string {
  return new Date(time).toISOString()
}

function titleOf(event: MonitorEvent): string {
  switch (event.kind) {
    case 'down':
    case 'recovered':
      return `${event.serviceLabel}斷線`
    case 'backend-downtime':
      return '後端停機'
    case 'server-error':
      return '伺服器錯誤'
    case 'notification-missed':
      return '排程通知錯過'
    case 'notification-failed':
      return '排程通知寄送失敗'
    default:
      return `${event.serviceLabel}事件`
  }
}

function rowOf(event: MonitorEvent): EventRow {
  return {
    key: String(event.id),
    kind: event.kind,
    service: event.service,
    category: CATEGORY_BY_KIND[event.kind] ?? 'other',
    title: titleOf(event),
    detail: event.detail,
    startedAt: event.at,
    endedAt: null,
    durationSeconds: null,
    ongoing: false,
    count: 1,
    firstAt: event.at,
  }
}

/**
 * 後端記的是「狀態轉換」：斷線一筆、恢復一筆。直接照列，同一次斷線會變成
 * 相隔很遠的兩列，管理員得自己配對才知道停了多久。這裡把它們合成一列
 * 「什麼時候斷、為什麼、多久、什麼時候恢復」。
 *
 * 輸入是 API 的順序（新到舊），輸出也是新到舊，以開始時間排序。
 */
export function buildEventRows(events: MonitorEvent[]): EventRow[] {
  const chronological = [...events].sort(
    (a, b) => (parseIsoTime(a.at) ?? 0) - (parseIsoTime(b.at) ?? 0) || a.id - b.id,
  )
  const rows: EventRow[] = []
  const open = new Map<string, EventRow>()

  for (const event of chronological) {
    const at = parseIsoTime(event.at)
    if (at === null) continue

    if (event.kind === 'down') {
      // 同一個服務連續兩筆斷線（中間的恢復不見了）：前一筆的結束時間不知道，
      // 不能讓它永遠掛著「尚未恢復」
      const previous = open.get(event.service)
      if (previous) previous.ongoing = false
      const row = { ...rowOf(event), ongoing: true }
      open.set(event.service, row)
      rows.push(row)
      continue
    }

    if (event.kind === 'recovered') {
      const row = open.get(event.service)
      const start = row ? parseIsoTime(row.startedAt) : null
      const duration = event.durationSeconds ?? (start === null ? null : (at - start) / 1000)
      if (row) {
        row.endedAt = event.at
        row.durationSeconds = duration
        row.ongoing = false
        open.delete(event.service)
      } else {
        // 斷線那一筆已經超過保留期限被清掉（或超出這次載入的筆數）。
        // 恢復時有記下停了多久，用它推回起點；原因就真的不知道了。
        const startedAt = duration === null ? event.at : toIso(at - duration * 1000)
        rows.push({
          ...rowOf(event),
          kind: 'down',
          detail: null,
          startedAt,
          firstAt: startedAt,
          endedAt: event.at,
          durationSeconds: duration,
        })
      }
      continue
    }

    if (event.kind === 'backend-downtime') {
      const duration = event.durationSeconds
      rows.push({
        ...rowOf(event),
        detail: BACKEND_DOWNTIME_DETAIL,
        endedAt: duration === null ? null : toIso(at + duration * 1000),
        durationSeconds: duration,
      })
      continue
    }

    rows.push(rowOf(event))
  }

  rows.sort((a, b) => (parseIsoTime(b.startedAt) ?? 0) - (parseIsoTime(a.startedAt) ?? 0))
  return collapseRepeatedServerErrors(rows)
}

/**
 * 同一支 API 壞掉，每個使用者按一次就是一筆 5xx。一列一筆的話，一次故障
 * 能把整頁洗掉，真正的斷線紀錄反而被擠到看不到的地方。相鄰、完全相同的
 * 伺服器錯誤合成一列並標次數。
 */
function collapseRepeatedServerErrors(rows: EventRow[]): EventRow[] {
  const result: EventRow[] = []
  for (const row of rows) {
    const last = result[result.length - 1]
    if (last && row.kind === 'server-error' && last.kind === 'server-error' && last.detail === row.detail) {
      last.count += 1
      last.firstAt = row.startedAt // 新到舊，後面的比較早
      continue
    }
    result.push(row)
  }
  return result
}

export interface EventTiming {
  /** 右欄主文字：持續多久、幾次 */
  main: string
  /** 右欄小字：什麼時候恢復、最早一次 */
  sub: string | null
}

export function eventTiming(row: EventRow, now: Date): EventTiming {
  if (row.ongoing) {
    const start = parseIsoTime(row.startedAt)
    return { main: start === null ? '' : `已 ${formatDuration((now.getTime() - start) / 1000)}`, sub: null }
  }
  if (row.count > 1) {
    return { main: `${row.count} 次`, sub: `最早 ${formatPairedTime(row.startedAt, row.firstAt)}` }
  }
  if (row.durationSeconds !== null) {
    // 後端停機的起點是「最後一次確認還活著」，實際停機可能晚一點開始，所以是「約」
    const prefix = row.kind === 'backend-downtime' ? '約 ' : ''
    return {
      main: `${prefix}${formatDuration(row.durationSeconds)}`,
      sub: row.endedAt ? `${formatPairedTime(row.startedAt, row.endedAt)} 恢復` : null,
    }
  }
  return { main: '', sub: null }
}

export type EventFilter = 'all' | Exclude<EventCategory, 'other'>

export const EVENT_FILTERS: { value: EventFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'outage', label: '斷線與停機' },
  { value: 'server-error', label: '伺服器錯誤' },
  { value: 'notification', label: '排程通知' },
]

export function filterEventRows(rows: EventRow[], filter: EventFilter): EventRow[] {
  return filter === 'all' ? rows : rows.filter((row) => row.category === filter)
}

/**
 * 某個服務上一次斷線的一句話，給監控卡用（服務正常時才顯示 ——
 * 正在斷線的時候，卡片要講的是這一次，不是上一次）。
 *
 * 只挑已經恢復的：還沒恢復的那一次，卡片本身就已經是紅的了。
 */
export function lastOutageNote(rows: EventRow[], service: string): string | null {
  const row = rows.find((item) => item.service === service && item.kind === 'down' && !item.ongoing)
  if (!row) return null
  const duration = row.durationSeconds === null ? '' : `，持續 ${formatDuration(row.durationSeconds)}`
  return `上次斷線：${formatShortDateTime(row.startedAt)}${duration}`
}

/** AI 模型卡上的備援說明。桌機一睡，有沒有備援決定了分析是變慢還是直接失敗。 */
export function nvidiaBackupNote(config: ConfigItem[] | null): string | null {
  const item = config?.find((entry) => entry.key === 'nvidia')
  if (!item) return null
  return item.ok ? 'NVIDIA 備援已設定：桌機連不上時會改用它' : 'NVIDIA 備援未設定：桌機連不上時，分析會直接失敗'
}

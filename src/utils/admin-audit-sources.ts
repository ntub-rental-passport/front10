/**
 * 稽核紀錄的三個來源合成一張表。純邏輯，不依賴 Vue。
 *
 * - **後端操作紀錄**（backend/audit_service.py）：停用／啟用真實帳號、排程通知
 *   與它的結果、管理員登入。所有管理員看到同一份，後端不自動刪除。
 * - **後端監控事件**：斷線、恢復、後端停機。只留 30 天（monitoring_service.py）。
 * - **這台瀏覽器**（useAdminAudit）：只在本地開發疊加展示模組的操作與種子紀錄，
 *   正式站不納入；種子從來沒發生過，內部來源標為 demo。
 */

import {
  SEED_AUDIT_EVENT_IDS,
  type AuditActionType,
  type AuditEvent,
} from '@/src/mocks/admin-seed'
import type { ServerAuditEvent } from '@/src/services/adminAuditApi'
import { formatDuration, formatShortDateTime, parseIsoTime } from './admin-monitoring'
import type { MonitorEvent } from './admin-monitoring-report'

export type AuditSource = 'server' | 'local' | 'demo'

/**
 * 匯出 CSV 的「來源」欄。
 *
 * 種子資料跟 logAction 寫的一樣存在瀏覽器裡，所以也標「本機」——
 * 本地開發的畫面與匯出都不另外標示展示資料；正式站只有後端來源。
 */
export const AUDIT_SOURCE_LABELS: Record<AuditSource, string> = {
  server: '後端',
  local: '本機',
  demo: '本機',
}

export interface AuditRow extends AuditEvent {
  source: AuditSource
}

/** 後端與種子資料用的「系統」操作者 */
export const SYSTEM_ACTOR = 'system'

export function actorLabel(actor: string): string {
  return actor === SYSTEM_ACTOR ? '系統' : actor
}

/**
 * 稽核紀錄要的監控事件：只有斷線類。
 *
 * 排程通知的失敗、錯過不從這裡拿：它們由後端操作紀錄記，跟「誰排的、誰取消的」
 * 放在一起，而且不會像監控事件一樣 30 天後消失。5xx 也不收，逐筆請求的雜訊
 * 會把管理員的操作洗掉 —— 那些留在系統監控頁。
 */
export const AUDIT_MONITOR_KINDS: MonitorEvent['kind'][] = ['down', 'recovered', 'backend-downtime']

const DOWNTIME_CAUSES = '重新部署、當機或主機休眠'

export function fromServerEvent(event: ServerAuditEvent): AuditRow {
  return {
    id: `srv-${event.id}`,
    at: event.at,
    actor: event.actor,
    action: event.action as AuditActionType,
    target: event.target,
    // IP 併進詳情：搜尋框本來就搜詳情，用 IP 也找得到
    detail: event.ip ? `${event.detail}（IP ${event.ip}）` : event.detail,
    source: 'server',
  }
}

/** 監控事件 → 稽核列。斷線與恢復各自一列：稽核紀錄是流水帳，每一列是一個時間點 */
export function fromMonitorEvent(event: MonitorEvent): AuditRow | null {
  const base = {
    id: `mon-${event.id}`,
    at: event.at,
    actor: SYSTEM_ACTOR,
    action: '服務狀態' as const,
    source: 'server' as const,
  }
  switch (event.kind) {
    case 'down':
      return { ...base, target: event.serviceLabel, detail: `斷線：${event.detail ?? '連不上'}` }
    case 'recovered':
      return {
        ...base,
        target: event.serviceLabel,
        detail:
          event.durationSeconds === null ? '恢復' : `恢復，斷線 ${formatDuration(event.durationSeconds)}`,
      }
    case 'backend-downtime': {
      // 這一筆的時間是「最後一次確認還活著」，恢復時間由時長推出
      const start = parseIsoTime(event.at)
      const duration = event.durationSeconds
      if (start === null || duration === null) {
        return { ...base, target: '後端', detail: `停機（${DOWNTIME_CAUSES}）` }
      }
      const recoveredAt = new Date(start + duration * 1000).toISOString()
      return {
        ...base,
        target: '後端',
        detail: `停機約 ${formatDuration(duration)}，${formatShortDateTime(recoveredAt)} 恢復（${DOWNTIME_CAUSES}）`,
      }
    }
    default:
      return null
  }
}

export function fromLocalEvent(event: AuditEvent): AuditRow {
  return { ...event, source: SEED_AUDIT_EVENT_IDS.has(event.id) ? 'demo' : 'local' }
}

/** 新到舊 */
export function mergeAuditRows(...groups: AuditRow[][]): AuditRow[] {
  return groups
    .flat()
    .sort((a, b) => (parseIsoTime(b.at) ?? 0) - (parseIsoTime(a.at) ?? 0))
}

/* -------------------- 篩選 -------------------- */

export interface AuditFilter {
  keyword: string
  action: 'all' | AuditActionType
  /** `YYYY-MM-DD`，本地日期 */
  fromDate: string
  toDate: string
}

export function emptyAuditFilter(): AuditFilter {
  return { keyword: '', action: 'all', fromDate: '', toDate: '' }
}

export function isAuditFilterActive(filter: AuditFilter): boolean {
  return (
    filter.keyword.trim() !== '' || filter.action !== 'all' || filter.fromDate !== '' || filter.toDate !== ''
  )
}

/**
 * 日期用數值比，不用字串比：後端的時間是 `+00:00` 結尾、可能帶微秒，
 * 瀏覽器的是 `Z` 結尾 —— 兩種格式的字串排序不可靠。
 */
export function filterAuditRows(rows: AuditRow[], filter: AuditFilter): AuditRow[] {
  const text = filter.keyword.trim().toLowerCase()
  const from = filter.fromDate ? new Date(`${filter.fromDate}T00:00:00`).getTime() : null
  const to = filter.toDate ? new Date(`${filter.toDate}T23:59:59.999`).getTime() : null

  return rows.filter((row) => {
    if (filter.action !== 'all' && row.action !== filter.action) return false
    // 「系統」是顯示出來的字，搜它也要找得到
    if (text && !`${actorLabel(row.actor)} ${row.actor} ${row.target} ${row.detail}`.toLowerCase().includes(text)) {
      return false
    }
    const at = parseIsoTime(row.at)
    if (at !== null && from !== null && at < from) return false
    if (at !== null && to !== null && at > to) return false
    return true
  })
}

/* -------------------- 使用者詳情頁：最近一次停用 -------------------- */

type StatusEntry = Pick<AuditEvent, 'at' | 'actor' | 'detail'> & { action: string }

/**
 * 最近一次停用／啟用如果是停用，回傳那一筆。
 *
 * 只挑最近一次「狀態變更」再看它是不是停用：停用 → 啟用 → 又停用的人，
 * 要顯示的是最後那次停用的原因；已經被啟用的人不該再掛著舊的停用原因。
 */
export function latestSuspension<T extends StatusEntry>(entries: T[]): T | null {
  let latest: T | null = null
  let latestAt = -Infinity
  for (const entry of entries) {
    if (entry.action !== '使用者管理') continue
    if (!entry.detail.startsWith('停用帳號') && !entry.detail.startsWith('啟用帳號')) continue
    const at = parseIsoTime(entry.at) ?? -Infinity
    if (at > latestAt) {
      latest = entry
      latestAt = at
    }
  }
  return latest && latest.detail.startsWith('停用帳號') ? latest : null
}

/** 「停用帳號：多次發布不當內容（admin@rentmate.tw，9/27 16:02）」 */
export function suspensionNote(entry: StatusEntry): string {
  return `${entry.detail}（${actorLabel(entry.actor)}，${formatShortDateTime(entry.at)}）`
}

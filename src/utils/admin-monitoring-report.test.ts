import { describe, expect, it } from 'vitest'

import { pendingMonitor, type MonitorReading } from './admin-monitoring'
import {
  BACKEND_DOWNTIME_DETAIL,
  RECENT_ISSUE_MS,
  buildEventRows,
  collectAttention,
  eventTiming,
  filterEventRows,
  isHeartbeatStale,
  lastOutageNote,
  monitorOverview,
  queueView,
  type ConfigItem,
  type MonitorEvent,
  type QueueSnapshot,
} from './admin-monitoring-report'

const NOW = new Date(2026, 8, 27, 12, 0)
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString()

function queue(overrides: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    pending: 0,
    overdue: 0,
    stuck: 0,
    failed7d: 0,
    missed7d: 0,
    lastIssueAt: null,
    nextDue: null,
    ...overrides,
  }
}

let nextId = 1
function event(kind: MonitorEvent['kind'], minutesAgo: number, overrides: Partial<MonitorEvent> = {}): MonitorEvent {
  return {
    id: nextId++,
    at: at(minutesAgo),
    service: 'ocr',
    serviceLabel: 'OCR 服務',
    kind,
    detail: null,
    durationSeconds: null,
    ...overrides,
  }
}

function reading(id: string, state: MonitorReading['state']): MonitorReading {
  return { ...pendingMonitor(id, id, '', ''), state }
}

describe('queueView', () => {
  it('沒事就是正常', () => {
    expect(queueView(queue({ pending: 3 }), NOW)).toEqual({ tone: 'ok', statusLabel: '正常', alerts: [] })
  })

  it('到期很久還在待送：派送迴圈停了，紅', () => {
    const view = queueView(queue({ pending: 2, overdue: 2 }), NOW)
    expect(view.tone).toBe('danger')
    expect(view.statusLabel).toBe('2 筆逾時未送')
    expect(view.alerts[0]).toContain('派送迴圈可能停了')
  })

  it('卡在寄送中：紅，並說明不會自動重送', () => {
    const view = queueView(queue({ stuck: 1 }), NOW)
    expect(view.tone).toBe('danger')
    expect(view.alerts[0]).toContain('不會自動重送')
  })

  it('兩種都有時兩句都要講，標題以逾時為主', () => {
    const view = queueView(queue({ overdue: 1, stuck: 1 }), NOW)
    expect(view.statusLabel).toBe('1 筆逾時未送')
    expect(view.alerts).toHaveLength(2)
  })

  it('24 小時內失敗過：黃', () => {
    const view = queueView(queue({ failed7d: 1, lastIssueAt: at(60) }), NOW)
    expect(view.tone).toBe('warn')
  })

  it('上週的失敗只留數字，不再催人 —— 否則一次失敗會讓卡片黃一整週', () => {
    const lastWeek = new Date(NOW.getTime() - RECENT_ISSUE_MS - 60_000).toISOString()
    expect(queueView(queue({ failed7d: 1, lastIssueAt: lastWeek }), NOW).tone).toBe('ok')
  })
})

describe('isHeartbeatStale', () => {
  const summary = (heartbeatMinutesAgo: number | null) => ({
    down: 0,
    events24h: 0,
    lastHeartbeat: heartbeatMinutesAgo === null ? null : at(heartbeatMinutesAgo),
    serverTime: NOW.toISOString(),
  })

  it('心跳 20 秒一次，一分鐘內都算正常', () => {
    expect(isHeartbeatStale(summary(1))).toBe(false)
  })

  it('超過兩分鐘沒心跳就是停了', () => {
    expect(isHeartbeatStale(summary(3))).toBe(true)
  })

  it('從來沒有心跳也算停了', () => {
    expect(isHeartbeatStale(summary(null))).toBe(true)
  })

  it('拿伺服器時間比，瀏覽器時鐘快多少都不影響', () => {
    // serverTime 與心跳都是伺服器寫的；這裡完全沒有用到「現在」
    expect(isHeartbeatStale({ ...summary(1), serverTime: at(0.5) })).toBe(false)
  })
})

describe('collectAttention', () => {
  const config: ConfigItem[] = [
    { key: 'smtp', label: 'Email（SMTP）', ok: true, hint: '' },
    { key: 'nvidia', label: 'AI 模型（NVIDIA 備援）金鑰', ok: false, hint: '' },
  ]

  it('只收 warn 與 danger，紅的排前面', () => {
    const items = collectAttention({
      readings: [reading('後端服務', 'ok'), reading('API 錯誤率', 'degraded'), reading('OCR 服務', 'down')],
      queues: [],
      config,
      heartbeatStale: false,
      closedFeatures: [],
    })
    expect(items).toEqual([
      { label: 'OCR 服務', tone: 'danger' },
      { label: 'API 錯誤率', tone: 'warn' },
      { label: 'AI 模型（NVIDIA 備援）金鑰', tone: 'warn' },
    ])
  })

  it('未設定、資料過期（idle）不算 —— 缺的設定只在設定那一段數一次', () => {
    const items = collectAttention({
      readings: [reading('LLM 備援（Ollama）', 'unavailable')],
      queues: [],
      config: null,
      heartbeatStale: false,
      closedFeatures: [],
    })
    expect(items).toEqual([])
  })

  it('佇列、背景檢查、維護中的功能都算', () => {
    const items = collectAttention({
      readings: [],
      queues: [{ label: '排程通知', view: { tone: 'danger', statusLabel: '', alerts: [] } }],
      config: null,
      heartbeatStale: true,
      closedFeatures: ['合約分析'],
    })
    expect(items.map((item) => item.label)).toEqual(['背景檢查', '排程通知', '合約分析（維護中）'])
  })
})

describe('monitorOverview', () => {
  const base = { loading: false, backendDown: false, metricsAvailable: true, attention: [] }

  it('第一輪還沒回來時不要先閃一下「讀不到」', () => {
    expect(monitorOverview({ ...base, loading: true, metricsAvailable: false }).title).toBe('量測中')
  })

  it('沒事就是全部正常', () => {
    expect(monitorOverview(base)).toEqual({ tone: 'ok', title: '全部正常', detail: '' })
  })

  it('後端沒回應時只講這一件事，不把其他讀不到的項目各算一次', () => {
    const overview = monitorOverview({ ...base, backendDown: true, metricsAvailable: false })
    expect(overview.tone).toBe('danger')
    expect(overview.title).toBe('後端沒有回應')
  })

  it('後端活著但讀不到監控數據：多半是登入過期', () => {
    const overview = monitorOverview({ ...base, metricsAvailable: false })
    expect(overview.tone).toBe('warn')
    expect(overview.detail).toContain('登入')
  })

  it('點名前三項，其餘「等 N 項」；有紅就是紅', () => {
    const overview = monitorOverview({
      ...base,
      attention: [
        { label: 'OCR 服務', tone: 'danger' },
        { label: 'A', tone: 'warn' },
        { label: 'B', tone: 'warn' },
        { label: 'C', tone: 'warn' },
      ],
    })
    expect(overview).toEqual({ tone: 'danger', title: '4 項需要注意', detail: 'OCR 服務、A、B 等 4 項' })
  })
})

describe('buildEventRows', () => {
  it('斷線與恢復合成一列：原因、多久、什麼時候恢復', () => {
    const rows = buildEventRows([
      event('recovered', 10, { durationSeconds: 300 }),
      event('down', 15, { detail: '連線逾時' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'OCR 服務斷線', detail: '連線逾時', ongoing: false, durationSeconds: 300 })
    expect(rows[0]?.endedAt).toBe(at(10))
  })

  it('還沒恢復的是 ongoing', () => {
    const [row] = buildEventRows([event('down', 42, { detail: '連不上' })])
    expect(row?.ongoing).toBe(true)
    expect(eventTiming(row!, NOW)).toEqual({ main: '已 42 分鐘', sub: null })
  })

  it('斷線那筆已被清掉時，用恢復記下的時長推回起點', () => {
    const [row] = buildEventRows([event('recovered', 10, { durationSeconds: 3600 })])
    expect(row?.startedAt).toBe(at(70))
    expect(row?.detail).toBeNull()
    expect(row?.ongoing).toBe(false)
  })

  it('同一服務連續兩筆斷線（中間的恢復不見了）：前一筆不能永遠掛著尚未恢復', () => {
    const rows = buildEventRows([event('down', 10), event('down', 60)])
    expect(rows.map((row) => row.ongoing)).toEqual([true, false])
  })

  it('不同服務各自配對', () => {
    const rows = buildEventRows([
      event('recovered', 5, { service: 'llm-desktop', serviceLabel: 'AI 模型（桌機）', durationSeconds: 600 }),
      event('down', 10, { detail: '連不上' }),
      event('down', 15, { service: 'llm-desktop', serviceLabel: 'AI 模型（桌機）', detail: '連線逾時' }),
    ])
    expect(rows.map((row) => [row.title, row.ongoing])).toEqual([
      ['OCR 服務斷線', true],
      ['AI 模型（桌機）斷線', false],
    ])
  })

  it('後端停機：結束時間由時長推出，時長前面加「約」', () => {
    const [row] = buildEventRows([
      event('backend-downtime', 120, { service: 'backend', serviceLabel: '後端', durationSeconds: 3600 }),
    ])
    expect(row?.detail).toBe(BACKEND_DOWNTIME_DETAIL)
    expect(row?.endedAt).toBe(at(60))
    expect(eventTiming(row!, NOW).main).toBe('約 1 小時')
  })

  it('相鄰、相同的伺服器錯誤合成一列並記次數與最早時間', () => {
    const detail = 'POST /api/contract/analyze → 500（RuntimeError）'
    const rows = buildEventRows([
      event('server-error', 1, { detail }),
      event('server-error', 2, { detail }),
      event('server-error', 3, { detail }),
      event('server-error', 4, { detail: 'GET /api/x → 502' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ count: 3, startedAt: at(1), firstAt: at(3) })
    // 同一天只寫時分，不重複日期
    expect(eventTiming(rows[0]!, NOW)).toEqual({ main: '3 次', sub: '最早 11:57' })
  })

  it('中間隔了別的事件就不合併 —— 那是兩次不同的故障', () => {
    const detail = 'GET /api/x → 500'
    const rows = buildEventRows([
      event('server-error', 1, { detail }),
      event('down', 2),
      event('server-error', 3, { detail }),
    ])
    expect(rows).toHaveLength(3)
  })

  it('歷史退休服務事件沿用 API 提供的標籤', () => {
    const rows = buildEventRows([
      event('down', 5, { service: 'llm-ollama', serviceLabel: 'LLM 備援（Ollama，已移除）' }),
    ])
    expect(rows[0]).toMatchObject({ service: 'llm-ollama', title: 'LLM 備援（Ollama，已移除）斷線' })
  })

  it('依類別篩選', () => {
    const rows = buildEventRows([
      event('server-error', 1, { detail: 'x' }),
      event('notification-missed', 2, { detail: '「停水通知」' }),
      event('down', 3),
    ])
    expect(filterEventRows(rows, 'notification').map((row) => row.title)).toEqual(['排程通知錯過'])
    expect(filterEventRows(rows, 'all')).toHaveLength(3)
  })
})

describe('監控卡的補充說明', () => {
  it('上次斷線只挑已經恢復的那一次', () => {
    const rows = buildEventRows([
      event('down', 5, { detail: '連不上' }),
      event('recovered', 100, { durationSeconds: 7200 }),
      event('down', 220),
    ])
    // 12:00 往回 220 分鐘斷線、100 分鐘前恢復
    expect(lastOutageNote(rows, 'ocr')).toBe('上次斷線：9/27 08:20，持續 2 小時')
    expect(lastOutageNote(rows, 'llm-desktop')).toBeNull()
  })
})

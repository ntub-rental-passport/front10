/**
 * 系統監控的判定邏輯。純邏輯，不依賴 Vue。
 *
 * 這頁刻意分成「量得到」與「還沒接上」兩種項目：
 * 量得到的（後端存活、API 回應時間）現在就顯示真值；
 * 還沒接上的（資料庫連線池、錯誤率）顯示空狀態，**不填假數字**。
 *
 * 假的健康度數字比沒有數字更糟 —— 它永遠顯示正常，看了也不能信，
 * 等真的接上後數值對不起來，反而會懷疑是不是接錯。
 */

import type { StatusDotTone } from '@/src/components/admin/status-dot'

export type MonitorState = 'ok' | 'degraded' | 'down' | 'unavailable'

export const monitorStateLabels: Record<MonitorState, string> = {
  ok: '正常',
  degraded: '緩慢',
  down: '無回應',
  unavailable: '尚未接上',
}

/**
 * MonitorState → StatusDot 的顏色。
 *
 * 監控卡原本自己寫死 emerald／amber（不在 design token 裡，也不跟深淺色切換），
 * 總覽的健康條又另外有一份對照。現在兩邊都用這一份。
 */
export const MONITOR_STATE_TONE: Record<MonitorState, StatusDotTone> = {
  ok: 'ok',
  degraded: 'warn',
  down: 'danger',
  unavailable: 'idle',
}

/**
 * 依回應時間分級。
 *
 * `null` 代表這次量測失敗（連不上、逾時），直接算 down —— 量不到本身就是資訊，
 * 不該退化成「尚未接上」，那是給還沒實作的項目用的。
 *
 * 門檻由呼叫端傳入（來自系統設定的 responseOkMs / responseDegradedMs）——
 * 這個檔案是純邏輯，不能自己去讀設定 collection。
 */
export function classifyResponseTime(
  ms: number | null,
  okMs: number,
  degradedMs: number,
): MonitorState {
  if (ms === null) return 'down'
  if (ms < okMs) return 'ok'
  if (ms < degradedMs) return 'degraded'
  return 'down'
}

export function formatResponseTime(ms: number | null): string {
  if (ms === null) return '—'
  return `${Math.round(ms)} ms`
}

export interface MonitorReading {
  id: string
  label: string
  description: string
  state: MonitorState
  /** 主要顯示值；尚未接上時為 null */
  value: string | null
  detail: string
  /** 後端端點是否已存在。false 時畫面顯示空狀態而非數字。 */
  connected: boolean
  /**
   * 取代 monitorStateLabels 的狀態文字。「尚未接上」只適合還沒實作的項目；
   * 後端刻意不探測（沒設定位址）或探測停了，要講清楚是哪一種。
   */
  stateLabel?: string
  /** 數值下方的補充說明，一行一句 */
  notes?: string[]
}

/** 尚未接上的監控項目，資料形狀先定義好，之後只要換掉來源就會亮起來 */
export function pendingMonitor(
  id: string,
  label: string,
  description: string,
  detail: string,
): MonitorReading {
  return {
    id,
    label,
    description,
    state: 'unavailable',
    value: null,
    detail,
    connected: false,
  }
}

/** 從一次量測結果組出後端服務的監控項 */
export function backendMonitor(
  responseMs: number | null,
  checkedAt: string | null,
  okMs: number,
  degradedMs: number,
): MonitorReading {
  const state = classifyResponseTime(responseMs, okMs, degradedMs)
  return {
    id: 'backend',
    label: '後端服務',
    description: 'FastAPI 是否回應，以及往返時間',
    state,
    value: formatResponseTime(responseMs),
    detail:
      responseMs === null
        ? '連線失敗，請確認後端是否啟動'
        : checkedAt
          ? `最後量測 ${checkedAt}`
          : '',
    connected: true,
  }
}

/**
 * 後端 /api/admin/metrics 的回傳形狀。
 *
 * 後端刻意只給「量得到的事實」，健不健康的判定在這裡做 ——
 * 門檻是營運政策（幾 % 算異常會隨經驗調整），寫在前端改起來不用重新部署後端。
 */
export interface DbPoolSnapshot {
  configured: boolean
  size?: number
  maxOverflow?: number
  capacity?: number
  inUse?: number
  idle?: number
  overflowInUse?: number
  utilization?: number
}

export interface RequestSnapshot {
  windowMinutes: number
  total: number
  clientErrors: number
  serverErrors: number
  errorRate: number
  serverErrorRate: number
}

/**
 * 後端回來的數字是不是真的是數字。
 *
 * 這兩個監控項的門檻判斷全是數值比較，而 NaN 跟任何值比都是 false ——
 * 所以缺欄位、型別不對、或後端改了欄位名的時候，三元運算會一路掉到最後
 * 一個分支，靜靜地變成 down；錯誤率還會經過 toFixed 印出「NaN%」。
 *
 * 那是「假綠燈」的鏡像問題：一個假的紅燈配一串無意義的文字。這條健康條
 * 的原則是讀不到就說「無法取得」，不是猜一個狀態出來。所以讀不到數字時
 * 回 unavailable（灰色、不搶注意力），而不是 down（紅色警示）——
 * 我們不知道它壞了，我們只是讀不到。
 */
function isReadableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 連線池使用率門檻：超過就代表離「連線耗盡、請求開始排隊」不遠了 */
export const POOL_OK_RATIO = 0.7
export const POOL_DEGRADED_RATIO = 0.9

/** 錯誤率門檻。用 5xx 而非全部錯誤判定 —— 見 errorRateMonitor 說明 */
export const ERROR_OK_RATIO = 0.02
export const ERROR_DEGRADED_RATIO = 0.1

/**
 * 資料庫連線池的監控項。
 *
 * `null` 代表這次讀取失敗（後端掛了、權限不足），算 down；
 * 後端有回應但沒設定資料庫，則是 unavailable —— 那不是故障，是沒接。
 */
export function dbPoolMonitor(snapshot: DbPoolSnapshot | null): MonitorReading {
  const base = {
    id: 'db-pool',
    label: '資料庫連線池',
    description: '使用中連線數與可用上限',
  }

  if (snapshot === null) {
    return { ...base, state: 'down' as const, value: null, detail: '讀取失敗，請確認後端狀態', connected: true }
  }
  if (!snapshot.configured) {
    return { ...base, state: 'unavailable' as const, value: null, detail: '後端未設定資料庫連線', connected: false }
  }

  // utilization 沒給是合理的（舊版後端），當 0 處理；但給了一個不是數字的
  // 東西就是契約壞了，那要誠實說讀不到
  if (snapshot.utilization !== undefined && !isReadableNumber(snapshot.utilization)) {
    return {
      ...base,
      state: 'unavailable' as const,
      value: null,
      detail: '後端回傳的使用率不是數字',
      connected: false,
    }
  }

  const ratio = snapshot.utilization ?? 0
  const state = ratio < POOL_OK_RATIO ? 'ok' : ratio < POOL_DEGRADED_RATIO ? 'degraded' : 'down'

  return {
    ...base,
    state,
    value: `${snapshot.inUse ?? 0} / ${snapshot.capacity ?? 0}`,
    detail:
      `閒置 ${snapshot.idle ?? 0}、超額使用 ${snapshot.overflowInUse ?? 0}` +
      `（池 ${snapshot.size ?? 0} + 可追加 ${snapshot.maxOverflow ?? 0}）`,
    connected: true,
  }
}

/**
 * API 錯誤率的監控項。
 *
 * **以 5xx 判定狀態，不用全部錯誤。** 4xx 多半是使用者自己輸錯密碼、
 * 或掃描器在探測不存在的路徑 —— 那是防護正在生效，不是系統有病。
 * 把 4xx 算進健康度，網站被掃描時反而會顯示成故障。
 * 4xx 仍然顯示出來供參考，只是不影響判定。
 *
 * 時間窗內沒有任何請求時顯示「無流量」而非 0%：
 * 沒資料和「有流量且零錯誤」是兩件事，混在一起看不出後端其實沒人在用。
 */
export function errorRateMonitor(snapshot: RequestSnapshot | null): MonitorReading {
  const base = {
    id: 'error-rate',
    label: 'API 錯誤率',
    description: '近一小時 5xx 佔比（4xx 另計，不影響判定）',
  }

  if (snapshot === null) {
    return { ...base, state: 'down' as const, value: null, detail: '讀取失敗，請確認後端狀態', connected: true }
  }
  if (snapshot.total === 0) {
    return {
      ...base,
      state: 'ok' as const,
      value: '—',
      detail: `近 ${snapshot.windowMinutes} 分鐘無流量`,
      connected: true,
    }
  }

  const ratio = snapshot.serverErrorRate
  if (!isReadableNumber(ratio)) {
    return {
      ...base,
      state: 'unavailable' as const,
      value: null,
      detail: '後端回傳的錯誤率不是數字',
      connected: false,
    }
  }

  const state = ratio < ERROR_OK_RATIO ? 'ok' : ratio < ERROR_DEGRADED_RATIO ? 'degraded' : 'down'

  return {
    ...base,
    state,
    value: `${(ratio * 100).toFixed(1)}%`,
    detail:
      `近 ${snapshot.windowMinutes} 分鐘 ${snapshot.total} 筆請求，` +
      `5xx ${snapshot.serverErrors} 筆、4xx ${snapshot.clientErrors} 筆`,
    connected: true,
  }
}

/* -------------------- 後端探測的服務（背景迴圈每 60 秒一次） -------------------- */

/** backend/monitoring_service.py 的 service_states() */
export interface ServiceState {
  service: string
  label: string
  status: 'up' | 'down'
  since: string | null
  detail: string | null
  checkedAt: string | null
}

/**
 * 探測結果多久沒更新就不能信。
 *
 * 後端每 60 秒探測一次。背景迴圈停了的話，資料庫裡留著的是最後一次看到的
 * 狀態 —— 那會是一顆永遠亮著的綠燈。超過這個時間就改顯示「資料過期」。
 */
export const SERVICE_STALE_MS = 5 * 60_000

export function parseIsoTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : time
}

/** 「5 分鐘」「2 小時 5 分」「3 天 4 小時」。只留兩個單位，再細就沒人在看了。 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return '不到 1 分鐘'
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} 分鐘`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours} 小時 ${minutes % 60} 分` : `${hours} 小時`
  const days = Math.floor(hours / 24)
  return hours % 24 ? `${days} 天 ${hours % 24} 小時` : `${days} 天`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 「9/27 10:02」。監控紀錄只留 30 天，年份省略。 */
export function formatShortDateTime(iso: string): string {
  const time = parseIsoTime(iso)
  if (time === null) return '—'
  const date = new Date(time)
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 「剛剛」「3 分鐘前」「2 小時 5 分前」。未來的時間（時鐘不同步）當成剛剛。 */
export function formatTimeAgo(iso: string | null, now: Date): string {
  const time = parseIsoTime(iso)
  if (time === null) return '—'
  const seconds = (now.getTime() - time) / 1000
  return seconds < 60 ? '剛剛' : `${formatDuration(seconds)}前`
}

/**
 * 跟另一個時間放在一起顯示的時間（「13:40 恢復」「最早 16:28」）。
 * 跟 anchor 同一天就只寫時分，跨日才帶日期 —— 同一列裡日期寫兩次只是雜訊。
 */
export function formatPairedTime(anchorIso: string, iso: string): string {
  const anchor = parseIsoTime(anchorIso)
  const time = parseIsoTime(iso)
  if (anchor === null || time === null) return '—'
  const anchorDate = new Date(anchor)
  const date = new Date(time)
  const sameDay =
    anchorDate.getFullYear() === date.getFullYear() &&
    anchorDate.getMonth() === date.getMonth() &&
    anchorDate.getDate() === date.getDate()
  return sameDay ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : formatShortDateTime(iso)
}

function isStale(state: ServiceState, now: Date): boolean {
  const checkedAt = parseIsoTime(state.checkedAt)
  return checkedAt === null || now.getTime() - checkedAt > SERVICE_STALE_MS
}

function downDetail(state: ServiceState, now: Date): string {
  const since = parseIsoTime(state.since)
  if (since === null) return ''
  return `${formatShortDateTime(state.since!)} 起無法連線（已 ${formatDuration((now.getTime() - since) / 1000)}）`
}

export interface ServiceMeta {
  id: string
  label: string
  description: string
  /** 後端沒有設定這項服務的位址，所以根本沒有探測 */
  unconfigured: string
}

export const LLM_OLLAMA_SERVICE: ServiceMeta = {
  id: 'llm-ollama',
  label: 'LLM 備援（Ollama）',
  description: 'NVIDIA 失敗時才會用到的備援模型，VM 上的 Ollama 容器（只有 CPU，很慢）',
  unconfigured: '後端沒有設定 Ollama 位址（OLLAMA_URL），或嘗試順序裡沒有 ollama，所以沒有探測',
}

export const RAG_SERVICE: ServiceMeta = {
  id: 'rag',
  label: 'RAG 檢索服務',
  description: '法規檢索用的 embedding 服務（text2vec-base-chinese 容器）；連不上時改把全部法規放進 prompt',
  unconfigured: '後端沒有設定 RAG 位址（LOCAL_EMBEDDING_URL），或檢索順序裡沒有 local，所以沒有探測',
}

export const OCR_SERVICE: ServiceMeta = {
  id: 'ocr',
  label: 'OCR 服務',
  description: '合約掃描的文字辨識，獨立的 Node 服務',
  unconfigured: '後端沒有設定 OCR 服務位址（OCR_HEALTH_URL 或 OCR_API_PORT），所以沒有探測',
}

/**
 * 後端探測的服務 → 監控項。
 *
 * `states` 是 null 代表這一輪讀不到監控數據（後端掛了、登入過期）。那時我們
 * 不知道 AI 模型在不在 —— 不能說它掛了，也不能說它沒設定，只能說讀不到。
 */
export function serviceMonitor(
  states: ServiceState[] | null,
  meta: ServiceMeta,
  now: Date,
): MonitorReading {
  const base = { id: meta.id, label: meta.label, description: meta.description }

  if (states === null) {
    return {
      ...base,
      state: 'unavailable',
      stateLabel: '無法取得',
      value: null,
      detail: '讀取失敗，請確認後端狀態',
      connected: false,
    }
  }

  const state = states.find((item) => item.service === meta.id)
  if (!state) {
    return { ...base, state: 'unavailable', stateLabel: '未設定', value: null, detail: meta.unconfigured, connected: false }
  }

  if (isStale(state, now)) {
    return {
      ...base,
      state: 'unavailable',
      stateLabel: '資料過期',
      value: null,
      detail: state.checkedAt
        ? `最後一次檢查是 ${formatShortDateTime(state.checkedAt)}，背景檢查可能停了`
        : '後端沒有回報檢查時間',
      connected: false,
    }
  }

  if (state.status === 'down') {
    return { ...base, state: 'down', value: state.detail ?? '連不上', detail: downDetail(state, now), connected: true }
  }

  // 寫「自 X 起正常」而不是「已連續在線 N 天」：後端自己停機的那段時間沒有人在檢查，
  // 我們不知道那段期間它在不在，不能宣稱「連續」。
  return {
    ...base,
    state: 'ok',
    value: '在線',
    detail: state.since ? `自 ${formatShortDateTime(state.since)} 起正常` : '',
    connected: true,
  }
}

/**
 * 資料庫：連線池（每次讀 metrics 當下的數字）＋ 後端每 60 秒的連線探測。
 *
 * 連線池只看得到「借出去幾條」，看不出資料庫本身還在不在 —— 資料庫掛了，
 * 池子照樣可以是 0 / 15 一片綠。所以探測失敗時以探測為準。
 */
export function databaseMonitor(
  pool: DbPoolSnapshot | null,
  states: ServiceState[] | null,
  now: Date,
): MonitorReading {
  const reading: MonitorReading = {
    ...dbPoolMonitor(pool),
    label: '資料庫',
    description: '連不連得上，以及連線池用了多少',
  }
  const probe = states?.find((item) => item.service === 'database')
  if (!probe || probe.status !== 'down' || isStale(probe, now)) return reading
  return { ...reading, state: 'down', value: probe.detail ?? '連不上', detail: downDetail(probe, now), connected: true }
}

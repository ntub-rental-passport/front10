import type { StatusDotTone } from '@/src/components/admin/status-dot'
import type { GovernmentStep } from '@/src/mocks/admin/subsidy'

/**
 * 租金補貼審核。純邏輯，不依賴 Vue。
 *
 * 流程刻意分兩層：
 *
 * 第一層是 RentMate 自己的把關，每個狀態都有管理員按得下去的動作
 *   待審 → 待補件／已退件／待送件 → 已送件
 *
 * 第二層是政府端的進度（資格初審、複審核定、撥款那一串），送件之後才開始，
 * 管理員只能同步顯示、不能操作。混成一條九步的流程會分不清哪幾步自己推得動。
 */

export type SubsidyStatus = 'pending' | 'need-docs' | 'rejected' | 'ready' | 'submitted'

export const subsidyStatusLabels: Record<SubsidyStatus, string> = {
  pending: '待審核',
  'need-docs': '待補件',
  rejected: '已退件',
  ready: '待送件',
  submitted: '已送件',
}

/** 第一層的合法轉移。表以外的一律拒絕。 */
export const subsidyTransitions: Record<SubsidyStatus, SubsidyStatus[]> = {
  pending: ['need-docs', 'rejected', 'ready'],
  // 補齊後可以直接通過，也可能查出資格問題而退件
  'need-docs': ['ready', 'rejected'],
  // 退件是終態，要重新申請得由使用者端重送
  rejected: [],
  ready: ['submitted', 'need-docs'],
  // 送件後由政府端接手，第一層不再變動
  submitted: [],
}

export function canTransitionSubsidy(from: SubsidyStatus, to: SubsidyStatus): boolean {
  return subsidyTransitions[from].includes(to)
}

// ── 文件 ──────────────────────────────────────────────────────────

export type SubsidyDocKey = 'id' | 'lease' | 'household' | 'income' | 'bankbook'

/** 與使用者端補貼頁列的同一份清單 */
export const subsidyDocLabels: Record<SubsidyDocKey, string> = {
  id: '身分證正反面',
  lease: '租賃契約書',
  household: '戶籍謄本',
  income: '在職／所得證明',
  bankbook: '存摺封面',
}

export const SUBSIDY_DOC_KEYS = Object.keys(subsidyDocLabels) as SubsidyDocKey[]

export type SubsidyDocStatus = 'approved' | 'missing'

export interface SubsidyDocument {
  key: SubsidyDocKey
  status: SubsidyDocStatus
  /** 退件時寫給申請人的說明 */
  hint: string | null
}

export function missingDocuments(documents: SubsidyDocument[]): SubsidyDocKey[] {
  return documents.filter((doc) => doc.status === 'missing').map((doc) => doc.key)
}

/** 文件是否已全數齊備。文件不齊就不該讓管理員按「審核通過」。 */
export function documentsComplete(documents: SubsidyDocument[]): boolean {
  return documents.length > 0 && documents.every((doc) => doc.status === 'approved')
}

/** 缺件清單的中文描述，用於退件通知與稽核紀錄 */
export function missingDocumentsLabel(documents: SubsidyDocument[]): string {
  const missing = missingDocuments(documents)
  if (missing.length === 0) return '無缺件'
  return missing.map((key) => subsidyDocLabels[key]).join('、')
}

// ── 送件批次 ──────────────────────────────────────────────────────

/**
 * 批次編號：`SB-YYYYMMDD-NN`。
 *
 * 同一天可能送好幾批，所以序號是「當天已有幾批」加一，不是全域流水號 ——
 * 這樣編號本身就看得出是哪天送的第幾批。
 */
export function nextBatchCode(existingCodes: string[], now: Date = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const prefix = `SB-${stamp}-`
  const usedSequences = existingCodes
    .filter((code) => code.startsWith(prefix))
    .map((code) => Number.parseInt(code.slice(prefix.length), 10))
    .filter((value) => Number.isFinite(value))
  const next = usedSequences.length > 0 ? Math.max(...usedSequences) + 1 : 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

// ── 統計 ──────────────────────────────────────────────────────────

export interface SubsidyStats {
  total: number
  pending: number
  needDocs: number
  ready: number
  submitted: number
  rejected: number
}

export function subsidyStats(statuses: SubsidyStatus[]): SubsidyStats {
  const count = (target: SubsidyStatus) => statuses.filter((status) => status === target).length
  return {
    total: statuses.length,
    pending: count('pending'),
    needDocs: count('need-docs'),
    ready: count('ready'),
    submitted: count('submitted'),
    rejected: count('rejected'),
  }
}

/**
 * 補貼狀態對到狀態圓點的顏色。
 *
 * 規則跟工單頁同一套（見 admin-maintenance.ts 的 maintenanceStatusTone）：
 * **有人在等 = warn**。
 *
 *   待審核  等管理員審            → warn
 *   待補件  等申請人補件          → warn
 *   待送件  文件齊了，等著成批送出 → ok，流程正常在走
 *   已送件  送出去了              → idle，管理員這邊結束了
 *   已退件  終態，但結果是壞的    → danger
 *
 * ## 為什麼待補件是 warn 而不是 idle
 *
 * 「在等申請人」表面上不是管理員的事，照工單頁的邏輯該給 idle。但補件案
 * 沒有任何人會來催 —— 它會安安靜靜放到過期。給灰色等於把它藏起來。
 *
 * ## 為什麼已退件是 danger 而已關閉（工單）是 idle
 *
 * 兩個都是終態，差別在結果：工單關閉代表事情解決了，補貼退件代表這個人
 * 沒拿到補貼。後者是需要被看見的結果，不該跟「順利完成」同一個灰色。
 */
export function subsidyStatusTone(status: SubsidyStatus): StatusDotTone {
  switch (status) {
    case 'pending':
    case 'need-docs':
      return 'warn'
    case 'ready':
      return 'ok'
    case 'submitted':
      return 'idle'
    case 'rejected':
      return 'danger'
  }
}

/**
 * 「待我處理」涵蓋的狀態：需要管理員動手的那兩種。
 *
 * 待審核要人審、待送件要人送，兩件都是管理員的事，但它們分散在兩個頁籤，
 * 要切換兩次才看得完。聚合成一籤之後「今天我要做什麼」就是一個畫面。
 *
 * 待補件不算 —— 那是在等申請人，管理員現在動不了。
 */
export const SUBSIDY_QUEUE_STATUSES: readonly SubsidyStatus[] = ['pending', 'ready']

export function isSubsidyQueue(status: SubsidyStatus): boolean {
  return SUBSIDY_QUEUE_STATUSES.includes(status)
}

export interface GovernmentStepVisual {
  /** 時間軸上那個節點的樣式 */
  dotClass: string
  /** 步驟標題的樣式 */
  textClass: string
}

/**
 * 政府端進度的步驟樣式。
 *
 * ## 為什麼不沿用 StatusDot 的四色
 *
 * 這段進度是政府受理系統回來的，畫面上自己就寫著「後台僅同步顯示，無法在
 * 此變更」。而 warn／danger 在這個後台已經被定義成「**要你動手**」——
 * 管理員對政府端的步驟一步都動不了，套上那組顏色等於用同樣的訊號講不同的
 * 意思，整套規則就開始漏水。
 *
 * 所以這裡是**進度語言**而不是狀態語言：它表達的是「走到哪了」。
 *
 *   已完成  實心灰點         走過了，不用再看
 *   進行中  實心主色點＋粗體  現在卡在這一步
 *   未開始  空心點           還沒輪到
 *   失敗    實心橘紅點＋紅字  這件事沒過
 *
 * ## failed 原本跟 pending 長一模一樣
 *
 * 原本的三元判斷是「active → 主色、done → 正常、**其餘 → 灰字**」，而
 * GovernmentStep.status 有四種 —— failed 落進「其餘」，於是「政府端審核
 * 失敗」看起來就像「還沒輪到」。這不會報錯，只會讓人以為案子還在排隊。
 */
export function governmentStepVisual(status: GovernmentStep['status']): GovernmentStepVisual {
  switch (status) {
    case 'done':
      return { dotClass: 'bg-muted-foreground', textClass: '' }
    case 'active':
      return { dotClass: 'bg-primary', textClass: 'font-semibold text-primary' }
    case 'failed':
      return { dotClass: 'bg-destructive-surface', textClass: 'font-medium text-destructive' }
    case 'pending':
      return { dotClass: 'border-2 border-border bg-background', textClass: 'text-muted-foreground' }
  }
}

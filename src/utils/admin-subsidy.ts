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

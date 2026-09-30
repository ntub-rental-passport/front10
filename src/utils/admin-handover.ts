/**
 * 點交存證的 AI 比對結果。純邏輯，不依賴 Vue。
 *
 * 真實流程只有租客拍照、AI 比對（backend/routers/inspection.py 的 compare_photos）：
 * 每個品項拿入住、退租兩張照片給看圖模型比，得到五種結果之一。沒有「房東認定」
 * 「租客認定」—— 原本那兩欄是示範資料虛構的，2026-09-30 改成 AI 比對結果。
 *
 * 後台只顯示比對結果與 AI 的說明，不顯示照片（2026-09-30 決定）。
 */

export type HandoverResult = 'unchanged' | 'degraded' | 'new_damage' | 'missing' | 'uncertain'

export const handoverResultLabels: Record<HandoverResult, string> = {
  unchanged: '無變化',
  degraded: '使用痕跡',
  new_damage: '新增損壞',
  missing: '物品不見',
  uncertain: 'AI 無法判斷',
}

/** 還沒比對的品項缺哪張照片。照片齊了、只是還沒比對時是 null */
export type MissingPhoto = 'baseline' | 'checkout' | 'both'

const MISSING_PHOTO_LABELS: Record<MissingPhoto, string> = {
  baseline: '缺入住照片',
  checkout: '缺退租照片',
  both: '還沒拍照',
}

export interface HandoverItem {
  id: string
  room: string
  name: string
  /** 還沒比對時為 null */
  result: HandoverResult | null
  /** AI 對前後差異的說明，還沒比對時為 null */
  summary: string | null
  /** AI 自評的信心，0 到 1 */
  confidence: number | null
  missingPhoto: MissingPhoto | null
}

/** 一個品項在表格上的文字：比對過就是結果，還沒比對就說卡在哪 */
export function handoverItemLabel(item: Pick<HandoverItem, 'result' | 'missingPhoto'>): string {
  if (item.result !== null) return handoverResultLabels[item.result]
  return item.missingPhoto === null ? '還沒比對' : MISSING_PHOTO_LABELS[item.missingPhoto]
}

/** 新增損壞、物品不見：可能牽涉押金扣抵，是管理員會被找來協調的那種 */
export function isHandoverDamage(result: HandoverResult | null): boolean {
  return result === 'new_damage' || result === 'missing'
}

export interface HandoverSummary {
  total: number
  /** 新增損壞、物品不見 */
  damaged: number
  /** AI 無法判斷，要人看照片 */
  uncertain: number
  /** 還沒比對 */
  pending: number
  /** 無變化、使用痕跡（一般磨損不算租客的責任） */
  clear: number
}

export function summarizeHandover(items: Pick<HandoverItem, 'result'>[]): HandoverSummary {
  const summary: HandoverSummary = {
    total: items.length,
    damaged: 0,
    uncertain: 0,
    pending: 0,
    clear: 0,
  }
  for (const { result } of items) {
    if (result === null) summary.pending += 1
    else if (isHandoverDamage(result)) summary.damaged += 1
    else if (result === 'uncertain') summary.uncertain += 1
    else summary.clear += 1
  }
  return summary
}

export type HandoverOutcome = 'damaged' | 'uncertain' | 'incomplete' | 'clear'

export const handoverOutcomeLabels: Record<HandoverOutcome, string> = {
  damaged: '有損壞',
  uncertain: '需要人工確認',
  incomplete: '還沒比對完',
  clear: '無異狀',
}

/**
 * 整份點交的結論，取最需要注意的那一項：有損壞 > AI 無法判斷 > 還沒比對完 > 無異狀。
 * 有一項損壞就足以讓管理員注意，不必等其他項目比對完。
 */
export function handoverOutcome(items: Pick<HandoverItem, 'result'>[]): HandoverOutcome {
  const summary = summarizeHandover(items)
  if (summary.damaged > 0) return 'damaged'
  if (summary.uncertain > 0) return 'uncertain'
  if (summary.pending > 0) return 'incomplete'
  return 'clear'
}

/**
 * 點交存證的雙方判定比對。純邏輯，不依賴 Vue。
 *
 * 刻意只保留「房東怎麼認、租客怎麼認、兩邊合不合」這三件事：
 *
 * - **不含照片**：照片存在使用者自己的瀏覽器裡，後台根本讀不到，
 *   放上來只能是佔位圖，那是假的。
 * - **不含 AI 差異判定**：使用者端那個 diff 本身就是假資料，
 *   把假的判定當成第三方意見放進爭議畫面，只會誤導判斷。
 *
 * 結構與押金對帳同構（兩造各自聲明 → 比對），所以兩塊放在使用者詳情頁很自然。
 */

export type HandoverVerdict = 'intact' | 'damaged'

export const handoverVerdictLabels: Record<HandoverVerdict, string> = {
  intact: '完好',
  damaged: '有損壞',
}

export type HandoverAgreement = 'agreed' | 'disputed' | 'pending'

export const handoverAgreementLabels: Record<HandoverAgreement, string> = {
  agreed: '雙方一致',
  disputed: '意見不一致',
  pending: '租客未確認',
}

/**
 * 比對兩造判定。
 *
 * 租客還沒表示視為 pending 而非不一致 —— 那是還沒填，不是對不起來，
 * 跟押金對帳把「未聲明」與「金額不符」分開是同一個道理。
 */
export function handoverAgreementOf(
  landlordVerdict: HandoverVerdict,
  tenantVerdict: HandoverVerdict | null,
): HandoverAgreement {
  if (tenantVerdict === null) return 'pending'
  return landlordVerdict === tenantVerdict ? 'agreed' : 'disputed'
}

export interface HandoverItemLike {
  landlordVerdict: HandoverVerdict
  tenantVerdict: HandoverVerdict | null
}

export interface HandoverSummary {
  total: number
  agreed: number
  disputed: number
  pending: number
}

export function summarizeHandover(items: HandoverItemLike[]): HandoverSummary {
  const summary: HandoverSummary = { total: items.length, agreed: 0, disputed: 0, pending: 0 }
  for (const item of items) {
    summary[handoverAgreementOf(item.landlordVerdict, item.tenantVerdict)] += 1
  }
  return summary
}

/**
 * 整份點交紀錄的結論。
 *
 * 只要有任何一項不一致，整份就是有爭議 —— 管理員關心的是「要不要介入」，
 * 而一項爭議就足以構成介入的理由。
 */
export function overallAgreement(items: HandoverItemLike[]): HandoverAgreement {
  const summary = summarizeHandover(items)
  if (summary.disputed > 0) return 'disputed'
  if (summary.pending > 0) return 'pending'
  return 'agreed'
}

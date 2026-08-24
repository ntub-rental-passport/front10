/**
 * 稽核紀錄匯出 CSV 的字串組裝。純邏輯，不碰 Blob／下載，方便單元測試。
 *
 * 逃逸規則抽成獨立函式而不是寫在 join 裡，是因為這裡最容易出錯：
 * 欄位內容（尤其是「詳情」）本來就會出現逗號、引號、換行，沒逃逸好整份 CSV 就爛掉。
 */

export interface AuditCsvRow {
  at: string
  actor: string
  action: string
  target: string
  detail: string
}

const CSV_HEADER = ['時間', '操作者', '動作', '對象', '詳情']

/** 含逗號、雙引號或換行的欄位要用雙引號包起來，欄位內原有的雙引號要重複一次跳脫 */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** @param formatAt 時間欄位的格式化函式，交由呼叫端決定顯示格式（例如在地時區） */
export function buildAuditCsv(rows: AuditCsvRow[], formatAt: (iso: string) => string): string {
  const lines = [CSV_HEADER, ...rows.map((row) => [
    formatAt(row.at),
    row.actor,
    row.action,
    row.target,
    row.detail,
  ])]

  // CSV 標準換行是 CRLF，Excel 對 LF-only 的檔案偶爾會整份擠成一欄
  return lines.map((line) => line.map(escapeCsvField).join(',')).join('\r\n')
}

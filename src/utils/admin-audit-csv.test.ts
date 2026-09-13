import { describe, expect, it } from 'vitest'
import { buildAuditCsv, escapeCsvField, type AuditCsvRow } from './admin-audit-csv'

describe('escapeCsvField', () => {
  it('純文字不加引號', () => {
    expect(escapeCsvField('admin@rentmate.tw')).toBe('admin@rentmate.tw')
  })

  it('含逗號的欄位要包引號', () => {
    expect(escapeCsvField('停用帳號, 原因：多次違規')).toBe('"停用帳號, 原因：多次違規"')
  })

  it('含雙引號的欄位要包引號，且內部引號要重複跳脫', () => {
    expect(escapeCsvField('備註：使用者說"已解決"')).toBe('"備註：使用者說""已解決"""')
  })

  it('含換行的欄位要包引號', () => {
    expect(escapeCsvField('第一行\n第二行')).toBe('"第一行\n第二行"')
  })

  it('同時含逗號與雙引號時只跳脫一次外層引號', () => {
    expect(escapeCsvField('a,b"c')).toBe('"a,b""c"')
  })
})

describe('buildAuditCsv', () => {
  const formatAt = (iso: string) => iso

  it('第一行是標題列', () => {
    const csv = buildAuditCsv([], formatAt)
    expect(csv).toBe('時間,操作者,動作,對象,詳情')
  })

  it('依序輸出每一筆紀錄', () => {
    const rows: AuditCsvRow[] = [
      { at: '2026-08-18T10:00:00Z', actor: 'admin@rentmate.tw', action: '登入', target: 'admin@rentmate.tw', detail: '管理員登入後台' },
    ]
    const csv = buildAuditCsv(rows, formatAt)
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('2026-08-18T10:00:00Z,admin@rentmate.tw,登入,admin@rentmate.tw,管理員登入後台')
  })

  it('欄位含逗號、引號、換行時整份 CSV 仍然逐欄對齊', () => {
    const rows: AuditCsvRow[] = [
      {
        at: '2026-08-18T10:00:00Z',
        actor: 'amy@example.com',
        action: '使用者管理',
        target: 'derek.wu@example.com',
        detail: '停用帳號：備註寫著 "多次, 違規"\n已通知房東',
      },
    ]
    const csv = buildAuditCsv(rows, formatAt)
    const lines = csv.split('\r\n')
    // 逃逸後的欄位本身含換行，行數不會單純等於紀錄數 + 1
    expect(lines[0]).toBe('時間,操作者,動作,對象,詳情')
    expect(csv).toContain('"停用帳號：備註寫著 ""多次, 違規""\n已通知房東"')
  })

  it('多筆紀錄之間用 CRLF 分隔', () => {
    const rows: AuditCsvRow[] = [
      { at: 'a', actor: 'x', action: '登入', target: 'x', detail: '1' },
      { at: 'b', actor: 'y', action: '登入', target: 'y', detail: '2' },
    ]
    const csv = buildAuditCsv(rows, formatAt)
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})

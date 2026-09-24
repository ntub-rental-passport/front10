import { describe, expect, it } from 'vitest'
import { dateKey } from './date-key'

describe('dateKey', () => {
  it('輸出本地時區的 YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 7, 1))).toBe('2026-08-01')
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('月與日補零', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('日期輸入框的來回轉換', () => {
  // 後台的公告與輪播都用 <input type="date">：存檔時把 YYYY-MM-DD 轉成
  // 本地午夜的 ISO，開啟編輯時再轉回來。這一輪來回必須是穩定的。
  //
  // 曾經的做法是 `iso.slice(0, 10)`，那等於直接讀 UTC 日期 —— 本地午夜在
  // UTC+8 是前一天的 16:00Z，所以每存一次檔日期就往前退一天。
  const fromDateInput = (value: string) => new Date(`${value}T00:00:00`).toISOString()
  const toDateInput = (iso: string) => dateKey(new Date(iso))

  it('存檔再開啟拿到的是同一天', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-09-17', '2026-12-31']) {
      expect(toDateInput(fromDateInput(day))).toBe(day)
    }
  })

  it('連續來回不會愈跑愈早', () => {
    let value = '2026-09-17'
    for (let i = 0; i < 5; i += 1) value = toDateInput(fromDateInput(value))
    expect(value).toBe('2026-09-17')
  })

  it('直接切 ISO 字串就是會退一天（記錄這個壞掉的做法，免得有人改回去）', () => {
    const stored = fromDateInput('2026-09-17')
    // 只在 UTC 以東的時區才會退，測試環境是 UTC+8
    if (new Date().getTimezoneOffset() < 0) {
      expect(stored.slice(0, 10)).not.toBe('2026-09-17')
    }
  })
})

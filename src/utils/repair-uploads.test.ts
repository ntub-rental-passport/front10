import { describe, expect, it } from 'vitest'
import { archiveLegacyRepairs, validateRepairUpload } from './repair-uploads'

describe('報修附件與舊資料保存', () => {
  it('照片只接受三種圖片，PDF 僅用於收據與報價', () => {
    expect(validateRepairUpload({ type: 'image/webp', size: 5 * 1024 * 1024 }, 'initial')).toBe('')
    expect(validateRepairUpload({ type: 'image/heic', size: 10 }, 'initial')).not.toBe('')
    expect(validateRepairUpload({ type: 'application/pdf', size: 10 * 1024 * 1024 }, 'receipt')).toBe('')
    expect(validateRepairUpload({ type: 'application/pdf', size: 10 }, 'initial')).not.toBe('')
    expect(validateRepairUpload({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }, 'receipt')).not.toBe('')
  })
  it('備份原始文字成功後才移除舊資料，重跑不覆寫備份', () => {
    const values = new Map([['rentmate-repair-tickets-v1', 'raw invalid JSON']])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    archiveLegacyRepairs(storage)
    expect(values.get('rentmate-repair-tickets-v1:archive')).toBe('raw invalid JSON')
    expect(values.has('rentmate-repair-tickets-v1')).toBe(false)
    archiveLegacyRepairs(storage)
    expect(values.get('rentmate-repair-tickets-v1:archive')).toBe('raw invalid JSON')
  })
  it('備份失敗時保留原始資料', () => {
    let removed = false
    const storage = { getItem: () => 'raw', setItem: () => { throw Error('quota') }, removeItem: () => { removed = true } }
    expect(() => archiveLegacyRepairs(storage)).toThrow()
    expect(removed).toBe(false)
  })
})

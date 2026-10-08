import { describe, expect, it } from 'vitest'
import { EVIDENCE_ACCEPT, MAX_EVIDENCE_SIZE, validateEvidenceFiles } from './contract-evidence'

describe('契約核對附件限制', () => {
  const file = (name = '核對依據.jpg', size = 1024) => ({ name, size })

  it('只接受 JPG、PNG、WebP 圖片，副檔名不區分大小寫', () => {
    expect(validateEvidenceFiles([], [file('對話.PNG'), file('收據.JPEG'), file('截圖.webp'), file('照片.jpg')])).toBe('')
  })
  it('連同已選附件計算數量，避免分批加入繞過限制', () => {
    expect(validateEvidenceFiles(Array.from({ length: 4 }, () => file()), [file(), file()])).toContain('5 個')
  })
  it('上傳欄位只列出圖片副檔名', () => {
    expect(EVIDENCE_ACCEPT).toBe('.jpg,.jpeg,.png,.webp')
  })
  it.each(['html', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'])('拒絕 %s 格式', extension => {
    expect(validateEvidenceFiles([], [file('附件.' + extension)])).toBe('請選擇 JPG、PNG 或 WebP 圖片。')
  })
  it('拒絕空檔案', () => {
    expect(validateEvidenceFiles([], [file('empty.png', 0)])).toContain('空白檔案')
  })
  it('允許恰好 10 MB，但拒絕超過單檔上限', () => {
    expect(validateEvidenceFiles([], [file('photo.jpg', MAX_EVIDENCE_SIZE)])).toBe('')
    expect(validateEvidenceFiles([], [file('photo.jpg', MAX_EVIDENCE_SIZE + 1)])).toContain('10 MB')
  })
  it('連同已選附件檢查總容量', () => {
    const large = file('photo.jpg', MAX_EVIDENCE_SIZE)
    expect(validateEvidenceFiles([large, large], [large])).toContain('25 MB')
    expect(validateEvidenceFiles([large, large], [file('notes.png', 5 * 1024 * 1024)])).toBe('')
  })
})

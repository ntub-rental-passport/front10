import { describe, expect, it } from 'vitest'
import { MAX_EVIDENCE_SIZE, validateEvidenceFiles } from './contract-evidence'

describe('契約核對附件限制', () => {
  const file = (name = '核對依據.pdf', size = 1024) => ({ name, size })

  it('接受圖片與文件，副檔名不區分大小寫', () => {
    expect(validateEvidenceFiles([], [file('對話.PNG'), file('契約.docx'), file('收據.pdf')])).toBe('')
  })
  it('連同已選附件計算數量，避免分批加入繞過限制', () => {
    expect(validateEvidenceFiles(Array.from({ length: 4 }, () => file()), [file(), file()])).toContain('5 個')
  })
  it('拒絕不支援的格式及空檔案', () => {
    expect(validateEvidenceFiles([], [file('script.html')])).toContain('請選擇')
    expect(validateEvidenceFiles([], [file('empty.pdf', 0)])).toContain('空白檔案')
  })
  it('允許恰好 10 MB，但拒絕超過單檔上限', () => {
    expect(validateEvidenceFiles([], [file('contract.pdf', MAX_EVIDENCE_SIZE)])).toBe('')
    expect(validateEvidenceFiles([], [file('contract.pdf', MAX_EVIDENCE_SIZE + 1)])).toContain('10 MB')
  })
  it('連同已選附件檢查總容量', () => {
    const large = file('photo.jpg', MAX_EVIDENCE_SIZE)
    expect(validateEvidenceFiles([large, large], [large])).toContain('25 MB')
    expect(validateEvidenceFiles([large, large], [file('notes.pdf', 5 * 1024 * 1024)])).toBe('')
  })
})

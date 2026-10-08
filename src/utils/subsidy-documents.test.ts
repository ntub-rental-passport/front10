import { describe, expect, it } from 'vitest'
import {
  formatExpiry,
  groupByDocType,
  subsidyDocTypes,
  validateSubsidyFile,
} from './subsidy-documents'
import type { SubsidyFile } from '@/src/services/subsidyFileApi'

const file = (id: number, docType: SubsidyFile['docType']): SubsidyFile => ({
  id,
  docType,
  name: `${id}.pdf`,
  contentType: 'application/pdf',
  size: 100,
  rentalId: null,
  createdAt: '2026-10-08T00:00:00Z',
  expiresAt: '2027-04-06T00:00:00Z',
  url: `/api/subsidy/files/${id}`,
})

describe('補助文件工具', () => {
  it('類型和中文標籤符合契約順序，包含租約影本', () => {
    expect(subsidyDocTypes).toEqual([
      { value: 'application_form', label: '申請書' },
      { value: 'identity', label: '身分證明' },
      { value: 'household', label: '戶籍資料' },
      { value: 'lease_copy', label: '租約影本' },
      { value: 'bankbook', label: '存摺封面' },
      { value: 'other', label: '其他' },
    ])
  })
  it('只回非空組別，依類型順序分組，保留每組 API 的新到舊順序', () => {
    const files = [file(3, 'other'), file(2, 'identity'), file(1, 'other')]
    expect(groupByDocType(files)).toEqual([
      { value: 'identity', label: '身分證明', files: [files[1]] },
      { value: 'other', label: '其他', files: [files[0], files[2]] },
    ])
    expect(groupByDocType([])).toEqual([])
  })
  it.each([
    ['2026-10-08T15:59:59Z', '2026-10-08'],
    ['2026-10-08T16:00:00Z', '2026-10-09'],
    ['2026-10-08T23:59:59Z', '2026-10-09'],
    ['2026-12-31T16:00:00Z', '2027-01-01'],
  ])('到期 %s 使用台北日期', (iso, expected) => {
    expect(formatExpiry(iso)).toBe(`將於 ${expected} 自動刪除`)
  })
  it.each(['file.pdf', 'file.jpg', 'file.jpeg', 'file.png', 'FILE.PDF', 'file.JPEG'])(
    '接受 %s 與剛好 10 MB',
    (name) => {
      expect(validateSubsidyFile({ name, size: 10 * 1024 * 1024 })).toBeNull()
    },
  )
  it.each(['file.gif', 'file.webp', 'file.pdf.exe', 'pdf'])('拒絕 %s', (name) => {
    expect(validateSubsidyFile({ name, size: 1 })).toBe('只收 PDF、JPG、PNG 檔案。')
  })
  it('超過 10 MB 顯示伺服器相同訊息', () => {
    expect(validateSubsidyFile({ name: 'file.pdf', size: 10 * 1024 * 1024 + 1 })).toBe(
      '檔案不得超過 10 MB。',
    )
  })
  it('檔名上限以 UTF-8 位元組計算', () => {
    expect(validateSubsidyFile({ name: `${'租'.repeat(159)}ab.pdf`, size: 1 })).toBeNull()
    expect(validateSubsidyFile({ name: `${'租'.repeat(160)}.pdf`, size: 1 })).toBe(
      '檔名過長，請縮短後再上傳。',
    )
  })
})

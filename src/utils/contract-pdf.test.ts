import { describe, expect, it } from 'vitest'
import { contractPdfPassword, contractPdfParagraphs } from './contract-pdf'
import { buildContractDocument, documentValuesFromRental, documentValuesFromFieldReviews } from './contract-document'

describe('加密契約匯出內容與密碼', () => {
  it('將已校對字號統一為大寫，拒絕空白、遮蔽值、錯誤檢查碼與統編', () => {
    expect(contractPdfPassword(' a１２３４５６７８９ ')).toBe('A123456789')
    for (const value of ['', 'A123***789', 'A123456788', '12345678']) expect(() => contractPdfPassword(value)).toThrow()
  })
  it('草稿及已存租約都使用租客字號，不使用房東字號', () => {
    const values = documentValuesFromFieldReviews({tenant_id:{value:'A123456789',sourceValue:'',confidence:'high',reviewState:'verified'}})
    const stored = documentValuesFromRental({tenant_national_id:'A123456789',landlord_national_id:'B123456789'})
    expect(contractPdfPassword(values.tenant_id!)).toBe('A123456789')
    expect(contractPdfPassword(stored.tenant_id!)).toBe('A123456789')
  })
  it('保留所有契約章節、欄位與非簽署正本說明', () => {
    const document = buildContractDocument({tenant:'測試租客',tenant_id:'A123456789',rent:'NT$18,000',deposit:'NT$40,000'})
    const paragraphs = contractPdfParagraphs(document,'測試標題','測試來源')
    const text = paragraphs.map(row=>row.text).join('\n')
    for (const section of document.sections) expect(text).toContain(section.title)
    for (const value of ['測試租客','A123456789','NT$40,000','不等於雙方簽署的契約正本','測試來源']) expect(text).toContain(value)
  })
})

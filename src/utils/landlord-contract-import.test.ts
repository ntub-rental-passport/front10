import { describe, expect, it } from 'vitest'
import { buildContractAutofillData, normalizeContractDate } from './landlord-contract-import'
import type { ContractOcrResult } from './contract-ocr'

function result(text: string): ContractOcrResult {
  return {
    engine: 'test', fileName: '租約.pdf', mimeType: 'application/pdf', size: 10,
    text, pageCount: 1, pageTexts: [text], languageHints: ['zh-TW'], warnings: [],
  }
}

describe('landlord contract OCR autofill', () => {
  it('normalizes ROC and western dates', () => {
    expect(normalizeContractDate('民國 114 年 7 月 14 日')).toBe('2025-07-14')
    expect(normalizeContractDate('2026/09/01')).toBe('2026-09-01')
    expect(normalizeContractDate('民國 114 年 7 月［日期待確認］')).toBe('')
  })

  it('maps extracted tenant and lease fields into the landlord form', () => {
    const data = buildContractAutofillData(result([
      '出租人（甲方）：王房東',
      '承租人（乙方）：李小華',
      '租屋地址：臺北市中正區忠孝東路一段1號',
      '租期自民國113年1月1日起至民國114年1月1日止',
      '月租金新台幣18,000元',
      '租金每月5日前繳納',
      '押金新台幣36,000元',
    ].join('\n')))
    expect(data.tenantName).toBe('李小華')
    expect(data.leaseStart).toBe('2024-01-01')
    expect(data.leaseEnd).toBe('2025-01-01')
    expect(data.monthlyRent).toBe(18000)
    expect(data.depositAmount).toBe(36000)
    expect(data.paymentDay).toBe(5)
  })

  it('prefers reviewed AI values over rule candidates', () => {
    const source = result('承租人（乙方）：辨識錯誤\n月租金新台幣10,000元')
    source.fieldReviews = {
      tenant: { value: '林小明', sourceValue: '林小明', confidence: 'high', reviewState: 'verified' },
    }
    expect(buildContractAutofillData(source).tenantName).toBe('林小明')
  })
})

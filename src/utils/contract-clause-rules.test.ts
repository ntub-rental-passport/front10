import { describe, expect, it } from 'vitest'
import normal from './__fixtures__/normal-lease.json'
import problem from './__fixtures__/problem-lease.json'
import { buildContractAssessments, summarizeAssessments } from './contract-risk'
import { analyzeContractFields } from '../../server/contract-field-gate.js'
import type { ContractFieldReview } from './contract-ocr'

const assess = (pages: string[]) => buildContractAssessments({ text: pages.join('\n'), pageTexts: pages, pageCount: pages.length })
const confirmed = (pages: string[]) => assess(pages).filter((r) => r.status === 'confirmed').map((r) => r.ruleId)

describe('兩份使用者測試契約', () => {
  it('三頁問題契約可在沒有 LLM 及人工校對狀態下辨識明確條款', () => {
    const items = assess(problem)
    const expected = {
      'review-waiver': 0, 'deposit-limit': 0, 'deposit-return-delay': 1,
      'tax-shift': 1, 'termination-deposit-forfeit': 1, 'landlord-termination': 1,
      'household-ban': 2, 'tax-report-ban': 2, 'subsidy-ban': 2,
      'advertisement-disclaimer': 2, 'contract-return': 2,
      'internet-adjustment': 1, 'electricity-objection': 1, 'contract-copy-ban': 2,
    }
    for (const [ruleId, pageIndex] of Object.entries(expected)) {
      expect(items.find((r) => r.ruleId === ruleId), ruleId).toMatchObject({ status: 'confirmed', pageIndex })
    }
    expect(items.find((r) => r.ruleId === 'electricity-reference')).toMatchObject({ status: 'applicability_pending', severity: null })
    expect(items.find((r) => r.ruleId === 'repair-allocation')).toMatchObject({ status: 'applicability_pending', severity: null, priority: true })
    const deposit = items.find((r) => r.ruleId === 'deposit-limit')!
    expect(deposit.clause).toContain('54,000')
    expect(deposit.clause).toContain('18,000')
    expect(deposit.description).toContain('36,000')
    for (const item of items.filter((r) => r.sourceLabel === '契約條款規則')) {
      expect(problem[item.pageIndex!]).toContain(item.focusText)
      for (const detail of item.details ?? []) expect(problem[detail.pageIndex!]).toContain(detail.focusText)
    }
  })
  it('九頁正常契約、保護性附錄及附件不產生規則風險', () => {
    const items = assess(normal)
    expect(items.filter((r) => r.status === 'confirmed')).toEqual([])
    expect(summarizeAssessments(items).total).toBe(0)
  })
  it('套用實際欄位擷取輸出後，超額押金仍成立', () => {
    const text = problem.join('\n')
    const { fieldReviews } = analyzeContractFields({ text, pageTexts: problem, visionPages: [] })
    const items = buildContractAssessments({ text, pageTexts: problem, fieldReviews: fieldReviews as Record<string, ContractFieldReview> })
    expect(items.find((r) => r.ruleId === 'deposit-limit')).toMatchObject({ status: 'confirmed', severity: 'high' })
  })
})

describe('局部否定、更正及數值來源', () => {
  it('電費以帳單為準、無關地址更正不能屏蔽超额押金', () => {
    const text = '每月租金：新臺幣18,000元。押金：以三個月租金計算，共新臺幣54,000元。電費以出租人帳單為準。地址更正為另一地址。'
    expect(confirmed([text])).toContain('deposit-limit')
  })
  it('不把未勾選數值、保護性範本文字或獨立示例當作押金', () => {
    for (const text of ['□押金：三個月租金。■押金：二個月租金。', '範例：押金：三個月租金。', '不得約定押金：三個月租金。']) {
      expect(confirmed([text])).not.toContain('deposit-limit')
    }
  })
  it('同主題更正及兩處押金矛盾保留待核對', () => {
    for (const text of ['押金：三個月租金。雙方更正押金為二個月租金。', '押金：三個月租金。押金：二個月租金。']) {
      expect(assess([text]).find((r) => r.ruleId === 'deposit-limit')).toMatchObject({ severity: null, status: 'recognition_pending' })
    }
  })
  it('未勾選禁止條款不阻擋勾選條款；同句否定不誤報', () => {
    expect(confirmed(['□承租人不得申請租金補貼。☑承租人同意不得遷入戶籍。'])).toEqual(['household-ban'])
    expect(confirmed(['出租人不得禁止承租人申請租金補貼。承租人未同意放棄審閱權。'])).toEqual([])
  })
  it('跨頁仍保留來源，不把前頁的保護性前綴遺漏', () => {
    expect(confirmed(['不得記載', '承租人不得申請租金補貼。'])).toEqual([])
    const items = assess(['承租人同意放棄任何契約', '審閱期間之權利。'])
    expect(items.find((r) => r.ruleId === 'review-waiver')?.details?.map((d) => d.pageIndex)).toEqual([0, 1])
  })
  it('不得記載事項整個附錄不當作實際義務', () => {
    expect(confirmed(['貳、不得記載事項\n一、承租人不得申請租金補貼。二、承租人不得遷入戶籍。'])).toEqual([])
  })
  it('合法稅費、修繕例外、欠租兩個月及廣告有契約效力不誤報', () => {
    expect(confirmed(['房屋稅、地價稅由出租人負擔。已確認可歸責承租人的設備損壞由承租人修繕。承租人積欠租金總額達二個月，經催告仍未支付，依法通知終止。廣告視為契約一部分。'])).toEqual([])
  })
  it('同句不同費用責任不視為稅費轉嫁，押金混入首月租金先待確認', () => {
    expect(confirmed(['房屋稅與地價稅由出租人負擔，管理費由承租人負擔。'])).toEqual([])
    expect(assess(['每月租金：18000元。押金：54000元，其中包含首月租金18000元。']).find((r) => r.ruleId === 'deposit-limit')?.status).toBe('recognition_pending')
  })
  it('押金月數與金額互相矛盾，不強行選一個數值判高風險', () => {
    const items = assess(['每月租金：新臺幣18,000元。押金：二個月租金，共新臺幣54,000元。'])
    expect(items.find((r) => r.ruleId === 'deposit-limit')).toMatchObject({ status: 'recognition_pending', severity: null })
  })
})

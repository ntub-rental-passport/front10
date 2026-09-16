import { describe, expect, it } from 'vitest'
import { buildContractAssessments, evaluateRiskMetrics, gateRemoteAssessments, summarizeAssessments } from './contract-risk'
import { getPropertyIdentification } from '@/shared/contract-applicability.js'
import { extractContractFieldCandidates } from '@/shared/contract-field-extraction.js'
import { isValidContractFieldFormat } from '@/shared/contract-field-validation.js'
import type { ContractFieldReview } from './contract-ocr'
import { existsSync, readFileSync } from 'node:fs'

const review = (value: string, sourceValue: string): ContractFieldReview => ({ value, sourceValue, confidence: 'high', reviewState: 'verified' })
const assess = (text: string, fieldReviews: Record<string, ContractFieldReview> = {}, pageTexts = [text]) => buildContractAssessments({ text, pageTexts, fieldReviews })
const rules = (text: string) => assess(text).filter((item) => item.status === 'confirmed').map((item) => item.ruleId)

describe('適用性先於缺漏與風險', () => {
  it('有門牌及替代欄位不適用，不觸發稅籍缺漏；辨識陽臺', () => {
    const text = '房屋門牌地址：臺北市中山區中山路123號。房屋有門牌，無\n門牌房屋稅籍替代欄位：不適用。附屬建物：陽臺，面積8.00平方公尺。'
    expect(getPropertyIdentification(text).state).toBe('has_door')
    expect(extractContractFieldCandidates(text).accessory_purpose.value).toBe('陽臺')
    const items = assess(text)
    expect(items.filter((item) => item.fieldIds.includes('tax_id')).map((item) => item.status)).toEqual(['not_applicable'])
    expect(items.some((item) => item.fieldIds.includes('accessory_purpose'))).toBe(false)
    expect(summarizeAssessments(items).high).toBe(0)
  })
  it.each(['無門牌者應提供房屋稅籍編號或位置略圖。', '房屋稅籍替代欄位：不適用。'])('制式標籤不能確定適用性：%s', (text) => {
    expect(getPropertyIdentification(text).state).toBe('unknown')
    expect(assess(text).find((item) => item.id === 'property-identification')?.status).toBe('applicability_pending')
  })
  it('無門牌不能單憑不適用跳過；略圖引用仍需核對', () => {
    for (const text of ['房屋無門牌。房屋稅籍編號：不適用。', '房屋無門牌。位置略圖見附件二。']) {
      expect(assess(text).find((item) => item.id === 'property-identification')?.priority).toBe(true)
      expect(summarizeAssessments(assess(text)).high).toBe(0)
    }
    expect(assess('房屋無門牌。房屋稅籍編號：12345678。').some((item) => item.id === 'property-identification')).toBe(false)
    const text = '房屋無門牌。位置略圖見附件二。'
    expect(assess(text, { tax_id: review('位置略圖見附件二', '位置略圖見附件二') }).some((item) => item.id === 'property-identification')).toBe(false)
  })
  it('矛盾門牌狀態維持待確認', () => {
    expect(getPropertyIdentification('房屋有門牌。房屋無門牌。').state).toBe('unknown')
  })
})

describe('可追溯的數值規則', () => {
  it('兩日格式有效，已核對原文才觸發審閱期規則', () => {
    expect(isValidContractFieldFormat('days', '2 日')).toBe(true)
    const text = '審閱日數：2日。'
    expect(assess(text, { review_days: review('2 日', text) }).find((item) => item.ruleId === 'review-period')?.severity).toBe('high')
    expect(assess(text).find((item) => item.id === 'review-check')?.status).toBe('recognition_pending')
  })
  it('日期16日誤當審閱日數，是擷取待確認', () => {
    const text = '審閱日期：民國115年09月16日。審閱日數\n：5日。'
    const items = assess(text, { review_days: review('16 日', '民國115年09月16日') })
    expect(items.some((item) => item.status === 'recognition_pending' && item.fieldIds.includes('review_days'))).toBe(true)
    expect(summarizeAssessments(items).high).toBe(0)
  })
  it('核對租金與押金才判超額；更正及證據不足留待核對', () => {
    const text = '每月租金：新臺幣18,000元整。押金金額：新臺幣54,000元整。'
    const fields = { rent: review('NT$18,000', '每月租金：新臺幣18,000元整'), deposit: review('NT$54,000', '押金金額：新臺幣54,000元整') }
    expect(assess(text, fields).find((item) => item.ruleId === 'deposit-limit')?.severity).toBe('high')
    expect(summarizeAssessments(assess(text)).high).toBe(1)
    expect(summarizeAssessments(assess(text + '双方更正押金為36,000元。', fields)).high).toBe(0)
    expect(summarizeAssessments(assess(text, { ...fields, deposit: review('NT$54,000', '找不到的原文') })).high).toBe(0)
    expect(summarizeAssessments(assess('每月租金：18,000元。設備買賣價款：54,000元。')).high).toBe(0)
  })
})

describe('實際約定、否定及範本', () => {
  it.each([
    '不得記載承租人不得申請租金補貼。',
    '出租人不得禁止承租人申請租金補貼。',
    '出租人未要求承租人同意放棄審閱權。',
    '範例：承租人不得申請租金補貼。',
    '□承租人不得申請租金補貼。',
    '原約定承租人不得申請租金補貼，雙方更正為可申請。',
  ])('保護性條文或非生效選項不報高風險：%s', (text) => expect(rules(text)).toEqual([]))
  it.each(['承租人不得申請租金補貼。', '☑承租人不得申請租金補貼。'])('明確禁止租補觸發規則：%s', (text) => expect(rules(text)).toContain('subsidy-ban'))
  it('明確放棄審閱觸發規則並保留頁碼', () => {
    const items = assess('封面。\n承租人同意放棄審閱權。', {}, ['封面。', '承租人同意放棄審閱權。'])
    expect(items.find((item) => item.ruleId === 'review-waiver')).toMatchObject({ severity: 'high', pageIndex: 1, focusText: '承租人同意放棄審閱權' })
  })
  it('跨頁的保護性前綴仍有效，實際義務可完整定位兩頁', () => {
    const protectedPages = ['不得記載', '承租人不得申請租金補貼。']
    expect(summarizeAssessments(assess(protectedPages.join('\n'), {}, protectedPages)).high).toBe(0)
    const actualPages = ['承租人不得申請', '租金補貼。']
    const items = assess(actualPages.join('\n'), {}, actualPages)
    expect(items.find((item) => item.ruleId === 'subsidy-ban')?.details?.map((d) => d.pageIndex)).toEqual([0, 1])
    expect(summarizeAssessments(items).high).toBe(1)
  })
  it('引用、條件與後續更正不直接確認禁止條款', () => {
    for (const text of ['「承租人不得申請租金補貼」為無效約定。', '若承租人同意放棄審閱權，仍應另行確認。', '承租人不得申請租金補貼。雙方更正為可以申請。']) {
      expect(summarizeAssessments(assess(text)).high).toBe(0)
    }
  })
  it('實質費用歧義中風險；其他頁已有費用則待確認', () => {
    expect(rules('車位費另計。')).toContain('parking-fee-unclear')
    expect(rules('車位費另計。附件：車位費：300元。')).not.toContain('parking-fee-unclear')
    expect(rules('車位費另計。車位管理費每月300元。')).not.toContain('parking-fee-unclear')
    expect(buildContractAssessments({ text: '車位費另計。', pageTexts: ['車位費另計。'], pageCount: 9 }).find((item) => item.ruleId === 'parking-fee-unclear')?.status).toBe('applicability_pending')
  })
  it('低風險需要具體問題；電價八元仍需比對帳單', () => {
    expect(rules('設備清單未記錄既有刮傷。')).toContain('equipment-record')
    expect(rules('設備清單已記錄數量與現況。')).toEqual([])
    const items = assess('電費每度8元。')
    expect(items.find((item) => item.ruleId === 'electricity-reference')?.status).toBe('applicability_pending')
    expect(summarizeAssessments(items).total).toBe(0)
  })
})

it.skipIf(!existsSync('logs/contract-pages-verification.json'))('本機九頁 PDF 文字回歸：稅籍與陽臺不產生缺漏風險', () => {
  const pageTexts = JSON.parse(readFileSync('logs/contract-pages-verification.json', 'utf8')) as string[]
  const items = assess(pageTexts.join('\n'), {}, pageTexts)
  expect(pageTexts).toHaveLength(9)
  expect(summarizeAssessments(items).high).toBe(0)
  expect(items.filter((item) => item.fieldIds.includes('tax_id')).map((item) => item.status)).toEqual(['not_applicable'])
  expect(items.some((item) => item.fieldIds.includes('accessory_purpose'))).toBe(false)
})

describe('AI 候選與成效統計', () => {
  it('模型高信心、法條引用及自行指定頁碼都不能直接分級', () => {
    const items = gateRemoteAssessments([{ title: '疑慮', severity: 'high', confidence: 0.99, pageIndex: 0, clause: '不存在原文', legalBasis: ['L01'] }], 'rag', ['實際契約'])
    expect(items[0]).toMatchObject({ severity: null, status: 'recognition_pending', pageIndex: null, priority: true })
    expect(summarizeAssessments(items)).toMatchObject({ total: 0, pending: 1 })
    expect(gateRemoteAssessments([{ title: '補充', clause: '實際契約' }], 'ai', ['實際契約'])[0]?.status).toBe('suggestion')
  })
  it('精確率、召回率、不適用誤報率與待確認案件比例獨立計算', () => {
    const metrics = evaluateRiskMetrics([
      { items: assess('承租人不得申請租金補貼。'), highRuleIds: ['subsidy-ban'] },
      { items: assess('房屋有門牌。'), highRuleIds: [], inapplicableFieldIds: ['tax_id'] },
      { items: assess('未辨識文字'), highRuleIds: ['review-waiver'] },
    ])
    expect(metrics).toMatchObject({ tp: 1, fp: 0, fn: 1, highPrecision: 1, highRecall: 0.5, inapplicableFalsePositiveRate: 0, pendingCaseRate: 1 })
    expect(evaluateRiskMetrics([]).highPrecision).toBeNull()
  })
})

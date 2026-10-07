import { describe, expect, it } from 'vitest'
import { buildContractAssessments, evaluateRiskMetrics, gateRemoteAssessments, reconcileAssessments, isPendingAssessment, summarizeAssessments } from './contract-risk'
import { getPropertyIdentification } from '@/shared/contract-applicability.js'
import { extractContractFieldCandidates } from '@/shared/contract-field-extraction.js'
import { isValidContractFieldFormat } from '@/shared/contract-field-validation.js'
import type { ContractFieldReview } from './contract-ocr'
import { existsSync, readFileSync } from 'node:fs'
import { analyzeContractFields } from '../../server/contract-field-gate.js'

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
  const rentClause = '第三條 租金約定及支付\n承租人每月租金為新臺幣 NT$18,000，每期應繳納1個月，並於每月5日前支付。'
  const depositClauses = [
    '第四條 押金約定及返還\n押金由租賃雙方約定為2個月租金，金額為新臺幣 NT$40,000（最高不得超過二個月租金之總額）。',
    '第四條 押金約定及返還\nNT$40,000（最高不得超過二個月租金之總額）。',
  ]
  it.each(depositClauses)('金額無元字仍確認超額，不被兩個月制式文字抵消：%s', (depositClause) => {
    const pageTexts = [rentClause, depositClause]
    const text = pageTexts.join('\n')
    const { fieldReviews } = analyzeContractFields({ text, pageTexts, visionPages: [] })
    expect(fieldReviews.deposit.value).toBe('NT$40,000')
    const risk = assess(text, fieldReviews as Record<string, ContractFieldReview>, pageTexts).find((item) => item.ruleId === 'deposit-limit')
    expect(risk).toMatchObject({ status: 'confirmed', severity: 'high' })
    expect(risk?.metrics).toContainEqual({ label: '超出兩個月部分', value: 4000 })
    expect(risk?.details?.map((entry) => entry.pageIndex)).toEqual([0, 1])
    for (const entry of risk!.details!) expect(pageTexts[entry.pageIndex!]).toContain(entry.focusText)
  })
  it('上限內、修訂金額與混列費用不誤報為已確認超額', () => {
    expect(rules(`${rentClause}${depositClauses[0]!.replace('40,000', '36,000')}`)).not.toContain('deposit-limit')
    expect(rules(`${rentClause}${depositClauses[0]}雙方更正押金為36,000元。`)).not.toContain('deposit-limit')
    expect(rules(`${rentClause}押金金額：NT$40,000，包含預付租金。`)).not.toContain('deposit-limit')
    expect(rules(`${rentClause}押金金額：NT$40,000。押金金額：NT$36,000。`)).not.toContain('deposit-limit')
    expect(rules(`${rentClause}第四條 押金約定及返還\n設備費NT$40,000。`)).not.toContain('deposit-limit')
  })
  it.skipIf(!existsSync('outputs/deposit-pdf-pages.json'))('使用者新北市契約文字層：完整欄位流程確認超額4000元', () => {
    const pageTexts = JSON.parse(readFileSync('outputs/deposit-pdf-pages.json', 'utf8')) as string[]
    const text = pageTexts.join('\n\n')
    const { fieldReviews } = analyzeContractFields({ text, pageTexts, visionPages: [] })
    const risk = assess(text, fieldReviews as Record<string, ContractFieldReview>, pageTexts).find((item) => item.ruleId === 'deposit-limit')
    expect(risk).toMatchObject({ severity: 'high', status: 'confirmed' })
    expect(risk?.metrics).toContainEqual({ label: '超出兩個月部分', value: 4000 })
    expect(risk?.details?.every((entry) => entry.pageIndex === 1)).toBe(true)
  })
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
    expect(summarizeAssessments(assess(text, { ...fields, deposit: review('NT$54,000', '找不到的原文') })).high).toBe(1)
    expect(summarizeAssessments(assess(text, { ...fields, deposit: review('NT$36,000', '找不到的原文') })).high).toBe(0)
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
  it('同一原文的審閱期規則與 AI 候選只顯示規則；不同問題保留', () => {
    const clause = '審閱日數：1日（契約審閱期間至少三日）。'
    const local = assess(clause, { review_days: review('1 日', clause) })
    const remote = gateRemoteAssessments([
      { title: '契約審閱期間不足三日', clause, description: '只有1日' },
      { title: '契約審閱期間不足三日', clause: '另一處的審閱期間及附件有爭議' },
      { title: '審閱簽章待確認', clause },
    ], 'rag', [clause])
    const merged = reconcileAssessments([...remote, ...local])
    expect(merged.some((entry) => entry.id === 'rag-0')).toBe(false)
    expect(merged.some((entry) => entry.id === 'rag-1')).toBe(true)
    expect(merged.some((entry) => entry.id === 'rag-2')).toBe(true)
    expect(merged.some((entry) => entry.ruleId === 'review-period' && entry.status === 'confirmed')).toBe(true)
  })
  it('待確認包含 AI 建議，摘要與分頁共用計數；AI 空回應仍保留押金風險', () => {
    const text = '每月租金：NT$18,000。押金金額：NT$40,000。'
    const local = assess(text, { rent: review('NT$18,000', ''), deposit: review('NT$40,000', '舊的欄位定位') })
    const remote = gateRemoteAssessments([
      { title: '押金金額超收', clause: '押金金額：NT$40,000。' },
      { title: '押金返還程序需要確認', clause: '押金金額：NT$40,000。' },
    ], 'ai', [text])
    const merged = reconcileAssessments([...local, ...remote])
    expect(merged.some((entry) => entry.id === 'ai-0')).toBe(false)
    expect(merged.some((entry) => entry.id === 'ai-1')).toBe(true)
    expect(summarizeAssessments(merged).pending).toBe(merged.filter(isPendingAssessment).length)
    expect(summarizeAssessments(reconcileAssessments([...local, ...gateRemoteAssessments([], 'ai', [text])])).high).toBe(1)
  })
  it.each([
    'missing house tax ID or position diagram',
    'deposit amount ambiguous and possibly exceeds legal limit',
    'management fee clause unclear（第五條）',
  ])('英文標題 %s 使用中文說明摘要，保留證據與待確認狀態', (title) => {
    const description = '契約相關約定需要進一步核對。請確認原文。'
    const [entry] = gateRemoteAssessments([{ title, description, clause: '原文', severity: 'high' }], 'rag', ['原文'])
    expect(entry).toMatchObject({ title: '契約相關約定需要進一步核對', description, clause: '原文', priority: true, status: 'recognition_pending', severity: null })
  })
  it('保留中文標題；全英文結果顯示中性標題而不捏造翻譯', () => {
    const entries = gateRemoteAssessments([{ title: 'AI 建議核對押金', description: '說明' }, { title: 'unclear terms', description: 'Please check the contract.' }], 'ai', [])
    expect(entries.map((entry) => entry.title)).toEqual(['AI 建議核對押金', '契約條款待確認'])
  })
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

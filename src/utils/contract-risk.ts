import { CONTRACT_FIELD_DEFINITIONS, CONTRACT_FIELD_GROUPS, detectContractConditions } from '@/shared/contract-field-schema.js'
import { getPropertyIdentification } from '@/shared/contract-applicability.js'
import { extractContractFieldCandidates } from '@/shared/contract-field-extraction.js'
import { isValidContractFieldFormat } from '@/shared/contract-field-validation.js'
import type { ContractOcrResult } from './contract-ocr'

export type AssessmentStatus = 'confirmed' | 'recognition_pending' | 'applicability_pending' | 'not_applicable' | 'suggestion'
export type ContractAssessment = {
  id: string
  title: string
  status: AssessmentStatus
  severity: 'high' | 'medium' | 'low' | null
  source: 'field' | 'rag' | 'ai'
  sourceLabel: string
  groupId: string | null
  groupLabel: string | null
  fieldIds: string[]
  pageIndex: number | null
  focusText: string
  clause: string
  description: string
  advice: string
  legalBasis?: string[]
  priority?: boolean
  ruleId?: string
  ruleVersion?: string
  details?: Array<{ label: string; pageIndex: number | null; focusText: string }>
}

export const RISK_RULE_VERSION = '2026-09-16.1'
export const LEGAL_REFERENCE = {
  version: '114-04-18',
  url: 'https://www.ey.gov.tw/Page/DFB720D019CCCB0A/478917df-7599-418f-8715-fd2716b623b4',
}
export const assessmentLabels: Record<AssessmentStatus, string> = {
  confirmed: '規則檢核成立', recognition_pending: '辨識待確認',
  applicability_pending: '適用性待確認', not_applicable: '不適用', suggestion: '補充建議',
}
const compact = (text: string) => text.replace(/\s/g, '').replace(/臺/g, '台')
const populated = (text?: string) => Boolean(text && !/^(?:尚未辨識|不適用|均不適用|無)$/.test(text.trim()))
const amount = (value: string) => Number(value.replace(/[^0-9.]/g, ''))

function locate(pages: string[], source: string) {
  if (!source) return null
  for (const [pageIndex, page] of pages.entries()) {
    const direct = page.indexOf(source)
    if (direct >= 0) return { pageIndex, focusText: source }
    const positions: number[] = []
    let normalized = ''
    for (let i = 0; i < page.length; i++) {
      if (/\s/.test(page[i]!)) continue
      positions.push(i)
      normalized += page[i]!.replace(/臺/g, '台')
    }
    const index = normalized.indexOf(compact(source))
    if (index >= 0) return { pageIndex, focusText: page.slice(positions[index], positions[index + compact(source).length - 1]! + 1) }
  }
  return null
}

function item(id: string, title: string, status: AssessmentStatus, overrides: Partial<ContractAssessment> = {}): ContractAssessment {
  return { id, title, status, severity: null, source: 'field', sourceLabel: '關鍵欄位檢核',
    groupId: null, groupLabel: null, fieldIds: [], pageIndex: null, focusText: '', clause: '',
    description: '', advice: '請核對完整契約及相關附件。', ...overrides }
}

export function buildContractAssessments(input: Partial<ContractOcrResult> | null): ContractAssessment[] {
  const text = input?.text ?? ''
  const pages = input?.pageTexts?.length ? input.pageTexts : [text]
  const completePages = pages.length >= (input?.pageCount ?? pages.length) && pages.every((page) => page.trim())
  const reviews = input?.fieldReviews ?? {}
  const fresh = extractContractFieldCandidates(text)
  const conditions = detectContractConditions(text) as Record<string, boolean>
  const property = getPropertyIdentification(text)
  const results: ContractAssessment[] = []
  const pending = new Map<string, ContractAssessment>()
  const addPending = (id: string, title: string, status: AssessmentStatus, fieldIds: string[], description: string, priority = false) => {
    const value = fieldIds.map((key) => reviews[key]?.sourceValue || fresh[key]?.sourceValue).find(Boolean) ?? ''
    results.push(item(id, title, status, { fieldIds, description, priority, ...(locate(pages, value) ?? {}), clause: value }))
  }

  if (property.state === 'has_door') {
    results.push(item('tax-not-applicable', '房屋稅籍替代資料：不適用', 'not_applicable', {
      groupId: 'property', groupLabel: '租賃住宅標示', fieldIds: ['tax_id'],
      description: '契約已載明門牌，無門牌的稅籍編號／位置略圖替代欄位不列缺漏。',
      ...(locate(pages, property.address) ?? {}), clause: property.address,
    }))
  } else {
    const reviewedSketch = reviews.tax_id && /verified|edited/.test(reviews.tax_id.reviewState)
      && /略圖|示意圖/.test(reviews.tax_id.value) && locate(pages, reviews.tax_id.sourceValue)
    if (property.state === 'unknown' || (!property.taxId && !reviewedSketch)) {
      addPending('property-identification', '確認門牌或替代位置資料', 'applicability_pending', ['address', 'tax_id'],
        property.state === 'unknown' ? '尚不能確認有無門牌；替代欄位名稱或「不適用」本身不能證明適用性。'
          : '契約載明無門牌。請確認稅籍編號，或核對附件略圖是否足以辨識實際位置；僅引用附件不代表已核對。', true)
    }
  }
  for (const definition of CONTRACT_FIELD_DEFINITIONS) {
    if (definition.id === 'tax_id') continue // Tax ID OR a usable sketch; never require both.
    if (definition.requirement === 'recommended') continue
    if (definition.condition && !conditions[definition.condition]) continue
    const current = reviews[definition.id]
    const candidate = fresh[definition.id]
    const value = populated(current?.value) ? current!.value : candidate?.value
    const formatValid = value && isValidContractFieldFormat(definition.format, value, definition.options)
    const evidence = locate(pages, current?.sourceValue || candidate?.sourceValue || '')
    const conflicting = populated(current?.value) && populated(candidate?.value)
      && compact(current!.value) !== compact(candidate.value)
    if (populated(value) && formatValid && evidence && !conflicting) continue
    const group = CONTRACT_FIELD_GROUPS.find((entry) => entry.id === definition.groupId)
    let entry = pending.get(definition.groupId)
    if (!entry) {
      entry = item(`check-${definition.groupId}`, `${group?.title ?? '契約欄位'}待核對`, 'recognition_pending', {
        groupId: definition.groupId, groupLabel: group?.title ?? '', details: [],
        description: '目前擷取或來源證據不足，不能據此認定契約未記載，更不直接列為高風險。請核對各頁及附件。',
      })
      pending.set(definition.groupId, entry)
    }
    entry.fieldIds.push(definition.id)
    entry.details!.push({ label: definition.label, pageIndex: evidence?.pageIndex ?? null, focusText: evidence?.focusText ?? '' })
  }
  results.push(...pending.values())

  const corroborated = (id: string) => {
    const review = reviews[id]
    return Boolean(review && populated(review.value) && fresh[id]?.value
      && compact(review.value) === compact(fresh[id].value)
      && locate(pages, review.sourceValue)
      && locate(pages, fresh[id].sourceValue)
      && (compact(review.sourceValue).includes(compact(fresh[id].sourceValue))
        || compact(fresh[id].sourceValue).includes(compact(review.sourceValue)))
      && (['verified', 'edited'].includes(review.reviewState) || (review.confidence === 'high' && (review.googleConfidence ?? 0) >= 0.85)))
  }
  const confirm = (ruleId: string, title: string, severity: 'high' | 'medium' | 'low', fieldIds: string[], clause: string, advice: string) => {
    results.push(item(ruleId, title, 'confirmed', {
      severity, fieldIds, clause, ...(locate(pages, clause) ?? {}),
      description: '此項依適用條件及契約原文觸發規則；風險等級為系統依可能影響所作的分類。', advice,
      ruleId, ruleVersion: RISK_RULE_VERSION,
      legalBasis: [`住宅租賃定型化契約應記載及不得記載事項（${LEGAL_REFERENCE.version}） ${LEGAL_REFERENCE.url}`],
    }))
  }
  const rent = amount(reviews.rent?.value || fresh.rent?.value || '')
  const deposit = amount(reviews.deposit?.value || fresh.deposit?.value || '')
  const months = amount(reviews.deposit_months?.value || fresh.deposit_months?.value || '')
  if (months > 2 || (rent > 0 && deposit > rent * 2)) {
    const trusted = months > 2 ? corroborated('deposit_months') : corroborated('rent') && corroborated('deposit')
    const source = reviews.deposit_months?.sourceValue || reviews.deposit?.sourceValue || fresh.deposit?.sourceValue || ''
    if (trusted && !/更正|改為|以.*為準/.test(text)) confirm('deposit-limit', '押金超過兩個月租金', 'high', ['rent', 'deposit', 'deposit_months'], source, '簽約前請釐清並修正押金約定及返還方式。')
    else addPending('deposit-check', '優先核對：押金可能涉及重大金錢權益', 'recognition_pending', ['rent', 'deposit'], '押金數值、来源或更正關係尚未核實，暫不計入高風險。', true)
  }
  const days = reviews.review_days?.value || fresh.review_days?.value || ''
  if (/^\d+\s*日$/.test(days) && amount(days) < 3) {
    if (corroborated('review_days') && !/更正|改為|以.*為準/.test(text)) confirm('review-period', '約定審閱期少於三日', 'high', ['review_days'], reviews.review_days!.sourceValue, '簽約前確認實際交付與審閱時間，修正審閱期約定。')
    else addPending('review-check', '優先核對：審閱期可能不足', 'recognition_pending', ['review_days'], '日數格式有效，但需要核對原文與來源後才能分級。', true)
  }

  // Only affirmative, selected contract language can trigger a rule. Protective
  // regulations and explanations are not contractual prohibitions.
  // Join pages before interpreting sentences: a protective prefix on the previous
  // page must not turn into a prohibition on the next one.
    for (const raw of pages.join('\n').split(/[。；;]/)) {
      const sentence = compact(raw)
      if (/不得記載|不得約定|禁止(?:記載|約定)|不得要求|未要求|不要求|無須|未禁止|不(?:得|能)禁止|並非|不是|範例|示例|例如|原約定|更正|改為|以.*為準/.test(sentence)) continue
      const actual = sentence.includes('□') ? sentence.split(/(?=[□■☑✓])/).filter((part) => /^[■☑✓]/.test(part)).join('；') : sentence
      const evidence = locate(pages, raw.trim())
      const pageIndex = evidence?.pageIndex ?? null
      const addClause = (ruleId: string, title: string, severity: 'high' | 'medium' | 'low', advice: string) => {
        if (results.some((entry) => entry.ruleId === ruleId)) return
        if (!evidence || /更正|改為|以.*為準|[「」『』]|如果|假設|若/.test(raw) || /更正|改為|以.*為準/.test(text)) {
          results.push(item(`check-${ruleId}`, title, 'recognition_pending', { clause: raw.trim(), ...(evidence ?? {}), advice,
            description: '跨頁來源、引述、適用條件或更正關係需要核對，暫不計入已確認風險。', priority: severity === 'high' }))
          return
        }
        confirm(ruleId, title, severity, [], raw.trim(), advice)
      }
      if (/(?:承租人|房客)(?:不得|不可|禁止)申請租(?:金補貼|補)/.test(actual)) addClause('subsidy-ban', '契約限制承租人申請租金補貼', 'high', '簽約前要求釐清並刪除禁止申請租金補貼的約定。')
      if (/(?:承租人|房客)(?:同意|應|須)放棄審閱(?:期|權)/.test(actual)) addClause('review-waiver', '契約要求放棄審閱', 'high', '簽約前保留審閱時間，修正放棄審閱的約定。')
      if (/車位(?:費|租金|管理費)[：:]?另計/.test(actual) && !/[0-9０-９]+元|依.*(?:帳單|公告|費率)|計算方式|另附/.test(actual)) {
        if (!completePages || /車位(?:費|租金|管理費)[^。；;]{0,25}(?:[0-9０-９,，]+元|含.{0,8}租金)|更正|另附|見附件|詳附件/.test(compact(text))) addPending('parking-fee-check', '車位費用計算方式待核對', 'applicability_pending', [], '其他頁面或附件可能已有費用約定，先核對交叉引用。')
        else addClause('parking-fee-unclear', '車位費另計但未明確約定計算方式', 'medium', '請雙方補充金額、計算方式及繳納時間。')
      }
      if (/設備清單.*(?:未記錄|未載明)(?:既有)?(?:刮傷|損傷)/.test(actual)) addClause('equipment-record', '設備既有損傷尚未記錄', 'low', '點交時拍照並共同記錄既有損傷。')
      if (/電費.*(?:每度|每期每度)[：:]?[0-9０-９.]+元/.test(actual) && !results.some((entry) => entry.id === 'electricity-reference')) {
        results.push(item('electricity-reference', '電費需比對當期帳單', 'applicability_pending', { pageIndex, clause: raw.trim(), focusText: raw.trim(), description: '僅有每度金額不能確認超收，需比對當期每度平均電價及計費方式。' }))
      }
    }
  return results
}

// Neither an LLM confidence score nor a retrieved statute proves a violation.
export function gateRemoteAssessments(items: unknown, source: 'rag' | 'ai', pages: string[]): ContractAssessment[] {
  if (!Array.isArray(items)) return []
  return items.slice(0, 30).filter((raw) => raw && typeof raw.title === 'string').map((raw, index) => {
    const clause = typeof raw.clause === 'string' ? raw.clause.slice(0, 2000) : ''
    const evidence = locate(pages, clause)
    return item(`${source}-${index}`, raw.title.slice(0, 200), source === 'ai' && evidence ? 'suggestion' : 'recognition_pending', {
      source, sourceLabel: source === 'rag' ? 'RAG 候選疑慮' : 'AI 補充建議', clause,
      description: String(raw.description ?? '').slice(0, 2000), advice: String(raw.advice ?? '').slice(0, 2000),
      ...(evidence ?? {}), priority: raw.severity === 'high' || raw.priority === true,
      legalBasis: Array.isArray(raw.legalBasis) ? raw.legalBasis.filter((v: unknown) => typeof v === 'string') : [],
    })
  })
}

export function summarizeAssessments(items: ContractAssessment[]) {
  const confirmed = items.filter((entry) => entry.status === 'confirmed' && entry.severity)
  return { total: confirmed.length, high: confirmed.filter((entry) => entry.severity === 'high').length,
    medium: confirmed.filter((entry) => entry.severity === 'medium').length,
    low: confirmed.filter((entry) => entry.severity === 'low').length,
    pending: items.filter((entry) => ['recognition_pending', 'applicability_pending'].includes(entry.status)).length }
}

export function evaluateRiskMetrics(cases: Array<{ items: ContractAssessment[]; highRuleIds: string[]; inapplicableFieldIds?: string[] }>) {
  let tp = 0, fp = 0, fn = 0, inapplicable = 0, falseApplicable = 0, pendingCases = 0
  for (const row of cases) {
    const predicted = new Set(row.items.filter((entry) => entry.status === 'confirmed' && entry.severity === 'high').map((entry) => entry.ruleId))
    const expected = new Set(row.highRuleIds)
    for (const id of predicted) expected.has(id ?? '') ? tp++ : fp++
    for (const id of expected) if (!predicted.has(id)) fn++
    for (const fieldId of row.inapplicableFieldIds ?? []) {
      inapplicable++
      if (row.items.some((entry) => ['confirmed', 'recognition_pending'].includes(entry.status) && entry.fieldIds.includes(fieldId))) falseApplicable++
    }
    if (row.items.some((entry) => ['recognition_pending', 'applicability_pending'].includes(entry.status))) pendingCases++
  }
  return { highPrecision: tp + fp ? tp / (tp + fp) : null, highRecall: tp + fn ? tp / (tp + fn) : null,
    inapplicableFalsePositiveRate: inapplicable ? falseApplicable / inapplicable : null,
    pendingCaseRate: cases.length ? pendingCases / cases.length : null, tp, fp, fn, cases: cases.length }
}

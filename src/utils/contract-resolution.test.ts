import { describe, expect, it } from 'vitest'
import { buildContractAssessments } from './contract-risk'
import { assessmentKey, evidenceKey, isDismissed, reconcileRecord, type ResolutionRecord } from './contract-resolution'

describe('處理紀錄與重新檢查', () => {
  const risks = buildContractAssessments({ text:'承租人不得申請租金補貼。', pageTexts:['承租人不得申請租金補貼。'] })
  const risk = risks.find(r => r.ruleId === 'subsidy-ban')!
  const record: ResolutionRecord = {id:'one',rule:assessmentKey(risk),title:risk.title,action:'discussed',note:'與房東核對',at:'2026-09-17',evidence:evidenceKey(risk)}
  it('溝通或修正請求不直接移除風險', () => {
    expect(isDismissed(risk,[record])).toBe(false)
    expect(isDismissed(risk,[{...record,action:'correct'}])).toBe(false)
    expect(reconcileRecord({...record,action:'correct'},risks)).toContain('仍需處理')
  })
  it('不適用只對當時證據有效，可恢復檢查', () => {
    const dismissed = {...record,action:'not_applicable' as const}
    expect(isDismissed(risk,[dismissed])).toBe(true)
    expect(isDismissed(risk,[dismissed,record])).toBe(true)
    expect(isDismissed({...risk,clause:'新約定'},[dismissed])).toBe(false)
    expect(isDismissed(risk,[dismissed,{...record,action:'reopen'}])).toBe(false)
  })
  it('修正原文後必須重新評估，原處理紀錄仍保留', () => {
    const corrected = buildContractAssessments({text:'出租人不得禁止承租人申請租金補貼。',pageTexts:['出租人不得禁止承租人申請租金補貼。']})
    expect(reconcileRecord({...record,action:'correct'},corrected)).toContain('不再命中')
    expect(record.evidence).toContain('不得申請租金補貼')
  })
})

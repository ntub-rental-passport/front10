import type { ContractAssessment } from './contract-risk'

export type ResolutionRecord = {
  id: string; rule: string; title: string; action: 'correct' | 'not_applicable' | 'discussed' | 'reopen';
  note: string; at: string; evidence: string
}
export const assessmentKey = (risk: ContractAssessment) => risk.ruleId || risk.id
export const evidenceKey = (risk: ContractAssessment) => JSON.stringify([risk.clause, risk.details, risk.status, risk.ruleVersion])
export function isDismissed(risk: ContractAssessment, records: ResolutionRecord[]) {
  const last = [...records].reverse().find(record => record.rule === assessmentKey(risk) && record.action !== 'discussed')
  return last?.action === 'not_applicable' && last.evidence === evidenceKey(risk)
}
export function reconcileRecord(record: ResolutionRecord, risks: ContractAssessment[]) {
  const current = risks.find(risk => assessmentKey(risk) === record.rule)
  if (record.action === 'correct') return current ? '重新檢查後仍需處理' : '重新檢查後已不再命中'
  if (record.action === 'discussed') return '已記錄溝通，仍保留檢查結果'
  if (record.action === 'reopen') return '已恢復檢查'
  return current && evidenceKey(current) !== record.evidence ? '依據已變更，需重新確認適用性' : '使用者確認不適用'
}

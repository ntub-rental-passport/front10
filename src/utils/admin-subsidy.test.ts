import { describe, expect, it } from 'vitest'

import {
  SUBSIDY_DOC_KEYS,
  canTransitionSubsidy,
  documentsComplete,
  missingDocuments,
  missingDocumentsLabel,
  nextBatchCode,
  subsidyStats,
  subsidyTransitions,
  type SubsidyDocument,
  type SubsidyStatus,
} from './admin-subsidy'

function docs(missing: string[] = []): SubsidyDocument[] {
  return SUBSIDY_DOC_KEYS.map((key) => ({
    key,
    status: missing.includes(key) ? 'missing' : 'approved',
    hint: missing.includes(key) ? '請重新上傳' : null,
  }))
}

describe('canTransitionSubsidy', () => {
  it('待審可以走向補件、退件或通過', () => {
    expect(canTransitionSubsidy('pending', 'need-docs')).toBe(true)
    expect(canTransitionSubsidy('pending', 'rejected')).toBe(true)
    expect(canTransitionSubsidy('pending', 'ready')).toBe(true)
  })

  it('待審不能直接跳到已送件 —— 送件一定要經過待送件', () => {
    expect(canTransitionSubsidy('pending', 'submitted')).toBe(false)
  })

  it('補件後可以通過，也可能查出資格問題而退件', () => {
    expect(canTransitionSubsidy('need-docs', 'ready')).toBe(true)
    expect(canTransitionSubsidy('need-docs', 'rejected')).toBe(true)
  })

  it('待送件可以送出，也可以退回補件', () => {
    expect(canTransitionSubsidy('ready', 'submitted')).toBe(true)
    expect(canTransitionSubsidy('ready', 'need-docs')).toBe(true)
  })

  it('已退件與已送件都是終態', () => {
    expect(subsidyTransitions.rejected).toEqual([])
    expect(subsidyTransitions.submitted).toEqual([])
    expect(canTransitionSubsidy('submitted', 'ready')).toBe(false)
  })
})

describe('文件檢核', () => {
  it('全部齊備時 documentsComplete 為 true', () => {
    expect(documentsComplete(docs())).toBe(true)
    expect(missingDocuments(docs())).toEqual([])
  })

  it('有任一份缺件就不算齊備', () => {
    expect(documentsComplete(docs(['income']))).toBe(false)
    expect(missingDocuments(docs(['income']))).toEqual(['income'])
  })

  it('空清單不算齊備，避免把「還沒建立文件」誤判為通過', () => {
    expect(documentsComplete([])).toBe(false)
  })

  it('缺件描述列出中文名稱，退件通知才講得清楚', () => {
    expect(missingDocumentsLabel(docs(['income', 'bankbook']))).toBe('在職／所得證明、存摺封面')
    expect(missingDocumentsLabel(docs())).toBe('無缺件')
  })
})

describe('nextBatchCode', () => {
  const now = new Date('2026-08-14T10:00:00')

  it('當天第一批是 01', () => {
    expect(nextBatchCode([], now)).toBe('SB-20260814-01')
  })

  it('同一天接續編號', () => {
    expect(nextBatchCode(['SB-20260814-01'], now)).toBe('SB-20260814-02')
    expect(nextBatchCode(['SB-20260814-01', 'SB-20260814-02'], now)).toBe('SB-20260814-03')
  })

  it('別天的批次不影響今天的序號', () => {
    expect(nextBatchCode(['SB-20260813-01', 'SB-20260813-02'], now)).toBe('SB-20260814-01')
  })

  it('序號取最大值加一，不會因為中間被刪掉而重複', () => {
    expect(nextBatchCode(['SB-20260814-01', 'SB-20260814-03'], now)).toBe('SB-20260814-04')
  })

  it('格式不對的舊編號會被忽略而非讓整串壞掉', () => {
    expect(nextBatchCode(['SB-20260814-XX', 'SB-20260814-01'], now)).toBe('SB-20260814-02')
  })
})

describe('subsidyStats', () => {
  it('分別計各狀態件數', () => {
    const statuses: SubsidyStatus[] = [
      'pending',
      'pending',
      'need-docs',
      'ready',
      'submitted',
      'submitted',
      'rejected',
    ]
    expect(subsidyStats(statuses)).toEqual({
      total: 7,
      pending: 2,
      needDocs: 1,
      ready: 1,
      submitted: 2,
      rejected: 1,
    })
  })

  it('沒有資料時全部為 0', () => {
    expect(subsidyStats([]).total).toBe(0)
  })
})

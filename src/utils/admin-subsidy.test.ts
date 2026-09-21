import { describe, expect, it } from 'vitest'

import {
  SUBSIDY_DOC_KEYS,
  canTransitionSubsidy,
  documentsComplete,
  governmentStepVisual,
  isSubsidyQueue,
  missingDocuments,
  missingDocumentsLabel,
  nextBatchCode,
  subsidyStats,
  subsidyStatusLabels,
  subsidyStatusTone,
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

describe('subsidyStatusTone', () => {
  it('待審核與待補件是 warn —— 都有人在等', () => {
    expect(subsidyStatusTone('pending')).toBe('warn')
    expect(subsidyStatusTone('need-docs')).toBe('warn')
  })

  it('待補件不是 idle，雖然在等的是申請人', () => {
    // 照工單頁「等別人 = 不用管」的邏輯該給 idle，但補件案沒有任何人會來催，
    // 它會安靜地放到過期。給灰色等於把它藏起來。
    expect(subsidyStatusTone('need-docs')).not.toBe('idle')
  })

  it('待送件是 ok —— 文件齊了，流程正常在走', () => {
    expect(subsidyStatusTone('ready')).toBe('ok')
  })

  it('已送件是 idle', () => {
    expect(subsidyStatusTone('submitted')).toBe('idle')
  })

  it('已退件是 danger，不跟已送件同一個灰', () => {
    // 兩個都是終態，差別在結果：送件代表事情推進了，退件代表這個人沒拿到補貼。
    expect(subsidyStatusTone('rejected')).toBe('danger')
    expect(subsidyStatusTone('rejected')).not.toBe(subsidyStatusTone('submitted'))
  })

  it('五種狀態都有對應', () => {
    const all = Object.keys(subsidyStatusLabels) as SubsidyStatus[]
    expect(all).toHaveLength(5)
    expect(all.every((s) => ['ok', 'warn', 'danger', 'idle'].includes(subsidyStatusTone(s)))).toBe(
      true,
    )
  })
})

describe('isSubsidyQueue', () => {
  it('待審核與待送件算在「待我處理」裡', () => {
    expect(isSubsidyQueue('pending')).toBe(true)
    expect(isSubsidyQueue('ready')).toBe(true)
  })

  it('待補件不算 —— 那是在等申請人，管理員現在動不了', () => {
    expect(isSubsidyQueue('need-docs')).toBe(false)
  })

  it('已送件與已退件不算', () => {
    expect(isSubsidyQueue('submitted')).toBe(false)
    expect(isSubsidyQueue('rejected')).toBe(false)
  })

  it('「待我處理」剛好是兩種狀態', () => {
    const inQueue = (Object.keys(subsidyStatusLabels) as SubsidyStatus[]).filter(isSubsidyQueue)
    expect(inQueue.sort()).toEqual(['pending', 'ready'])
  })
})

describe('governmentStepVisual', () => {
  it('四種狀態各自不同 —— failed 原本跟 pending 長一樣', () => {
    // 原本的三元判斷是「active → 主色、done → 正常、其餘 → 灰字」，
    // 而 status 有四種：failed 落進「其餘」，於是「政府端審核失敗」
    // 看起來就像「還沒輪到」。不報錯，只是讓人以為案子還在排隊。
    const all = (['done', 'active', 'pending', 'failed'] as const).map(governmentStepVisual)
    const dots = all.map((v) => v.dotClass)
    expect(new Set(dots).size).toBe(4)
  })

  it('failed 與 pending 一定要分得出來', () => {
    expect(governmentStepVisual('failed').dotClass).not.toBe(
      governmentStepVisual('pending').dotClass,
    )
    expect(governmentStepVisual('failed').textClass).not.toBe(
      governmentStepVisual('pending').textClass,
    )
  })

  it('未開始是空心點 —— 它還沒發生，不該有實色', () => {
    expect(governmentStepVisual('pending').dotClass).toContain('border')
  })

  it('進行中用主色並加粗，那是目前卡住的地方', () => {
    const v = governmentStepVisual('active')
    expect(v.dotClass).toContain('bg-primary')
    expect(v.textClass).toContain('font-semibold')
  })

  it('不使用 warn／danger 的狀態色語言', () => {
    // warn／danger 在這個後台的意思是「要你動手」，但政府端的步驟
    // 管理員一步都動不了。同樣的訊號講不同的意思，規則就開始漏水。
    const all = (['done', 'active', 'pending', 'failed'] as const).map(governmentStepVisual)
    expect(all.some((v) => v.dotClass.includes('bg-accent'))).toBe(false)
  })

  it('失敗用 destructive-surface 當填色，不是把 destructive 當填色', () => {
    // --destructive 現在是文字色（淺色 0.52），填色要用 surface
    expect(governmentStepVisual('failed').dotClass).toContain('bg-destructive-surface')
  })
})

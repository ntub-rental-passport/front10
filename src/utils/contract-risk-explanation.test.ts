import { describe, expect, it } from 'vitest'
import {
  buildContractAssessments,
  gateRemoteAssessments,
  type ContractAssessment,
} from './contract-risk'
import {
  contractSectionLabel,
  explainContractRisk,
  RULE_GUIDANCE,
} from './contract-risk-explanation'
import problem from './__fixtures__/problem-lease.json'

const assess = (pages: string[]) =>
  buildContractAssessments({ text: pages.join('\n'), pageTexts: pages, pageCount: pages.length })
const fixtureRisks = assess(problem)
const deposit = fixtureRisks.find((risk) => risk.ruleId === 'deposit-limit')!

describe('風險的法條、具體建議與溝通說明', () => {
  it('單純放棄審閱的摘要不加入原文未載明的禁止主張，也不摘要未確認條款', () => {
    const risk = assess(['承租人同意放棄契約審閱期間之權利。']).find(item => item.ruleId === 'review-waiver')!
    expect(explainContractRisk(risk).problemSummary).toBe('承租人聲明放棄契約審閱期間之權利。')
    expect(explainContractRisk({ ...risk, status: 'recognition_pending' }).problemSummary).toBe('')
  })

  it('全部問題契約規則均有說明與逐條法源，不改變判定及原文', () => {
    for (const risk of fixtureRisks.filter((item) => item.ruleId)) {
      const before = JSON.stringify(risk)
      const explanation = explainContractRisk(risk)
      expect(explanation.reviewed, risk.ruleId).toBe(true)
      expect(explanation.laws.length, risk.ruleId).toBeGreaterThan(0)
      expect(explanation.steps.length).toBeGreaterThanOrEqual(2)
      expect(explanation.message).toContain('房東您好')
      expect(JSON.stringify(risk)).toBe(before)
    }
  })

  it('其餘審閱、車位及存證規則也有具體說明', () => {
    for (const ruleId of ['review-period', 'parking-fee-unclear', 'equipment-record']) {
      expect(RULE_GUIDANCE[ruleId]?.steps.length).toBeGreaterThanOrEqual(2)
      expect(RULE_GUIDANCE[ruleId]?.laws.length).toBeGreaterThan(0)
    }
  })

  it('押金以實際金額運算，另一份契約不沿用範例金額', () => {
    const example = explainContractRisk(deposit)
    expect(example.reason).toContain('36,000 元')
    expect(example.message).toContain('多出 18,000 元')
    const other = assess(['月租金：12,000元。押金：36,000元。']).find(
      (risk) => risk.ruleId === 'deposit-limit',
    )!
    expect(other).toBeDefined()
    const explanation = explainContractRisk(other)
    expect(explanation.message).toContain('上限是 24,000 元')
    expect(explanation.message).toContain('多出 12,000 元')
    expect(explanation.message).not.toContain('18,000')
  })

  it('金額矛盾或無數值的候選不產生確定退款金額', () => {
    const pending: ContractAssessment = {
      ...deposit,
      status: 'recognition_pending',
      severity: null,
    }
    const explanation = explainContractRisk(pending)
    expect(explanation.reason).toContain('尚不能認定本契約違法')
    expect(explanation.message).toContain('目前還不能確定')
    expect(explanation.message).not.toContain('18,000')
    expect(explainContractRisk({ ...deposit, metrics: [] }).message).not.toContain('NaN')
  })

  it('電費與修繕保留適用性待確認，不用確定指控開場', () => {
    for (const ruleId of ['electricity-reference', 'repair-allocation']) {
      const explanation = explainContractRisk(fixtureRisks.find((risk) => risk.ruleId === ruleId)!)
      expect(explanation.reason).toContain('尚不能認定')
      expect(explanation.message).toContain('如果確認')
    }
  })

  it('模型未知風險套用相同架構，但不將模型法源冒充已核對法源', () => {
    const risk = gateRemoteAssessments(
      [{ title: '未知問題', clause: '某條款', legalBasis: ['虛構法條'], advice: '請確認付款條件' }],
      'ai',
      ['某條款'],
    )[0]!
    const explanation = explainContractRisk(risk)
    expect(explanation.reviewed).toBe(false)
    expect(explanation.laws).toEqual([])
    expect(explanation.steps).toContain('請確認付款條件')
    expect(explanation.message).toContain('目前還不能確定')
  })

  it('四類法源依主題引用，消保法連至正確法規與條號', () => {
    const laws = Object.values(RULE_GUIDANCE).flatMap((value) => value.laws)
    for (const law of laws) expect(new URL(law.href).protocol).toBe('https:')
    expect(RULE_GUIDANCE['deposit-limit']!.laws[0]!.href).toContain('pcode=D0060125&flno=7')
    expect(RULE_GUIDANCE['review-waiver']!.laws[0]!.href).toContain('pcode=J0170001&flno=11-1')
    expect(RULE_GUIDANCE['tax-shift']!.laws[0]!.href).toContain('flno=427')
    expect(RULE_GUIDANCE['internet-adjustment']!.laws[0]!.href).toContain('flno=247-1')
    expect(JSON.stringify(laws)).not.toContain('I0050001')
    expect(
      explainContractRisk(fixtureRisks.find((risk) => risk.ruleId === 'deposit-return-delay')!)
        .reason,
    ).not.toMatch(/30\s*日|三十日|法院多/)
  })
})

describe('契約章節定位', () => {
  it('從來源標題辨認第五節，而非將法律第七條當成契約條號', () => {
    expect(contractSectionLabel(deposit, problem)).toBe('契約第五節')
    const clause = '押金為三個月租金。'
    expect(
      contractSectionLabel({ ...deposit, focusText: clause, pageIndex: 0 }, [
        `第九條 押金\n${clause}`,
      ]),
    ).toBe('第九條')
    expect(contractSectionLabel({ ...deposit, pageIndex: null }, problem)).toBe('')
    expect(contractSectionLabel({ ...deposit, focusText: '不存在的原文' }, problem)).toBe('')
  })

  it('續頁沒有新章節時沿用前頁標題', () => {
    const clause = '押金返還：點交後60日內返還。'
    expect(
      contractSectionLabel({ ...deposit, pageIndex: 1, focusText: clause }, [
        '五、押金\n押金為兩個月。',
        clause,
      ]),
    ).toBe('契約第五節')
  })
})

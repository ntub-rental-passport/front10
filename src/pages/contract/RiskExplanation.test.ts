import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import RiskExplanation from './RiskExplanation.vue'
import { buildContractAssessments, gateRemoteAssessments } from '@/src/utils/contract-risk'
import problem from '@/src/utils/__fixtures__/problem-lease.json'

describe('風險展開內容', () => {
  it('審閱權問題區只顯示摘要，完整原文保留於對照區', async () => {
    const risk = buildContractAssessments({ text: problem.join('\n'), pageTexts: problem }).find(
      (risk) => risk.ruleId === 'review-waiver',
    )!
    const html = await renderToString(createSSRApp(RiskExplanation, { risk }))
    const problemSection = html.slice(0, html.indexOf('法條依據'))
    expect(problemSection).toContain('承租人聲明放棄契約審閱期間之權利')
    expect(problemSection).toContain('日後不得以未充分閱讀為由主張契約無效或撤銷')
    expect(problemSection).not.toContain('測試用範例')
    expect(problemSection).not.toContain('已充分瞭解')
    const originalSection = html.slice(html.indexOf('原始契約條文對照'))
    for (const detail of risk.details ?? []) expect(originalSection).toContain(detail.focusText)
    expect(originalSection).toContain('已充分瞭解')
    expect(originalSection).toContain('第 1 頁 ↗')
    expect(html).toContain('即使您已簽名，仍可主張該放棄聲明無效')
    expect(html).toContain('至少三日')
  })

  it('押金內容依閱讀順序顯示六段，保留原文定位與正確法條連結', async () => {
    const risk = buildContractAssessments({ text: problem.join('\n'), pageTexts: problem }).find(
      (risk) => risk.ruleId === 'deposit-limit',
    )!
    const html = await renderToString(createSSRApp(RiskExplanation, { risk }))
    const headings = [
      '問題條款與計算依據',
      '法條依據',
      '為什麼有風險',
      '建議如何修改',
      '可以這樣跟房東說',
      '原始契約條文對照',
    ]
    headings.forEach((heading, index) => {
      expect(html).toContain(heading)
      if (index) expect(html.indexOf(heading)).toBeGreaterThan(html.indexOf(headings[index - 1]!))
    })
    expect(html).toContain('pcode=D0060125&amp;flno=7')
    expect(html).toContain('36,000 元')
    expect(html).toContain('第 1 頁 ↗')
    expect(html).toContain('54,000 元整')
  })

  it('未知 AI 項目保留相同架構，清楚區分候選法源且不產生錯誤頁碼', async () => {
    const risk = gateRemoteAssessments(
      [
        {
          title: '候選',
          clause: '無法定位',
          legalBasis: ['https://example.com/unverified 虛構法條'],
        },
      ],
      'ai',
      ['實際原文'],
    )[0]!
    const html = await renderToString(createSSRApp(RiskExplanation, { risk }))
    expect(html).toContain('待核對條款')
    expect(html).toContain('候選依據・待核對')
    expect(html).toContain('來源未定位')
    expect(html).not.toContain('第 1 頁')
    expect(html).not.toContain('href="https://example.com')
  })
})

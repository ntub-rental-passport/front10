import { describe, expect, it } from 'vitest'
import {
  BLANK,
  buildContractDocument,
  documentValuesFromFieldReviews,
  documentValuesFromRental,
  type ContractDocument,
  type ContractDocumentSection,
} from '@/src/utils/contract-document'
import type { ContractFieldReview } from '@/src/utils/contract-ocr'

/** 把一節攤平成純文字，方便斷言最終讀到的句子。 */
function sectionText(section: ContractDocumentSection): string {
  return section.lines
    .map((line) => {
      if (line.kind === 'aside') return line.subtitle ?? line.note ?? ''
      return line.segments
        .map((segment) => {
          if (segment.kind === 'literal') return segment.text
          if (segment.kind === 'value') return segment.text
          return segment.options
            .map((option) => `${option.checked ? '☑' : '☐'}${option.text}`)
            .join(' ')
        })
        .join('')
    })
    .join('\n')
}

function textOf(document: ContractDocument, sectionId: string): string {
  const section = document.sections.find((candidate) => candidate.id === sectionId)
  if (!section) throw new Error(`找不到 ${sectionId}`)
  return sectionText(section)
}

function reviews(values: Record<string, string>): Record<string, ContractFieldReview> {
  return Object.fromEntries(
    Object.entries(values).map(([fieldId, value]) => [
      fieldId,
      { value, sourceValue: value, confidence: 'high', reviewState: 'verified' },
    ]),
  )
}

describe('buildContractDocument', () => {
  it('把欄位值照抄填進條文，不做任何解析', () => {
    const document = buildContractDocument({
      rent: '20,000 元整',
      payment_period: '2 個月租金',
      due_day: '每月 5 日以前',
      payment_method: '轉帳繳付',
    })
    expect(textOf(document, 'clause-3')).toContain(
      '承租人每月租金為新臺幣 20,000 元整，每期應繳納 2 個月租金，並於 每月 5 日以前 支付',
    )
  })

  it('車位七個欄位各自填回自己的空格', () => {
    const document = buildContractDocument({
      parking_available: '有',
      car_parking_count: '1 個',
      car_parking_type: '平面式',
      car_parking_floor: 'B1 層',
      car_parking_number: '第 20 號',
      parking_usage_time: '全日',
    })
    const text = textOf(document, 'clause-1')
    expect(text).toContain('汽車停車位：1 個')
    expect(text).toContain('編號 第 20 號')
    expect(text).toContain('☑平面式 ☐機械式')
    expect(text).toContain('☑全日')
  })

  it('沒填的欄位顯示空格標記並列入清單，不會被靜靜略過', () => {
    const document = buildContractDocument({ rent: '20,000 元整' })
    expect(textOf(document, 'clause-4')).toContain(BLANK)
    expect(document.blankLabels).toContain('押金金額')
    expect(document.blankCount).toBeGreaterThan(0)
    expect(document.filledCount).toBe(1)
  })

  it('「尚未辨識」視為空白而不是印出字面', () => {
    const document = buildContractDocument({ jurisdiction_court: '尚未辨識' })
    expect(textOf(document, 'clause-jurisdiction')).toContain(BLANK)
    expect(textOf(document, 'clause-jurisdiction')).not.toContain('尚未辨識')
  })

  it('沒有代理或轉租資料時不顯示該節', () => {
    const withoutAgent = buildContractDocument({ rent: '20,000 元整' })
    expect(withoutAgent.sections.some((section) => section.id === 'authorization')).toBe(false)

    const withAgent = buildContractDocument({ agent_name: '王小明' })
    expect(textOf(withAgent, 'authorization')).toContain('代理人姓名：王小明')
  })

  it('不從欄位還原的固定條文以註記呈現，不假裝是完整契約', () => {
    const document = buildContractDocument({})
    expect(textOf(document, 'standard-clauses')).toContain('依內政部定型化契約範本原文')
  })
})

describe('documentValuesFromFieldReviews', () => {
  it('同一工作階段直接由校對結果回拼，不需要資料庫', () => {
    const document = buildContractDocument(
      documentValuesFromFieldReviews(
        reviews({ address: '臺北市中正區羅斯福路一段 2 號 5 樓', tenant: '王小明' }),
      ),
    )
    expect(textOf(document, 'clause-1')).toContain('臺北市中正區羅斯福路一段 2 號 5 樓')
    expect(textOf(document, 'clause-23')).toContain('姓名／名稱：王小明')
  })
})

describe('documentValuesFromRental', () => {
  const rental = {
    address: '臺北市中正區羅斯福路一段 2 號 5 樓',
    start_date: '2025-08-01',
    end_date: '2026-07-31',
    rent_amount: 20000,
    payment_day: 5,
    payment_interval_months: 2,
    deposit_months: 2,
    deposit_amount: 40000,
    building_area: 30.5,
    has_annex_building: true,
    annex_building_purpose: '陽台',
    annex_building_area: 5,
    rental_scope: 'partial' as const,
    has_parking: false,
    has_equipment: true,
    landlord_name: '陳大文',
    tenant_name: '王小明',
    tenant_phone: '0987-654-321',
  }

  it('把資料庫型別轉回契約上的寫法', () => {
    const values = documentValuesFromRental(rental)
    expect(values.start_date).toBe('民國 114 年 8 月 1 日')
    expect(values.end_date).toBe('民國 115 年 7 月 31 日')
    expect(values.rent).toBe('20,000 元整')
    expect(values.deposit).toBe('40,000 元整')
    expect(values.due_day).toBe('每月 5 日以前')
    expect(values.payment_period).toBe('2 個月租金')
    expect(values.exclusive_area).toBe('30.5 平方公尺')
    expect(values.accessory_available).toBe('有')
    expect(values.rental_scope).toBe('部分')
    expect(values.parking_available).toBe('無')
  })

  it('解密後的個資欄位回到當事人資料那一節', () => {
    const document = buildContractDocument(documentValuesFromRental(rental))
    const parties = textOf(document, 'clause-23')
    expect(parties).toContain('姓名／名稱：陳大文')
    expect(parties).toContain('姓名／名稱：王小明')
    expect(parties).toContain('聯絡電話：0987-654-321')
  })

  it('沒有資料時回空物件，不丟例外', () => {
    expect(documentValuesFromRental(null)).toEqual({})
  })
})

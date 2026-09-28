import { describe, expect, it } from 'vitest'
import {
  buildRentalPayload,
  describeMissingFields,
  type RentalPayloadResult,
} from '@/src/utils/contract-rental-payload'
import type { ContractOcrResult } from '@/src/utils/contract-ocr'

function ocrResult(values: Record<string, string>): ContractOcrResult {
  return {
    engine: 'test',
    fileName: 'contract.pdf',
    mimeType: 'application/pdf',
    size: 1,
    text: 'contract',
    pageCount: 1,
    pageTexts: ['contract'],
    languageHints: [],
    warnings: [],
    fieldReviews: Object.fromEntries(
      Object.entries(values).map(([fieldId, value]) => [
        fieldId,
        { value, sourceValue: value, confidence: 'high', reviewState: 'verified' },
      ]),
    ),
  } as ContractOcrResult
}

/** 必填欄位（address / 租期 / 租金 / 繳租日 / 押金）都有值的最小輸入。 */
const minimalValues = {
  address: '臺北市中正區羅斯福路一段 2 號 5 樓',
  start_date: '民國 114 年 8 月 1 日',
  end_date: '民國 115 年 7 月 31 日',
  rent: '20,000 元',
  due_day: '每月 5 日以前',
  deposit: '40,000 元',
}

function build(values: Record<string, string>): RentalPayloadResult {
  return buildRentalPayload(ocrResult(values))
}

describe('buildRentalPayload', () => {
  it('把校對後的中文欄位轉成資料庫可寫入的型別', () => {
    const { rental, missing, warnings } = build({
      ...minimalValues,
      payment_period: '2 個月',
      payment_method: '轉帳繳付',
      deposit_months: '2 個月',
      handover_time: '民國 114 年 8 月 1 日 下午 3 時',
      exclusive_area: '30.5 平方公尺',
      accessory_available: '有',
      accessory_purpose: '陽台',
      accessory_area: '5 平方公尺',
      rental_scope: '部分',
      rental_room: '5 樓 A 室',
      parking_available: '無',
      rental_equipment: '有',
      rental_equipment_details: '冷氣、熱水器',
      jurisdiction_court: '臺灣臺北地方法院',
    })

    expect(missing).toEqual([])
    expect(warnings).toEqual([])
    expect(rental).toMatchObject({
      address: minimalValues.address,
      start_date: '2025-08-01',
      end_date: '2026-07-31',
      handover_date: '2025-08-01',
      rent_amount: 20000,
      deposit_amount: 40000,
      deposit_months: 2,
      payment_day: 5,
      payment_interval_months: 2,
      payment_method: '轉帳繳付',
      building_area: 30.5,
      has_annex_building: true,
      annex_building_purpose: '陽台',
      annex_building_area: 5,
      rental_scope: 'partial',
      rental_room: '5 樓 A 室',
      has_parking: false,
      has_equipment: true,
      equipment_list: '冷氣、熱水器',
      jurisdiction_court: '臺灣臺北地方法院',
    })
  })

  it('每期 2 個月的 12 個月租約算成 6 期', () => {
    expect(build({ ...minimalValues, payment_period: '2 個月' }).rental?.total_periods).toBe(6)
  })

  it('沒填每期月數時視為月繳，12 個月租約為 12 期', () => {
    const { rental } = build(minimalValues)
    expect(rental?.payment_interval_months).toBe(1)
    expect(rental?.total_periods).toBe(12)
  })

  it('租期尾端不足一個月時仍算一期', () => {
    const { rental } = build({ ...minimalValues, end_date: '民國 115 年 2 月 14 日' })
    expect(rental?.total_periods).toBe(7)
  })

  it('「每月底以前」的繳租期限存成 31 日', () => {
    expect(build({ ...minimalValues, due_day: '每月底以前' }).rental?.payment_day).toBe(31)
  })

  it('缺少必填欄位時不產生 payload，並回報缺哪些欄位', () => {
    const { rental, missing } = build({ ...minimalValues, rent: '尚未辨識', deposit: '' })
    expect(rental).toBeNull()
    expect(missing.map((field) => field.id)).toEqual(['rent', 'deposit'])
    expect(describeMissingFields(missing)).toBe('每月租金、押金金額')
  })

  it('把「尚未辨識」視為空值而不是字面內容', () => {
    const { rental } = build({ ...minimalValues, land_number: '尚未辨識' })
    expect(rental?.land_number).toBeNull()
  })

  it('租期結束日不晚於起始日時擋下寫入', () => {
    const { rental, warnings } = build({
      ...minimalValues,
      end_date: '民國 114 年 7 月 1 日',
    })
    expect(rental).toBeNull()
    expect(warnings[0]).toContain('租期結束日')
  })

  it('國字金額無法辨識時列為缺漏，不會猜成 0 元', () => {
    const { rental, missing } = build({ ...minimalValues, rent: '新臺幣貳萬元整' })
    expect(rental).toBeNull()
    expect(missing.map((field) => field.id)).toContain('rent')
  })

  it('全形數字的日期與金額也能轉換', () => {
    const { rental } = build({
      ...minimalValues,
      start_date: '民國 １１４ 年 ８ 月 １ 日',
      rent: '１８０００ 元',
    })
    expect(rental?.start_date).toBe('2025-08-01')
    expect(rental?.rent_amount).toBe(18000)
  })

  it('代理與轉租資料各自成欄，不再併成一段字串', () => {
    const { rental } = build({
      ...minimalValues,
      agent_name: '王小明',
      agent_id: 'C123456789',
      sublease_consent: '已取得出租人同意轉租',
    })
    expect(rental?.agent_name).toBe('王小明')
    expect(rental?.agent_national_id).toBe('C123456789')
    expect(rental?.sublease_consent).toBe('已取得出租人同意轉租')
  })

  it('車位七個欄位各自成欄，回拼時不需要反解析', () => {
    const { rental } = build({
      ...minimalValues,
      parking_available: '有',
      car_parking_count: '1 個',
      car_parking_type: '平面式',
      car_parking_floor: 'B1 層',
      car_parking_number: '第 20 號',
      motorcycle_parking_count: '2 個',
      motorcycle_parking_number: '第 M12 號',
      parking_usage_time: '全日',
    })
    expect(rental).toMatchObject({
      has_parking: true,
      car_parking_count: 1,
      car_parking_type: '平面式',
      car_parking_floor: 'B1 層',
      car_parking_number: '第 20 號',
      motorcycle_parking_count: 2,
      motorcycle_parking_number: '第 M12 號',
      parking_usage_time: '全日',
    })
    expect(rental?.motorcycle_parking_floor).toBeNull()
  })

  it('轉帳帳戶當成個資交給後端加密', () => {
    const { rental } = build({
      ...minimalValues,
      bank_account: '金融機構：台灣銀行，戶名：陳大文，帳號：012345678901',
    })
    expect(rental?.bank_account).toContain('012345678901')
  })

  it('個資欄位以明文交給後端，由後端負責加密落地', () => {
    const { rental } = build({
      ...minimalValues,
      landlord: '陳大文',
      landlord_id: 'A123456789',
      tenant_phone: '0912-345-678',
    })
    expect(rental?.landlord_name).toBe('陳大文')
    expect(rental?.landlord_national_id).toBe('A123456789')
    expect(rental?.tenant_phone).toBe('0912-345-678')
  })

  it('沒有任何辨識結果時回報全部必填欄位', () => {
    const { rental, missing } = buildRentalPayload(null)
    expect(rental).toBeNull()
    expect(missing.map((field) => field.id)).toEqual([
      'address',
      'start_date',
      'end_date',
      'rent',
      'due_day',
      'deposit',
    ])
  })
})

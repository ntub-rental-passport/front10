import { describe, expect, it } from 'vitest'
import { analyzeContractFields } from '../../server/contract-field-gate.js'
import { extractContractFieldCandidates } from '../../shared/contract-field-extraction.js'

// Layout-sensitive excerpts from the supplied fictional test contract, not a live OCR response.
const first = `本契約於中華民國 民國 115 年9月16日經承租人攜回審閱5日。
（一）租賃住宅標示
1、門牌 臺北市信義區信義路123巷5弄8號7樓之3（基地坐落 臺北市大安區示範段一小段0123-0000地
號）。
2、專有部分建號 臺北市大安區示範段一小段00649-000建號，面積共計80.00平方公尺。
附屬建物:☑ 有 無 用途 陽臺,面積 8.00平方公尺。
（二）租賃範圍
1、租賃住宅□ 全部 ☑ 部分:第7樓A室,面積25.00平方公尺。
2、車位:☑ 有 無`
const second = `承租人每月租金為新臺幣 NT$18,000,每期應繳納 1個月。
押金由租賃雙方約定為2個月租金,金額為新臺幣 NT$36,000(最高不得超過二個月租金之總額)。`
const landlord = `立契約書人
出租人
姓名(名稱):王房東
統一編號(身分證明文件編號):A123456789
戶籍地址(營業登記地址):臺北市中正區康康街1號5樓
通訊地址:臺北市中正區康康街1號5樓`
const last = `聯絡電話:0912-000-111
承租人
姓名(名稱):林小明
統一編號(身分證明文件編號):F131085655
戶籍地址:新北市板橋區示範路99號8樓
通訊地址:新北市板橋區示範路99號8樓
聯絡電話:0987-111-222`

describe('回拼契約換行與跨頁基本資料', () => {
  it('擷取所有回報欄位，保留各自的原文頁碼', () => {
    const pageTexts = [first, second, '修繕事項由\n出租人。\n下一條其他約定。', '', '', '', landlord, last]
    const { fieldReviews } = analyzeContractFields({ text: pageTexts.join('\n\n'), pageTexts, visionPages: [] })
    const expected: Record<string, [string, number]> = {
      review_date: ['民國 115 年 9 月 16 日', 0],
      address: ['臺北市信義區信義路123巷5弄8號7樓之3', 0],
      land_number: ['臺北市大安區示範段一小段0123-0000地號', 0],
      accessory_purpose: ['陽臺', 0], rental_scope: ['部分', 0],
      rental_room: ['第 7 樓 A 室', 0], rental_area: ['25.00 平方公尺', 0],
      rent: ['NT$18,000', 1], deposit: ['NT$36,000', 1],
      landlord: ['王房東', 6], landlord_id: ['A123456789', 6],
      landlord_registered_address: ['臺北市中正區康康街1號5樓', 6],
      landlord_mailing_address: ['臺北市中正區康康街1號5樓', 6],
      landlord_phone: ['0912-000-111', 7],
    }
    for (const [id, [value, page]] of Object.entries(expected)) {
      expect(fieldReviews[id]?.value, id).toBe(value)
      expect(fieldReviews[id]?.sourcePageIndex, id).toBe(page)
      const review = fieldReviews[id]!
      expect(pageTexts[page]!.slice(review.sourceStart, review.sourceEnd), id).toBe(review.sourceValue)
    }
  })
  it('不將無門牌說明或當事人地址當作租屋地址', () => {
    const text = '房屋門牌地址：臺北市大安區想像路一段123巷5弄8號7樓之3。\n房屋有門牌，無\n門牌房屋稅籍替代欄位：不適用。\n' + landlord
    expect(extractContractFieldCandidates(text).address.value).toBe('臺北市大安區想像路一段123巷5弄8號7樓之3')
    expect(extractContractFieldCandidates(landlord).address.value).toBe('')
  })
  it('未勾選範圍與只有月份時不猜金額或出租範圍', () => {
    const fields = extractContractFieldCandidates('（二）租賃範圍\n租賃住宅□全部 □部分\n每月租金：＿＿＿\n押金由雙方約定為2個月租金。')
    expect(fields.rental_scope.value).toBe('')
    expect(fields.rent.value).toBe('')
    expect(fields.deposit.value).toBe('')
    const depositOnly = extractContractFieldCandidates('每月租金：＿＿＿\n押金由雙方約定為2個月租金,金額為新臺幣 NT$36,000。')
    expect(depositOnly.rent.value).toBe('')
    expect(depositOnly.deposit.value).toBe('NT$36,000')
  })
  it.each(['民國', '中華民國', '中華民國 民國', '中華⺠國 ⺠國'])('審閱日期容許 %s 前綴', prefix => {
    expect(extractContractFieldCandidates(`本契約於${prefix}115年9月16日經承租人\n攜回審閱5日。`).review_date.value).toBe('民國 115 年 9 月 16 日')
  })
})

describe('汽車與機車的同行欄位及換行', () => {
  const parking = `2、車位:☑ 有 無
(1)汽車停車位:1個,種類☑平面式 機械式, B1 層,編號 第20號。
(2)機車停車位:1個
，
B1層,編號 第12號
(3)使用時間：全日 日間 夜間 其他`
  it.each([parking, parking.replaceAll(':', '：').replaceAll('☑', '■')])('完整擷取兩種車位且定位到原文', text => {
    const { fieldReviews } = analyzeContractFields({ text, pageTexts: [text], visionPages: [] })
    const expected = {
      parking_available: '有', car_parking_count: '1 個', car_parking_type: '平面式',
      car_parking_floor: 'B1 層', car_parking_number: '第 20 號',
      motorcycle_parking_count: '1 個', motorcycle_parking_floor: 'B1 層',
      motorcycle_parking_number: '第 12 號', parking_usage_time: '全日',
    }
    for (const [id, value] of Object.entries(expected)) {
      const review = fieldReviews[id]
      expect(review?.value, id).toBe(value)
      expect(review?.formatValid, id).toBe(true)
      expect(review?.sourcePageIndex, id).toBe(0)
      expect(text.slice(review.sourceStart, review.sourceEnd), id).toBe(review.sourceValue)
    }
  })
  it('汽車欄位缺漏時不拿機車資料代填，也不猜未勾選的種類', () => {
    const fields = extractContractFieldCandidates('汽車停車位:1個，種類□平面式 □機械式\n機車停車位:2個，B2層，編號第M8號')
    expect(fields.car_parking_count.value).toBe('1 個')
    expect(fields.car_parking_type.value).toBe('')
    expect(fields.car_parking_floor.value).toBe('')
    expect(fields.car_parking_number.value).toBe('')
    expect(fields.motorcycle_parking_count.value).toBe('2 個')
    expect(fields.motorcycle_parking_number.value).toBe('第 M8 號')
  })
  it('機車在前時不拿後面的汽車或下一條編號代填', () => {
    const fields = extractContractFieldCandidates('機車停車位:1個\n汽車停車位:2個，種類☑機械式 平面式，B3層\n第二條 租賃期間\n編號第99號')
    expect(fields.motorcycle_parking_floor.value).toBe('')
    expect(fields.motorcycle_parking_number.value).toBe('')
    expect(fields.car_parking_type.value).toBe('機械式')
    expect(fields.car_parking_floor.value).toBe('B3 層')
    expect(fields.car_parking_number.value).toBe('')
  })
})

import { describe, expect, it } from 'vitest'

import { extractContractFieldCandidates } from '@/shared/contract-field-extraction.js'
import { CONTRACT_FIELD_GROUPS } from '@/shared/contract-field-schema.js'
import { analyzeContractFields } from '../../server/contract-field-gate.js'

describe('依章節排序而不綁定頁碼', () => {
  it('將當事人資料排在其他條款之後，保留穩定的群組識別碼', () => {
    expect(CONTRACT_FIELD_GROUPS.map((group) => group.id)).toEqual([
      'review', 'property', 'scope', 'term', 'rent', 'deposit', 'expenses', 'clauses', 'parties', 'authorization',
    ])
  })

  const parties = `二十三、當事人及其基本資料
（一）承租人
承租人（乙方）姓名：林小明
身分證明文件編號：F987654321（測試字串，非身分核驗資料）
戶籍地址：新北市板橋區示範路99號8樓
通訊地址：臺北市大安區想像路一段123巷5弄8號7樓之3
聯絡電話：0987-111-222
（二）出租人
出租人（甲方）姓名：王房東
身分證明文件編號：A123456789（測試字串，非身分核驗資料）
戶籍地址：臺北市中正區康康街1號5樓
通訊地址：臺北市中正區康康街1號5樓
聯絡電話：0912-000-111`

  it.each([0, 5, 8])('能在索引 %i 的頁面擷取雙方資料並定位來源', (pageIndex) => {
    const pageTexts = Array.from({ length: 9 }, (_, index) => index === pageIndex ? parties : `第 ${index + 1} 頁其他條款\n匯款戶名：王房東\n房屋門牌地址：臺北市大安區想像路一段123巷5弄8號7樓之3`)
    const { fieldReviews } = analyzeContractFields({ text: pageTexts.join('\n\n'), pageTexts, visionPages: [] })
    const expected = {
      tenant: '林小明', tenant_id: 'F987654321', tenant_phone: '0987-111-222',
      tenant_registered_address: '新北市板橋區示範路99號8樓',
      tenant_mailing_address: '臺北市大安區想像路一段123巷5弄8號7樓之3',
      landlord: '王房東', landlord_id: 'A123456789', landlord_phone: '0912-000-111',
      landlord_registered_address: '臺北市中正區康康街1號5樓',
      landlord_mailing_address: '臺北市中正區康康街1號5樓',
    }
    for (const [id, value] of Object.entries(expected)) {
      expect(fieldReviews[id]?.value, id).toBe(value)
      expect(fieldReviews[id]?.sourcePageIndex, id).toBe(pageIndex)
      expect(fieldReviews[id]?.sourceStart, id).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('審閱日期與約定日數', () => {
  it.each(['審閱日期', '審閱日期（交付日）', '審閱日期(交付日)'])('接受 %s 並保留跨行日數來源', (label) => {
    const text = `${label}：民國115年09月16日。審閱期間：民國115年09月16日至115年09月20日。審閱日數\n：5日，至少三日。`
    const fields = extractContractFieldCandidates(text)
    expect(fields.review_date.value).toBe('民國 115 年 9 月 16 日')
    expect(fields.review_days.value).toBe('5 日')
    expect(fields.review_days.sourceValue).toBe('審閱日數\n：5日')
    const { fieldReviews } = analyzeContractFields({ text, pageTexts: [text], visionPages: [] })
    const review = fieldReviews.review_days
    expect(text.slice(review.sourceStart, review.sourceEnd)).toBe('審閱日數\n：5日')
  })

  it.each([
    '審閱期間：民國115年09月16日至115年09月20日。',
    '契約審閱期間至少三日。',
    '審閱日數：____日，至少三日。預定簽約日期：民國115年09月21日。',
  ])('不將日期或法定下限當作約定日數：%s', (text) => {
    expect(extractContractFieldCandidates(text).review_days.value).toBe('')
  })

  it('仍支援範本的攜回審閱敘述與跨行文字', () => {
    const fields = extractContractFieldCandidates('本契約於民國115年09月16日經承租人攜回審閱五日（契約審閱期間至少三日）。')
    expect(fields.review_date.value).toBe('民國 115 年 9 月 16 日')
    expect(fields.review_days.value).toBe('5 日')
    expect(extractContractFieldCandidates('攜回審\n閱五日').review_days.value).toBe('5 日')
  })
})

/**
 * 內政部官方範本的實際寫法。
 *
 * 2026-09-10 發現：照官方範本填寫的合約，姓名與統一編號這兩個必填欄位
 * 一律抽不到。原因是抽取器要求標籤後「立刻」接冒號，
 * 但官方範本寫的是「姓名(名稱)：」「統一編號(身分證明文件編號)：」，
 * 中間夾著括號註記。
 *
 * 這不是罕見格式 —— 是使用者上傳的合約最可能長的樣子。
 */
const OFFICIAL_TEMPLATE = `立契約書人
出租人：
姓名（名稱）：陳大華　　簽章
統一編號（身分證明文件編號）：A123456789
戶籍地址（營業登記地址）：臺北市大安區和平東路二段88號3樓
通訊地址：臺北市大安區和平東路二段88號3樓
聯絡電話：0912-345-678

承租人：
姓名（名稱）：王小明　　簽章
統一編號（身分證明文件編號）：F221398765
戶籍地址（營業登記地址）：新北市板橋區文化路二段35號之1
通訊地址：臺北市中正區忠孝東路一段100號5樓之2
聯絡電話：0987-654-321
`

describe('官方範本格式的當事人欄位', () => {
  const fields = extractContractFieldCandidates(OFFICIAL_TEMPLATE)

  it('抽得到出租人姓名，且不含「簽章」', () => {
    expect(fields.landlord.value).toBe('陳大華')
  })

  it('抽得到承租人姓名', () => {
    expect(fields.tenant.value).toBe('王小明')
  })

  it('括號註記不會擋住統一編號', () => {
    expect(fields.landlord_id.value).toBe('A123456789')
    expect(fields.tenant_id.value).toBe('F221398765')
  })

  it('括號註記不會擋住戶籍地址', () => {
    expect(fields.landlord_registered_address.value).toContain('和平東路')
    expect(fields.tenant_registered_address.value).toContain('文化路')
  })

  it('不會把出租人與承租人的資料混在一起', () => {
    expect(fields.landlord_phone.value).toBe('0912-345-678')
    expect(fields.tenant_phone.value).toBe('0987-654-321')
  })
})

describe('其他常見寫法仍要相容', () => {
  it('標題不帶冒號', () => {
    const fields = extractContractFieldCandidates(
      '出租人\n姓名：陳大華\n統一編號：A123456789\n',
    )
    expect(fields.landlord.value).toBe('陳大華')
    expect(fields.landlord_id.value).toBe('A123456789')
  })

  it('標籤與角色寫在同一行', () => {
    const fields = extractContractFieldCandidates('出租人姓名：陳大華\n')
    expect(fields.landlord.value).toBe('陳大華')
  })

  it('簽章以外的括號內容不會被當成姓名的一部分', () => {
    const fields = extractContractFieldCandidates(
      '出租人：\n姓名（名稱）：陳大華（以下簡稱甲方）\n',
    )
    expect(fields.landlord.value).toBe('陳大華')
  })
})

/**
 * 費用約定的抽取。
 *
 * 2026-09-10 實測發現「其他費用及其支付方式」抽到的是
 * 「(二)本契約租賃雙方□同意 ■不同意辦理公證」—— 那是下一條的內容，
 * 跟這個欄位毫無關係。原因是抽取器會先在後 5 行裡找任何帶 ■ 的行，
 * 蓋過標籤自己那行已經寫完整的敘述式約定。
 *
 * 抽錯內容比抽不到更糟：畫面顯示「已確認」，使用者不會發現它是錯的。
 */
const EXPENSES = `第五條　租賃期間相關費用之約定
（一）管理費：■由承租人負擔。租賃住宅每月 1,500 元整。
（二）水費：■由承租人負擔。
（三）電費：■由承租人負擔。■以用電度數計費：■每期每度 7 元。
（四）瓦斯費：■由承租人負擔。
（五）網路費：■由承租人負擔。
（六）其他費用及其支付方式：清潔費每月 200 元，由承租人負擔。

第六條　稅費負擔之約定
（一）租賃住宅之房屋稅、地價稅由承租人負擔。
（二）本契約租賃雙方□同意 ■不同意辦理公證。
`

describe('費用約定', () => {
  const fields = extractContractFieldCandidates(EXPENSES)

  it('敘述式的其他費用不會被下一條的勾選行蓋過', () => {
    expect(fields.other_fee.value).toContain('清潔費')
    expect(fields.other_fee.value).not.toContain('公證')
  })

  it('抽取不會跨條', () => {
    for (const key of ['management_fee', 'water_fee', 'gas_fee', 'internet_fee']) {
      expect(fields[key].value).not.toContain('公證')
    }
  })

  it('每度電費支援官方範本的「每期每度」寫法', () => {
    expect(fields.electricity_rate.value).toContain('每度')
  })

  it('各費用項目各自對應到自己的行', () => {
    expect(fields.water_fee.value).toContain('水費')
    expect(fields.gas_fee.value).toContain('瓦斯費')
    expect(fields.internet_fee.value).toContain('網路費')
  })
})

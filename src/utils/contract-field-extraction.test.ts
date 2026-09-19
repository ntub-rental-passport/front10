import { describe, expect, it } from 'vitest'

import { extractContractFieldCandidates } from '@/shared/contract-field-extraction.js'
import { CONTRACT_FIELD_GROUPS, detectContractConditions } from '@/shared/contract-field-schema.js'
import { analyzeContractFields } from '../../server/contract-field-gate.js'
import { isValidHandoverTime, isValidContractFieldFormat } from '@/shared/contract-field-validation.js'

describe('不適用的代理與轉租', () => {
  const negative = `是否由代理人簽約：否；代理人姓名、證件、地址、電話及授權書：均不適用。
是否屬轉租\n：否；原出租人同意轉租書及原租約起迄日：均不適用。`
  it('否定答案優先於關鍵字與制式條文', () => {
    const text = '承租人經出租人同意轉租者，應提出同意轉租書。\n' + negative
    const conditions = detectContractConditions(text)
    expect(conditions.agent).toBe(false)
    expect(conditions.sublease).toBe(false)
    const fields = extractContractFieldCandidates(text)
    for (const id of ['agent_name', 'agent_id', 'authorization_document', 'sublease_consent']) {
      expect(fields[id].value, id).toBe('')
    }
  })
  it('均不適用不代表已有授權附件', () => {
    const text = '代理人姓名、證件及授權書：均不適用。原出租人同意轉租書及原租約起迄日：均不適用。'
    expect(detectContractConditions(text).agent).toBe(false)
    expect(detectContractConditions(text).sublease).toBe(false)
  })
  it('明確適用時仍保留欄位', () => {
    const text = '是否由代理人簽約：是；已檢附授權書。是否屬轉租：是；已檢附原出租人同意轉租書。'
    expect(detectContractConditions(text).agent).toBe(true)
    expect(detectContractConditions(text).sublease).toBe(true)
    expect(extractContractFieldCandidates(text).authorization_document.value).not.toBe('')
  })
})

describe('出租範圍、車位及設備附件', () => {
  const scope = `二、租賃標的\n（二）租賃範圍
住宅出租範圍：部分出租。樓層：第7層。房間／室號：第A室。
實際租賃面積\n：25.00平方公尺（房間21.00平方公尺、衛浴4.00平方公尺）。
是否包含車位：有。汽車停車位數量：1個。汽車停車位種類：平面式。
汽車停車位樓層：地下地下 地下 B1 層 層層。汽車\n停車位編號：第20號。
機車停車位數量：1個。機車停車位樓層：地下B1層。機車停車位編號／位置：第M12號。
車位使用時間：全日（每日00:00至24:00）。
（四）租賃附屬設備\n是否有附屬設備：有。設備明細及現況見附件一。`
  const appendix = '附件一 租賃標的現況確認書\n附屬設備清單與交屋預設狀態\n1. 分離式冷氣1臺，功能正常。\n2. 冰箱1臺。\n交屋電表讀數：A-01。'
  it.each([scope, scope.replaceAll('：', ':').replaceAll('／', '/')])('擷取正確數值與每個欄位的標籤來源', (text) => {
    const pageTexts = [text, '', '', '', '', '', '', appendix]
    const { fieldReviews } = analyzeContractFields({ text: pageTexts.join('\n\n'), pageTexts, visionPages: [] })
    const expected = {
      rental_scope: '部分', rental_room: '第 7 樓 A 室', rental_area: '25.00 平方公尺',
      parking_available: '有', car_parking_count: '1 個', car_parking_type: '平面式',
      car_parking_floor: 'B1 層', car_parking_number: '第 20 號',
      motorcycle_parking_count: '1 個', motorcycle_parking_floor: 'B1 層', motorcycle_parking_number: '第 M12 號',
      parking_usage_time: '全日', rental_equipment: '有',
    }
    for (const [id, value] of Object.entries(expected)) {
      const review = fieldReviews[id]
      expect(review?.value, id).toBe(value)
      expect(review?.formatValid, id).toBe(true)
      expect(review?.sourcePageIndex, id).toBe(0)
      expect(text.slice(review.sourceStart, review.sourceEnd), id).toBe(review.sourceValue)
    }
    expect(fieldReviews.rental_equipment_details.value).toContain('冰箱1臺')
    expect(fieldReviews.rental_equipment_details.value).not.toContain('電表讀數')
    expect(fieldReviews.rental_equipment_details.sourcePageIndex).toBe(7)
    expect(detectContractConditions(text).partial_scope).toBe(true)
    expect(detectContractConditions(text).has_car_parking).toBe(true)
    expect(detectContractConditions(text).has_motorcycle_parking).toBe(true)
  })
  it.each(['B1 層', '1 層', '地下 B1 層', '地上 1 層'])('接受樓層 %s', (value) => {
    expect(isValidContractFieldFormat('floor', value)).toBe(true)
  })
  it('缺少汽車資料時不挪用機車編號', () => {
    const fields = extractContractFieldCandidates('汽車停車位數量：1個。\n機車停車位編號／位置：第M12號。')
    expect(fields.car_parking_number.value).toBe('')
    expect(fields.motorcycle_parking_number.value).toBe('第 M12 號')
  })
  it('只有附件引用時明確要求核對，不捏造設備清單', () => {
    expect(extractContractFieldCandidates(scope).rental_equipment_details.value).toContain('請核對附件內容')
  })
  it('附件標題被 OCR 拆行仍能擷取清單', () => {
    const text = appendix.replace('附屬設備清單', '附屬設備\n清單')
    const details = extractContractFieldCandidates(text).rental_equipment_details
    expect(details.value).toContain('冰箱1臺')
    expect(text).toContain(details.sourceValue)
  })
})

describe('新版契約的租期與租金標籤', () => {
  const lease = `三、租賃期間
租期開始:民國115年10月01日。租期結束:民國116年09月30日。租期共12個月。交
屋/可入住時間:民
國115年10月01日上午10時。
四、租金約定及支付
每月租金:新臺幣18,000元整。每期繳納月數:1個月。每期租金:新臺幣18,000元整。
繳租期限:每月5日
前(含當日)支付當月租金;首期租金於民國115年10月05日前支付。
租金支付方式:轉帳繳付。金融機構:想像銀行中山分行。戶名:王房東。帳號:000-
123456-789(虛構
帳號,不可匯款)。出租人應提供收款證明。
五、押金約定及返還`

  it.each([lease, lease.replace(/\n/g, ' '), lease.replaceAll(':', '：').replaceAll('/', '／')])('擷取所有欄位並定位第 2 頁原文', (text) => {
    const pageTexts = ['審閱日期：民國115年09月16日。預定簽約日期：民國115年09月21日。', text]
    const { fieldReviews } = analyzeContractFields({ text: pageTexts.join('\n\n'), pageTexts, visionPages: [] })
    const expected = {
      start_date: '民國 115 年 10 月 1 日', end_date: '民國 116 年 9 月 30 日',
      handover_time: '民國115年10月01日上午10時', rent: 'NT$18,000',
      payment_period: '1 個月', due_day: '每月 5 日前', payment_method: '轉帳',
      bank_account: '金融機構：想像銀行中山分行；戶名：王房東；帳號：000-123456-789',
    }
    for (const [id, value] of Object.entries(expected)) {
      const review = fieldReviews[id]
      expect(review?.value, id).toBe(value)
      expect(review?.formatValid, id).toBe(true)
      expect(review?.sourcePageIndex, id).toBe(1)
      expect(review?.sourceStart, id).toBeGreaterThanOrEqual(0)
      expect(text.slice(review.sourceStart, review.sourceEnd), id).toBe(review.sourceValue)
    }
  })

  it('標籤內換行與全形數字仍可定位', () => {
    const fields = extractContractFieldCandidates('租期開\n始：民 國１１５年１０月０１日。每期繳納月\n數：１個\n月。')
    expect(fields.start_date.value).toBe('民國 115 年 10 月 1 日')
    expect(fields.payment_period.value).toBe('1 個月')
  })

  it('不把審閱、簽約日期、租期總月數或首期租金當成缺漏欄位', () => {
    const fields = extractContractFieldCandidates('審閱日期：民國115年09月16日。預定簽約日期：民國115年09月21日。租期共12個月。每期租金：18,000元。首期租金於民國115年10月05日前支付。')
    for (const id of ['start_date', 'end_date', 'handover_time', 'payment_period']) expect(fields[id].value, id).toBe('')
  })

  it('仍接受原範本的自起至止與每期應繳納', () => {
    const fields = extractContractFieldCandidates('租賃期間自民國115年10月1日起至民國116年9月30日止。每期應繳納2個月租金。')
    expect(fields.start_date.value).toBe('民國 115 年 10 月 1 日')
    expect(fields.end_date.value).toBe('民國 116 年 9 月 30 日')
    expect(fields.payment_period.value).toBe('2 個月')
  })

  it('交屋日期含時間可通過驗證，但不接受無效日期或時間', () => {
    expect(isValidHandoverTime('民國115年10月01日上午10時')).toBe(true)
    expect(isValidHandoverTime('民國115年10月01日23時30分')).toBe(true)
    expect(isValidHandoverTime('民國115年02月30日上午10時')).toBe(false)
    expect(isValidHandoverTime('民國115年10月01日25時')).toBe(false)
    expect(isValidHandoverTime('民國115年10月01日10時60分')).toBe(false)
  })
})

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

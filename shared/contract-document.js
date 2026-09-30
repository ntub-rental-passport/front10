/**
 * 把校對過的欄位回拼成「住宅租賃契約書」（內政部 113.7.8 台內地字第 11302639334 號修正）。
 *
 * 為什麼需要這支模組：專案刻意不儲存合約原始檔，也不把 OCR 全文明文落地
 * （全文含所有姓名、身分證字號、地址與電話，存了等於抵銷 rentals 加密欄位）。
 * 使用者要檢視契約時，就由攤平儲存的欄位逐格填回範本。
 *
 * 關鍵前提：填空是「照抄」，不是「解析」。每個空格對應一個欄位，
 * 值怎麼存進去就怎麼印出來，中間沒有任何字串拆解。
 *
 * 範本原文見 rag/住宅租賃契約書_structured.md，第一條至第二十三條全文收錄：
 * 有欄位的空格由欄位填入，其餘固定條文照範本原文呈現。附件一至附件三
 * （現況確認書、轉租同意書、修繕範圍確認書）不在辨識範圍，只在末尾列出名稱。
 */
import { CONTRACT_FIELD_DEFINITIONS } from './contract-field-schema.js'

const FIELD_LABELS = new Map(
  CONTRACT_FIELD_DEFINITIONS.map((definition) => [definition.id, definition.label]),
)

/** 範本裡的空格標記；欄位沒有值時顯示這個，讓使用者看得出哪裡沒填。 */
export const BLANK = '＿＿＿＿'

/** 內文中的一個欄位空格。 */
function f(fieldId) {
  return { kind: 'field', fieldId }
}

/** 勾選框：依欄位值決定哪一項打勾；值不在選項內時全部留空。 */
function choice(fieldId, options) {
  return { kind: 'choice', fieldId, options }
}

const TEMPLATE = [
  {
    id: 'review',
    title: '契約審閱權',
    lines: [
      ['本契約於中華民國 ', f('review_date'), ' 經承租人攜回審閱 ', f('review_days'), '（契約審閱期間至少三日）。'],
      ['出租人簽章：', f('landlord_review_signature')],
      ['承租人簽章：', f('tenant_review_signature')],
    ],
  },
  {
    id: 'parties-intro',
    title: '立契約書人',
    lines: [
      ['承租人 ', f('tenant'), '，出租人 ', f('landlord'), '，茲為住宅租賃事宜，雙方同意本契約條款如下：'],
    ],
  },
  {
    id: 'clause-1',
    title: '第一條　租賃標的',
    lines: [
      { subtitle: '（一）租賃住宅標示' },
      ['1、門牌 ', f('address'), '（基地坐落 ', f('land_number'), '）。'],
      ['　　無門牌者，其房屋稅籍編號：', f('tax_id'), '或其位置略圖。'],
      ['2、專有部分建號 ', f('building_number'), '，面積共計 ', f('exclusive_area'), '。'],
      ['　　附屬建物：', choice('accessory_available', ['有', '無']), '　用途 ', f('accessory_purpose'), '，面積 ', f('accessory_area'), '。'],
      { subtitle: '（二）租賃範圍' },
      ['1、租賃住宅 ', choice('rental_scope', ['全部', '部分']), '：', f('rental_room'), '，面積 ', f('rental_area'), '。'],
      ['2、車位：', choice('parking_available', ['有', '無'])],
      ['　　（1）汽車停車位：', f('car_parking_count'), '，種類 ', choice('car_parking_type', ['平面式', '機械式']), '，', f('car_parking_floor'), '，編號 ', f('car_parking_number'), '。'],
      ['　　（2）機車停車位：', f('motorcycle_parking_count'), '，', f('motorcycle_parking_floor'), '，編號 ', f('motorcycle_parking_number'), '。'],
      ['　　（3）使用時間：', choice('parking_usage_time', ['全日', '日間', '夜間', '其他'])],
      ['3、租賃附屬設備：', choice('rental_equipment', ['有', '無']), '　', f('rental_equipment_details')],
      '　　（若有，詳如附件一租賃標的現況確認書。）',
    ],
  },
  {
    id: 'clause-2',
    title: '第二條　租賃期間',
    lines: [
      ['租賃期間自 ', f('start_date'), ' 起至 ', f('end_date'), ' 止。（租賃期間至少三十日以上）'],
      ['交屋／可入住時間：', f('handover_time'), '。'],
    ],
  },
  {
    id: 'clause-3',
    title: '第三條　租金約定及支付',
    lines: [
      ['承租人每月租金為新臺幣 ', f('rent'), '，每期應繳納 ', f('payment_period'), '，並於 ', f('due_day'), ' 支付，不得藉任何理由拖延或拒絕；出租人於租賃期間亦不得藉任何理由要求調漲租金。'],
      ['租金支付方式：', f('payment_method'), '。'],
      ['轉帳帳戶：', f('bank_account'), '。'],
    ],
  },
  {
    id: 'clause-4',
    title: '第四條　押金約定及返還',
    lines: [
      ['押金由租賃雙方約定為 ', f('deposit_months'), '，金額為新臺幣 ', f('deposit'), '（最高不得超過二個月租金之總額）。承租人應於簽訂本契約之同時給付出租人。'],
      '前項押金，除有第十一條第四項、第十三條第三項、第十四條第四項及第十八條第二項得抵充之情形外，出租人應於租期屆滿或租賃契約終止，承租人返還租賃住宅時，返還押金或抵充本契約所生債務後之賸餘押金。',
    ],
  },
  {
    id: 'clause-5',
    title: '第五條　租賃期間相關費用之約定',
    lines: [
      '租賃期間，使用租賃住宅所生之相關費用，依下列約定辦理：',
      ['（一）管理費：', f('management_fee')],
      '　　　租賃期間因不可歸責於租賃雙方之事由，致本費用增加者，承租人就增加部分之金額，以負擔百分之十為限；如本費用減少者，承租人負擔減少後之金額。',
      ['（二）水費：', f('water_fee')],
      ['（三）電費：', f('electricity_billing')],
      ['　　　每度電費／限制：', f('electricity_rate')],
      '　　　（備註：公共設施電費未向台灣電力股份有限公司申辦分攤併入租賃標的電費內者，出租人不得額外收取。出租人所收取之每期電費總金額，不得超過該租賃標的電費單之每期電費總額。）',
      ['（四）瓦斯費：', f('gas_fee')],
      ['（五）網路費：', f('internet_fee')],
      ['（六）其他費用及其支付方式：', f('other_fee')],
    ],
  },
  {
    id: 'clause-6',
    title: '第六條　稅費負擔之約定',
    lines: [
      '本契約有關稅費，依下列約定辦理：',
      '（一）租賃住宅之房屋稅、地價稅由出租人負擔。',
      '（二）本契約租賃雙方同意辦理公證者，其公證費之負擔依雙方約定。',
      '（三）其他稅費及其支付方式依雙方約定。',
    ],
  },
  {
    id: 'clause-7',
    title: '第七條　使用租賃住宅之限制',
    lines: [
      '本租賃住宅係供居住使用，承租人不得變更用途。',
      '承租人同意遵守公寓大廈規約或其他住戶應遵行事項，不得違法使用、存放有爆炸性或易燃性物品。',
      '承租人應經出租人同意始得將本租賃住宅之全部或一部分轉租、出借或以其他方式供他人使用，或將租賃權轉讓於他人。',
      '前項出租人同意轉租者，應出具同意書（如附件二）載明同意轉租之範圍、期間及得終止本契約之事由，供承租人轉租時向次承租人提示。',
    ],
  },
  {
    id: 'clause-8',
    title: '第八條　修繕',
    lines: [
      '租賃住宅或附屬設備損壞時，應由出租人負責修繕。但租賃雙方另有約定、習慣或其損壞係可歸責於承租人之事由者，不在此限。',
      '前項由出租人負責修繕者，承租人得定相當期限催告修繕，如出租人未於承租人所定相當期限內修繕時，承租人得自行修繕，並請求出租人償還其費用或於第三條約定之租金中扣除。',
      '出租人為修繕租賃住宅所為之必要行為，應於相當期間先期通知，承租人無正當理由不得拒絕。',
      '前項出租人於修繕期間，致租賃住宅全部或一部不能居住使用者，承租人得請求出租人扣除該期間全部或一部之租金。',
    ],
  },
  {
    id: 'clause-9',
    title: '第九條　室內裝修',
    lines: [
      '承租人有室內裝修之需要，應經出租人同意並依相關法令規定辦理，且不得損害原有建築結構之安全。',
      '承租人經出租人同意裝修者，其裝修增設部分若有損壞，由承租人負責修繕。',
      '第一項情形，承租人返還租賃住宅時，應依雙方約定負責回復原狀、現況返還或其他方式處理。',
    ],
  },
  {
    id: 'clause-10',
    title: '第十條　出租人之義務及責任',
    lines: [
      '出租人應出示有權出租本租賃住宅之證明文件及國民身分證或其他足資證明身分之文件，供承租人核對。',
      '出租人應以合於所約定居住使用之租賃住宅，交付承租人，並應於租賃期間保持其合於居住使用之狀態。',
      '出租人與承租人簽訂本契約前，租賃住宅有由承租人負責修繕之項目及範圍者，出租人應先向承租人說明並經承租人確認（如附件三），未經約明確認者，出租人應負責修繕，並提供有修繕必要時之聯絡方式。',
      '依第五條規定約定電費由承租人負擔者，出租人應提供承租人租賃標的之電費資訊。承租人亦得逕向台灣電力股份有限公司申辦查詢租賃期間之有關電費資訊。',
    ],
  },
  {
    id: 'clause-11',
    title: '第十一條　承租人之義務及責任',
    lines: [
      '承租人應於簽訂本契約時，出示國民身分證或其他足資證明身分之文件，供出租人核對。',
      '承租人應以善良管理人之注意，保管、使用租賃住宅。',
      '承租人違反前項義務，致租賃住宅毀損或滅失者，應負損害賠償責任。但依約定之方法或依租賃住宅之性質使用、收益，致有變更或毀損者，不在此限。',
      '前項承租人應賠償之金額，得由第四條第一項規定之押金中抵充，如有不足，並得向承租人請求給付不足之金額。',
      '承租人經出租人同意轉租者，與次承租人簽訂轉租契約時，應不得逾出租人同意轉租之範圍及期間，並應於簽訂轉租契約後三十日內，以書面將轉租範圍、期間、次承租人之姓名及通訊住址等相關資料通知出租人。',
    ],
  },
  {
    id: 'clause-12',
    title: '第十二條　租賃住宅部分滅失',
    lines: [
      '租賃關係存續中，因不可歸責於承租人之事由，致租賃住宅之一部滅失者，承租人得按滅失之部分，請求減少租金。',
    ],
  },
  {
    id: 'clause-13',
    title: '第十三條　任意終止租約之約定',
    lines: [
      '本契約於期限屆滿前，除依第十六條及第十七條規定得提前終止租約外，租賃雙方得否任意終止租約，依雙方約定。',
      '依前項約定得終止租約者，租賃之一方應至少於終止前一個月通知他方。一方未為先期通知而逕行終止租約者，應賠償他方最高不得超過一個月租金額之違約金。',
      '前項承租人應賠償之違約金，得由第四條第一項規定之押金中抵充，如有不足，並得向承租人請求給付不足之金額。',
      '租期屆滿前，依第一項終止租約者，出租人已預收之租金應返還予承租人。',
    ],
  },
  {
    id: 'clause-14',
    title: '第十四條　租賃住宅之返還',
    lines: [
      '租賃關係消滅時，出租人應即結算租金及第五條約定之相關費用，並會同承租人共同完成屋況及附屬設備之點交手續，承租人應將租賃住宅返還出租人並遷出戶籍或其他登記。',
      '前項租賃之一方未會同點交，經他方定相當期限催告仍不會同者，視為完成點交。',
      '承租人未依第一項規定返還租賃住宅時，出租人應即明示不以不定期限繼續契約，並得向承租人請求未返還租賃住宅期間之相當月租金額，及相當月租金額計算之違約金（未足一個月者，以日租金折算）至返還為止。',
      '前項金額與承租人未繳清之租金及第五條約定之相關費用，出租人得由第四條第一項規定之押金中抵充，如有不足，並得向承租人請求給付不足之金額或費用。',
    ],
  },
  {
    id: 'clause-15',
    title: '第十五條　租賃住宅所有權之讓與',
    lines: [
      '出租人於租賃住宅交付後，承租人占有中，縱將其所有權讓與第三人，本契約對於受讓人仍繼續存在。',
      '前項情形，出租人應移交押金及已預收之租金與受讓人，並以書面通知承租人。',
      '本契約如未經公證，其期限逾五年者，不適用前二項之規定。',
    ],
  },
  {
    id: 'clause-16',
    title: '第十六條　出租人提前終止租約',
    lines: [
      '租賃期間有下列情形之一者，出租人得提前終止租約，且承租人不得要求任何賠償：',
      '（一）出租人為重新建築而必要收回。',
      '（二）承租人遲付租金之總額達二個月之租金額，經出租人定相當期限催告，仍不為支付。',
      '（三）承租人積欠管理費或其他應負擔之費用達二個月之租金額，經出租人定相當期限催告，仍不為支付。',
      '（四）承租人違反第七條第一項規定，擅自變更用途，經出租人阻止仍繼續為之。',
      '（五）承租人違反第七條第二項規定，違法使用、存放有爆炸性或易燃性物品，經出租人阻止仍繼續為之。',
      '（六）承租人違反第七條第三項規定，擅自將租賃住宅轉租或轉讓租賃權予他人。',
      '（七）承租人毀損租賃住宅或附屬設備，經出租人定相當期限催告仍不為修繕或相當之賠償。',
      '（八）承租人違反第九條第一項規定，未經出租人同意，擅自進行室內裝修，經出租人阻止仍繼續為之。',
      '（九）承租人違反第九條第一項規定，未依相關法令規定進行室內裝修，經出租人阻止仍繼續為之。',
      '（十）承租人違反第九條第一項規定，進行室內裝修，損害原有建築結構之安全。',
      '出租人依前項規定提前終止租約者，應依下列規定期限，檢附相關事證，以書面通知承租人。但依前項第五款及第十款規定終止者，得不先期通知：',
      '（一）依前項第一款規定終止者，於終止前三個月。',
      '（二）依前項第二款至第四款、第六款至第九款規定終止者，於終止前三十日。',
    ],
  },
  {
    id: 'clause-17',
    title: '第十七條　承租人提前終止租約',
    lines: [
      '租賃期間有下列情形之一，承租人得提前終止租約，出租人不得要求任何賠償：',
      '（一）租賃住宅未合於所約定居住使用，並有修繕之必要，經承租人定相當期限催告，仍不於期限內修繕。',
      '（二）租賃住宅因不可歸責承租人之事由致一部滅失，且其存餘部分不能達租賃之目的。',
      '（三）租賃住宅有危及承租人或其同居人之安全或健康之瑕疵；承租人於簽約時已明知該瑕疵或拋棄終止租約權利者，亦同。',
      '（四）承租人因疾病、意外產生有長期療養之需要。',
      '（五）因第三人就租賃住宅主張其權利，致承租人不能為約定之居住使用。',
      '承租人依前項各款規定提前終止租約者，應於終止前三十日，檢附相關事證，以書面通知出租人。但前項第三款前段其情況危急者，得不先期通知。',
      '承租人死亡，其繼承人得主張終止租約，其通知期限及方式，準用前項規定。',
    ],
  },
  {
    id: 'clause-18',
    title: '第十八條　遺留物之處理',
    lines: [
      '租賃關係消滅，依第十四條完成點交或視為完成點交之手續後，承租人仍於租賃住宅有遺留物者，除租賃雙方另有約定外，經出租人定相當期限向承租人催告，屆期仍不取回時，視為拋棄其所有權。',
      '出租人處理前項遺留物所生費用，得由第四條第一項規定之押金中抵充，如有不足，並得向承租人請求給付不足之費用。',
      ['本契約之約定：', f('leftover_handling')],
    ],
  },
  {
    id: 'clause-19',
    title: '第十九條　履行本契約之通知',
    lines: [
      '除本契約另有約定外，租賃雙方相互間之通知，以郵寄為之者，應以本契約所記載之地址為準。',
      '如因地址變更未告知他方，致通知無法到達時，以第一次郵遞之日期推定為到達日。',
      '第一項之通知得經租賃雙方約定以電子郵件信箱、手機簡訊或即時通訊軟體以文字顯示方式為之。',
    ],
  },
  {
    id: 'clause-20',
    title: '第二十條　條款疑義處理',
    lines: ['本契約各條款如有疑義時，應為有利於承租人之解釋。'],
  },
  {
    id: 'clause-21',
    title: '第二十一條　其他約定',
    lines: [
      '本契約租賃雙方得約定是否辦理公證。',
      '本契約經辦理公證者，租賃雙方得約定公證書載明下列事項應逕受強制執行：一、承租人如於租期屆滿後不返還租賃住宅。二、承租人未依約給付之欠繳租金、費用及出租人或租賃住宅所有權人代繳之管理費，或違約時應支付之金額。三、出租人如於租期屆滿或本契約終止時，應返還承租人之全部或一部押金。',
      '公證書載明金錢債務逕受強制執行時，如有保證人者，其效力及於保證人。',
    ],
  },
  {
    id: 'clause-22',
    title: '第二十二條　契約及其相關附件效力',
    lines: [
      '本契約自簽約日起生效，租賃雙方各執一份契約正本。',
      '本契約廣告及相關附件視為本契約之一部分。',
    ],
  },
  {
    id: 'clause-23',
    title: '第二十三條　未盡事宜之處置',
    lines: ['本契約如有未盡事宜，依有關法令、習慣、平等互惠及誠實信用原則公平解決之。'],
  },
  {
    id: 'jurisdiction',
    title: '第一審管轄法院',
    lines: [
      ['因本契約發生之爭議，以 ', f('jurisdiction_court'), ' 為第一審管轄法院（不得排除法定管轄）。'],
    ],
  },
  {
    id: 'signatures',
    title: '立契約書人',
    lines: [
      { subtitle: '出租人' },
      ['姓名（名稱）：', f('landlord')],
      ['統一編號（身分證明文件編號）：', f('landlord_id')],
      ['戶籍地址（營業登記地址）：', f('landlord_registered_address')],
      ['通訊地址：', f('landlord_mailing_address')],
      ['聯絡電話：', f('landlord_phone')],
      { subtitle: '承租人' },
      ['姓名（名稱）：', f('tenant')],
      ['統一編號（身分證明文件編號）：', f('tenant_id')],
      ['戶籍地址（營業登記地址）：', f('tenant_registered_address')],
      ['通訊地址：', f('tenant_mailing_address')],
      ['聯絡電話：', f('tenant_phone')],
    ],
  },
  {
    id: 'authorization',
    title: '代理或轉租資料',
    conditionalOn: ['agent_name', 'agent_id', 'authorization_document', 'sublease_consent'],
    lines: [
      ['代理人姓名：', f('agent_name')],
      ['代理人統一編號：', f('agent_id')],
      ['代理授權證明：', f('authorization_document')],
      ['出租人轉租同意：', f('sublease_consent')],
    ],
  },
  {
    id: 'attachments',
    title: '附件',
    lines: [
      { note: '本契約範本另有附件：建物所有權狀影本或其他有權出租之證明文件、使用執照影本、雙方身分證明文件影本、保證人身分證影本、授權代理人簽約同意書、租賃標的現況確認書（附件一）、出租人同意轉租範圍與租賃期間及終止租約事由確認書（附件二）、承租人負責修繕項目及範圍確認書（附件三）、附屬設備清單、租賃住宅位置格局示意圖等。這些附件不在辨識範圍內，未於此處還原。' },
    ],
  },
]

/** 未辨識的表示法一律當成空白。 */
const UNRECOGNIZED = /^(?:尚未辨識|待確認|人工輸入|無法辨識)$/

function clean(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
  return !trimmed || UNRECOGNIZED.test(trimmed) ? '' : trimmed
}

/**
 * 回拼契約。
 *
 * @param {Record<string, string>} values 欄位 id → 值
 * @returns {{ sections: Array, filledCount: number, blankCount: number, blankLabels: string[] }}
 *   sections 是結構化的呈現資料，由前端決定怎麼畫；這支模組不產生 HTML 字串。
 */
export function buildContractDocument(values) {
  const get = (fieldId) => clean(values?.[fieldId])
  const blankFieldIds = new Set()
  let filledCount = 0

  const sections = TEMPLATE.filter(
    (section) => !section.conditionalOn || section.conditionalOn.some((fieldId) => get(fieldId)),
  ).map((section) => ({
    id: section.id,
    title: section.title,
    lines: section.lines.map((line) => {
      // 純字串 = 範本的固定條文（沒有任何空格要填）
      if (typeof line === 'string') {
        return { kind: 'text', segments: [{ kind: 'literal', text: line }] }
      }
      if (!Array.isArray(line)) return { kind: 'aside', ...line }

      return {
        kind: 'text',
        segments: line.map((part) => {
          if (typeof part === 'string') return { kind: 'literal', text: part }

          const value = get(part.fieldId)
          if (value) filledCount += 1
          else blankFieldIds.add(part.fieldId)

          if (part.kind === 'choice') {
            return {
              kind: 'choice',
              fieldId: part.fieldId,
              label: FIELD_LABELS.get(part.fieldId) ?? part.fieldId,
              options: part.options.map((option) => ({
                text: option,
                // 「有」對上「有附屬設備」這類寫法，所以用包含而非全等
                checked: Boolean(value) && value.includes(option),
              })),
            }
          }

          return {
            kind: 'value',
            fieldId: part.fieldId,
            label: FIELD_LABELS.get(part.fieldId) ?? part.fieldId,
            text: value || BLANK,
            filled: Boolean(value),
          }
        }),
      }
    }),
  }))

  return {
    sections,
    filledCount,
    blankCount: blankFieldIds.size,
    blankLabels: [...blankFieldIds].map((fieldId) => FIELD_LABELS.get(fieldId) ?? fieldId),
  }
}

/**
 * 從資料庫的 rentals 一列還原成欄位 id → 值。
 *
 * 與 contract-rental-mapping.js 的寫入方向互為反向：那邊把中文字串轉成
 * 資料庫型別，這邊轉回人看的字串。因為欄位是 1:1 攤平的，這裡只做加單位，
 * 不做任何字串拆解。
 */
export function documentValuesFromRental(rental) {
  if (!rental) return {}

  const rocDate = (iso) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
    if (!match) return ''
    return `民國 ${Number(match[1]) - 1911} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`
  }
  const unit = (value, suffix) => (value === null || value === undefined || value === '' ? '' : `${value} ${suffix}`)
  const money = (value) =>
    value === null || value === undefined ? '' : `${Number(value).toLocaleString('en-US')} 元整`

  return {
    review_date: rocDate(rental.review_date),
    review_days: unit(rental.review_days, '日'),
    landlord_review_signature: rental.has_landlord_review_signature ? '已簽章' : '未簽章',
    tenant_review_signature: rental.has_tenant_review_signature ? '已簽章' : '未簽章',

    landlord: rental.landlord_name ?? '',
    tenant: rental.tenant_name ?? '',
    landlord_id: rental.landlord_national_id ?? '',
    tenant_id: rental.tenant_national_id ?? '',
    landlord_registered_address: rental.landlord_registered_address ?? '',
    tenant_registered_address: rental.tenant_registered_address ?? '',
    landlord_mailing_address: rental.landlord_contact_address ?? '',
    tenant_mailing_address: rental.tenant_contact_address ?? '',
    landlord_phone: rental.landlord_phone ?? '',
    tenant_phone: rental.tenant_phone ?? '',

    agent_name: rental.agent_name ?? '',
    agent_id: rental.agent_national_id ?? '',
    authorization_document: rental.authorization_document ?? '',
    sublease_consent: rental.sublease_consent ?? '',

    address: rental.address ?? '',
    tax_id: rental.tax_id ?? '',
    land_number: rental.land_number ?? '',
    building_number: rental.building_number ?? '',
    exclusive_area: unit(rental.building_area, '平方公尺'),
    accessory_available: rental.has_annex_building ? '有' : '無',
    accessory_purpose: rental.annex_building_purpose ?? '',
    accessory_area: unit(rental.annex_building_area, '平方公尺'),

    rental_scope: rental.rental_scope === 'partial' ? '部分' : '全部',
    rental_room: rental.rental_room ?? '',
    rental_area: unit(rental.rental_area, '平方公尺'),
    parking_available: rental.has_parking ? '有' : '無',
    car_parking_count: unit(rental.car_parking_count, '個'),
    car_parking_type: rental.car_parking_type ?? '',
    car_parking_floor: rental.car_parking_floor ?? '',
    car_parking_number: rental.car_parking_number ?? '',
    motorcycle_parking_count: unit(rental.motorcycle_parking_count, '個'),
    motorcycle_parking_floor: rental.motorcycle_parking_floor ?? '',
    motorcycle_parking_number: rental.motorcycle_parking_number ?? '',
    parking_usage_time: rental.parking_usage_time ?? '',
    rental_equipment: rental.has_equipment ? '有' : '無',
    rental_equipment_details: rental.equipment_list ?? '',

    start_date: rocDate(rental.start_date),
    end_date: rocDate(rental.end_date),
    handover_time: rocDate(rental.handover_date),

    rent: money(rental.rent_amount),
    payment_period: unit(rental.payment_interval_months, '個月租金'),
    due_day: rental.payment_day ? `每月 ${rental.payment_day} 日以前` : '',
    payment_method: rental.payment_method ?? '',
    bank_account: rental.bank_account ?? '',

    deposit_months: unit(rental.deposit_months, '個月租金'),
    deposit: money(rental.deposit_amount),

    management_fee: rental.management_fee_rule ?? '',
    water_fee: rental.water_fee_rule ?? '',
    electricity_billing: rental.electricity_fee_type ?? '',
    electricity_rate: rental.electricity_fee_rate ?? '',
    gas_fee: rental.gas_fee_rule ?? '',
    internet_fee: rental.network_fee_rule ?? '',
    other_fee: rental.other_fees_rule ?? '',

    leftover_handling: rental.abandoned_items_rule ?? '',
    jurisdiction_court: rental.jurisdiction_court ?? '',
  }
}

/** 從校對頁的 fieldReviews 取值（同一工作階段內，不需要資料庫）。 */
export function documentValuesFromFieldReviews(fieldReviews) {
  return Object.fromEntries(
    Object.entries(fieldReviews ?? {}).map(([fieldId, review]) => [fieldId, clean(review?.value)]),
  )
}

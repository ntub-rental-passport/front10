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
 * 範本原文見 rag/住宅租賃契約書_structured.md。這裡只收錄有欄位可填的條文；
 * 純固定條文（第六～第二十二條的義務、修繕、終止等）不重述，改以一行註明
 * 依範本原文，避免呈現一份我們無法從欄位還原的內容卻看起來像完整契約。
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
      ['　　無門牌者，其房屋稅籍編號：', f('tax_id'), '。'],
      ['2、專有部分建號 ', f('building_number'), '，面積共計 ', f('exclusive_area'), '。'],
      ['　　附屬建物：', choice('accessory_available', ['有', '無']), '　用途 ', f('accessory_purpose'), '，面積 ', f('accessory_area'), '。'],
      { subtitle: '（二）租賃範圍' },
      ['1、租賃住宅 ', choice('rental_scope', ['全部', '部分']), '：', f('rental_room'), '，面積 ', f('rental_area'), '。'],
      ['2、車位：', choice('parking_available', ['有', '無'])],
      ['　　（1）汽車停車位：', f('car_parking_count'), '，種類 ', choice('car_parking_type', ['平面式', '機械式']), '，', f('car_parking_floor'), '，編號 ', f('car_parking_number'), '。'],
      ['　　（2）機車停車位：', f('motorcycle_parking_count'), '，', f('motorcycle_parking_floor'), '，編號 ', f('motorcycle_parking_number'), '。'],
      ['　　（3）使用時間：', choice('parking_usage_time', ['全日', '日間', '夜間', '其他'])],
      ['3、租賃附屬設備：', choice('rental_equipment', ['有', '無']), '　', f('rental_equipment_details')],
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
    ],
  },
  {
    id: 'clause-5',
    title: '第五條　租賃期間相關費用之約定',
    lines: [
      ['（一）管理費：', f('management_fee')],
      ['（二）水費：', f('water_fee')],
      ['（三）電費：', f('electricity_billing')],
      ['　　　每度電費／限制：', f('electricity_rate')],
      ['（四）瓦斯費：', f('gas_fee')],
      ['（五）網路費：', f('internet_fee')],
      ['（六）其他費用及其支付方式：', f('other_fee')],
    ],
  },
  {
    id: 'standard-clauses',
    title: '第六條至第二十二條',
    lines: [
      { note: '稅費負擔、使用限制、修繕、室內裝修、雙方義務與責任、提前終止、租賃住宅返還、當事人死亡等條文，依內政部定型化契約範本原文，未逐條複製於此。' },
    ],
  },
  {
    id: 'clause-leftover',
    title: '遺留物之處理',
    lines: [
      [f('leftover_handling')],
    ],
  },
  {
    id: 'clause-jurisdiction',
    title: '第一審管轄法院',
    lines: [
      ['因本契約發生之爭議，以 ', f('jurisdiction_court'), ' 為第一審管轄法院（不得排除法定管轄）。'],
    ],
  },
  {
    id: 'clause-23',
    title: '第二十三條　當事人及其基本資料',
    lines: [
      { subtitle: '出租人' },
      ['姓名／名稱：', f('landlord')],
      ['統一編號／身分證字號：', f('landlord_id')],
      ['戶籍地址：', f('landlord_registered_address')],
      ['通訊地址：', f('landlord_mailing_address')],
      ['聯絡電話：', f('landlord_phone')],
      { subtitle: '承租人' },
      ['姓名／名稱：', f('tenant')],
      ['統一編號／身分證字號：', f('tenant_id')],
      ['戶籍地址：', f('tenant_registered_address')],
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

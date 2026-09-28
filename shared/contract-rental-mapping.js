/**
 * 把「合約校對頁」的欄位審閱結果（fieldReviews）轉成 `rentals` 資料表的欄位。
 *
 * 校對頁的欄位是給人看的中文字串（「民國 114 年 7 月 14 日」、「20,000 元」、
 * 「有」、「每月 5 日以前」），資料庫要的是 DATE / INT / BOOLEAN / ENUM。
 * 這個模組是兩者之間唯一的轉換點，放在 shared/ 讓前端與測試共用。
 *
 * ⚠️ 轉不出來就回報 missing，絕對不要猜值填進資料庫 ——
 * 這些欄位之後會拿來算帳單、提醒繳租、核租屋補助，猜錯比缺漏更難發現。
 */
import { parseRocDate } from './contract-field-validation.js'
import { CONTRACT_FIELD_DEFINITIONS } from './contract-field-schema.js'

/** 校對頁對「沒認出來」的表示法；一律視為空值。 */
const UNRECOGNIZED = /^(?:尚未辨識|待確認|人工輸入|無法辨識)$/

const FIELD_LABELS = new Map(
  CONTRACT_FIELD_DEFINITIONS.map((definition) => [definition.id, definition.label]),
)

/**
 * `rentals` 中 NOT NULL 且沒有預設值的欄位——缺其中任何一個就不能寫入。
 * total_periods 由租期與繳納週期推算，不在此列。
 */
const REQUIRED_FIELD_IDS = ['address', 'start_date', 'end_date', 'rent', 'due_day', 'deposit']

function normalizeDigits(value) {
  return String(value ?? '').replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  )
}

/** 取出欄位的字串值；空字串、未辨識標記都回傳 ''。 */
function text(reviews, fieldId) {
  const raw = reviews?.[fieldId]?.value
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  return !trimmed || UNRECOGNIZED.test(trimmed) ? '' : trimmed
}

/** 把民國或西元日期轉成 MySQL DATE 用的 YYYY-MM-DD；認不出來回 null。 */
export function toIsoDate(value) {
  const normalized = normalizeDigits(value).trim()
  if (!normalized) return null

  const roc = parseRocDate(normalized)
  if (roc) {
    return `${roc.rocYear + 1911}-${String(roc.month).padStart(2, '0')}-${String(roc.day).padStart(2, '0')}`
  }

  // 西元四位年（parseRocDate 只吃 2~3 位的民國年）
  const ad = normalized.match(/^(\d{4})\s*(?:年|[/.-])\s*(\d{1,2})\s*(?:月|[/.-])\s*(\d{1,2})\s*日?$/)
  if (!ad) return null
  const [, year, month, day] = ad.map(Number)
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 「交屋／可入住時間」可能帶時刻（「民國 114 年 8 月 1 日 下午 3 時」），
 * handover_date 只存日期，取前面的日期部分。
 */
function toHandoverDate(value) {
  const normalized = normalizeDigits(value).trim()
  if (!normalized) return null
  return toIsoDate(normalized) ?? toIsoDate(normalized.match(/(?:民國\s*)?\d{2,4}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2}\s*日?/)?.[0] ?? '')
}

/** 金額：只認阿拉伯數字，「新臺幣貳萬元」這種國字金額一律視為認不出來。 */
export function toAmount(value) {
  const digits = normalizeDigits(value).replace(/[,，\s]/g, '').match(/\d+/)?.[0]
  if (!digits) return null
  const amount = Number(digits)
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

/** 「每月 5 日以前」→ 5；「每月底以前」→ 31。 */
export function toPaymentDay(value) {
  const normalized = normalizeDigits(value).replace(/\s+/g, '')
  if (!normalized) return null
  if (/月底|月末/.test(normalized)) return 31
  const day = Number(normalized.match(/(\d{1,2})日/)?.[1] ?? NaN)
  return day >= 1 && day <= 31 ? day : null
}

/** 「2 個月」→ 2。上限 12（每期繳納月數）或 2（押金，法定上限另由風險分析提醒）。 */
function toMonths(value, max) {
  const months = Number(normalizeDigits(value).match(/\d{1,2}/)?.[0] ?? NaN)
  return months >= 1 && months <= max ? months : null
}

/** 面積：「30 平方公尺」→ 30。 */
function toArea(value) {
  const area = Number(normalizeDigits(value).replace(/[,，\s]/g, '').match(/\d+(?:\.\d+)?/)?.[0] ?? NaN)
  return Number.isFinite(area) && area > 0 ? Number(area.toFixed(2)) : null
}

/** 勾選類欄位：「有」／「是」→ true，「無」／「否」→ false，其他 → null（沒填）。 */
export function toTriState(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  if (/^(?:有|是|已簽章|已簽名|已完成|✓|V)$/i.test(normalized)) return true
  if (/^(?:無|否|未簽章|未簽名|尚未)$/.test(normalized)) return false
  return null
}

/** 租期起訖 + 每期月數 → 總期數；跨月不足一期者仍算一期。 */
export function countPeriods(startIso, endIso, intervalMonths) {
  if (!startIso || !endIso) return null
  const start = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null

  // end_date 是租期最後一天（含），所以要用「隔天」來算月數：
  // 8/1 至次年 7/31 是整整 12 個月，直接相減只會得到 11。
  const exclusiveEnd = new Date(end.getTime())
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)

  const wholeMonths =
    (exclusiveEnd.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (exclusiveEnd.getUTCMonth() - start.getUTCMonth()) +
    (exclusiveEnd.getUTCDate() >= start.getUTCDate() ? 0 : -1)
  // 不足一個月的尾巴仍要繳一期租金。
  const months = Math.max(1, wholeMonths + (exclusiveEnd.getUTCDate() === start.getUTCDate() ? 0 : 1))
  const interval = intervalMonths >= 1 ? intervalMonths : 1
  return Math.ceil(months / interval)
}

/** 「1 個」→ 1；認不出數字回 null（不猜 0，0 個車位與沒填是兩件事）。 */
function toCount(value) {
  const count = Number(normalizeDigits(value).match(/\d{1,3}/)?.[0] ?? NaN)
  return Number.isInteger(count) && count >= 0 ? count : null
}

/** 超過資料庫欄位長度就截斷，避免整筆寫入被 MySQL 擋掉。 */
function clamp(value, maxLength) {
  if (!value) return null
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

/**
 * 建立 `rentals` 寫入用的 payload。
 *
 * @param {object|null} ocrResult 校對頁儲存的 ContractOcrResult
 * @returns {{ rental: object|null, missing: Array<{id: string, label: string}>, warnings: string[] }}
 *   missing 不為空時 rental 為 null——呼叫端應該要求使用者回頭補齊欄位。
 */
export function buildRentalPayload(ocrResult) {
  const reviews = ocrResult?.fieldReviews ?? {}
  const value = (fieldId) => text(reviews, fieldId)

  const address = value('address')
  const startDate = toIsoDate(value('start_date'))
  const endDate = toIsoDate(value('end_date'))
  const rentAmount = toAmount(value('rent'))
  const paymentDay = toPaymentDay(value('due_day'))
  const depositAmount = toAmount(value('deposit'))
  const intervalMonths = toMonths(value('payment_period'), 12) ?? 1
  const totalPeriods = countPeriods(startDate, endDate, intervalMonths)

  const resolved = {
    address,
    start_date: startDate,
    end_date: endDate,
    rent: rentAmount,
    due_day: paymentDay,
    deposit: depositAmount,
  }
  const missing = REQUIRED_FIELD_IDS.filter((fieldId) => !resolved[fieldId]).map((fieldId) => ({
    id: fieldId,
    label: FIELD_LABELS.get(fieldId) ?? fieldId,
  }))

  const warnings = []
  if (endDate && startDate && endDate <= startDate) {
    warnings.push('租期結束日不得早於或等於起始日，請回頭確認租賃期間。')
  }
  if (!missing.length && !totalPeriods) {
    warnings.push('無法由租賃期間推算總期數，請確認租期起訖日期。')
  }
  if (missing.length || warnings.length) {
    return { rental: null, missing, warnings }
  }

  const accessory = toTriState(value('accessory_available'))
  const parking = toTriState(value('parking_available'))
  const equipment = toTriState(value('rental_equipment'))
  const partialScope = /部分/.test(value('rental_scope'))

  // 每個校對欄位對一個資料庫欄位，一律 1:1。
  // 曾經把車位七個欄位串成 `數量：1 個；編號：第 20 號` 存進單一 VARCHAR，
  // 回拼契約時就得反解析自己寫出來的字串，格式一改就壞——不要再這樣做。
  return {
    missing: [],
    warnings: [],
    rental: {
      // 【1】審閱期
      review_date: toIsoDate(value('review_date')),
      review_days: toMonths(value('review_days'), 99) ?? null,
      has_landlord_review_signature: toTriState(value('landlord_review_signature')) ?? false,
      has_tenant_review_signature: toTriState(value('tenant_review_signature')) ?? false,

      // 【2】住宅標示
      address,
      tax_id: clamp(value('tax_id'), 100),
      land_number: clamp(value('land_number'), 100),
      building_number: clamp(value('building_number'), 100),
      building_area: toArea(value('exclusive_area')),
      has_annex_building: accessory ?? false,
      annex_building_purpose: clamp(value('accessory_purpose'), 255),
      annex_building_area: toArea(value('accessory_area')),

      // 【3】租賃範圍
      rental_scope: partialScope ? 'partial' : 'entire',
      rental_room: clamp(value('rental_room'), 255),
      rental_area: toArea(value('rental_area')),
      has_parking: parking ?? false,
      car_parking_count: toCount(value('car_parking_count')),
      car_parking_type: clamp(value('car_parking_type'), 20),
      car_parking_floor: clamp(value('car_parking_floor'), 30),
      car_parking_number: clamp(value('car_parking_number'), 50),
      motorcycle_parking_count: toCount(value('motorcycle_parking_count')),
      motorcycle_parking_floor: clamp(value('motorcycle_parking_floor'), 30),
      motorcycle_parking_number: clamp(value('motorcycle_parking_number'), 100),
      parking_usage_time: clamp(value('parking_usage_time'), 30),
      has_equipment: equipment ?? false,
      equipment_list: value('rental_equipment_details') || null,

      // 【4】租賃期間
      start_date: startDate,
      end_date: endDate,
      handover_date: toHandoverDate(value('handover_time')),

      // 【5】租金與繳納
      rent_amount: rentAmount,
      payment_interval_months: intervalMonths,
      payment_day: paymentDay,
      payment_method: clamp(value('payment_method'), 50),
      total_periods: totalPeriods,

      // 【6】押金
      deposit_months: toMonths(value('deposit_months'), 12) ?? null,
      deposit_amount: depositAmount,

      // 【7】費用
      management_fee_rule: clamp(value('management_fee'), 255),
      water_fee_rule: clamp(value('water_fee'), 255),
      electricity_fee_type: clamp(value('electricity_billing'), 100),
      electricity_fee_rate: clamp(value('electricity_rate'), 100),
      gas_fee_rule: clamp(value('gas_fee'), 255),
      network_fee_rule: clamp(value('internet_fee'), 255),
      other_fees_rule: value('other_fee') || null,

      // 【8】其他條款
      abandoned_items_rule: value('leftover_handling') || null,
      jurisdiction_court: clamp(value('jurisdiction_court'), 100),

      // 【9】雙方基本資料（送到後端後由 EncryptedText 加密落地）
      // 上限是「明文字元數」：VARBINARY(255) 扣掉 29 bytes 標頭與 tag 後只剩
      // 226 bytes，中文一字 3 bytes，故姓名一類抓 70 字元；
      // VARBINARY(512) 同理可放 160 字元，地址與帳戶抓 150 留餘裕。
      landlord_name: clamp(value('landlord'), 70),
      landlord_national_id: clamp(value('landlord_id'), 30),
      landlord_registered_address: clamp(value('landlord_registered_address'), 150),
      landlord_contact_address: clamp(value('landlord_mailing_address'), 150),
      landlord_phone: clamp(value('landlord_phone'), 50),
      tenant_name: clamp(value('tenant'), 70),
      tenant_national_id: clamp(value('tenant_id'), 30),
      tenant_registered_address: clamp(value('tenant_registered_address'), 150),
      tenant_contact_address: clamp(value('tenant_mailing_address'), 150),
      tenant_phone: clamp(value('tenant_phone'), 50),
      // 轉帳帳戶含金融機構、戶名與帳號，與身分證同等敏感，一樣加密
      bank_account: clamp(value('bank_account'), 150),

      // 【10】代理或轉租
      agent_name: clamp(value('agent_name'), 70),
      agent_national_id: clamp(value('agent_id'), 30),
      authorization_document: clamp(value('authorization_document'), 255),
      sublease_consent: clamp(value('sublease_consent'), 255),
    },
  }
}

/** 給 UI 用：這份契約有哪些必填欄位還沒辨識或校對完成。 */
export function describeMissingFields(missing) {
  return missing.map((field) => field.label).join('、')
}

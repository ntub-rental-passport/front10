const TAIWAN_ID_LETTER_CODES = {
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 34,
  J: 18,
  K: 19,
  L: 20,
  M: 21,
  N: 22,
  O: 35,
  P: 23,
  Q: 24,
  R: 25,
  S: 26,
  T: 27,
  U: 28,
  V: 29,
  W: 32,
  X: 30,
  Y: 31,
  Z: 33,
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/[０-９]/g, (digit) =>
    String(digit.charCodeAt(0) - 0xfee0),
  )
}

export function isValidTaiwanNationalId(value) {
  const normalized = normalizeDigits(value).replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z][12]\d{8}$/.test(normalized)) return false
  const code = TAIWAN_ID_LETTER_CODES[normalized[0]]
  if (!code) return false

  const digits = [...normalized.slice(1)].map(Number)
  const sum =
    Math.floor(code / 10) +
    (code % 10) * 9 +
    digits.slice(0, 8).reduce((total, digit, index) => total + digit * (8 - index), 0) +
    digits[8]
  return sum % 10 === 0
}

export function isValidTaiwanBusinessNumber(value) {
  const normalized = normalizeDigits(value).replace(/\D/g, '')
  if (!/^\d{8}$/.test(normalized)) return false
  const weights = [1, 2, 1, 2, 1, 2, 4, 1]
  const sum = [...normalized].reduce((total, character, index) => {
    const product = Number(character) * weights[index]
    return total + Math.floor(product / 10) + (product % 10)
  }, 0)
  return sum % 10 === 0 || (normalized[6] === '7' && (sum + 1) % 10 === 0)
}

export function isValidTaiwanIdentityNumber(value) {
  const normalized = normalizeDigits(value).replace(/\s/g, '').toUpperCase()
  return isValidTaiwanNationalId(normalized) || isValidTaiwanBusinessNumber(normalized)
}

export function isValidPersonOrEntityName(value) {
  const normalized = String(value ?? '').trim()
  if (normalized.length < 2 || normalized.length > 60) return false
  return /^[\p{Script=Han}A-Za-z·‧.'’\-（）()\s]+$/u.test(normalized)
}

export function parseRocDate(value) {
  const normalized = normalizeDigits(value).trim()
  const match = normalized.match(
    /^(?:民國\s*)?(\d{2,3})\s*(?:年|[/.-])\s*(\d{1,2})\s*(?:月|[/.-])\s*(\d{1,2})\s*日?$/,
  )
  if (!match) return null
  const rocYear = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (rocYear < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(rocYear + 1911, month - 1, day)
  if (
    date.getFullYear() !== rocYear + 1911 ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return { rocYear, month, day }
}

export function isValidRocDate(value) {
  return Boolean(parseRocDate(value))
}

export function isValidPositiveArea(value) {
  const normalized = normalizeDigits(value).replace(/,/g, '').trim()
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(平方公尺|坪)$/)
  return Boolean(match && Number(match[1]) > 0)
}

export function isValidLandNumber(value) {
  const normalized = normalizeDigits(value).replace(/\s/g, '')
  return /段(?:[^地號]{0,20}小段)?[^地號]{0,20}\d+(?:-\d+)?地號$/.test(normalized)
}

export function isValidBuildingNumber(value) {
  const normalized = normalizeDigits(value).replace(/\s/g, '')
  return /^(?:[\p{Script=Han}A-Za-z0-9-]{0,30})\d+(?:-\d+)?建號$/u.test(normalized)
}

export function isValidTaiwanPhone(value) {
  const normalized = normalizeDigits(value)
    .trim()
    .replace(/^\+886[\s-]?/, '0')
  if (!/^[0-9()\s-]+$/.test(normalized)) return false
  const digits = normalized.replace(/\D/g, '')
  return /^09\d{8}$/.test(digits) || /^0[2-8]\d{7,8}$/.test(digits)
}

export function isValidPartyAddress(value) {
  const normalized = normalizeDigits(value).replace(/\s+/g, '').trim()
  if (/^(?:同上|同戶籍地址|同本租賃住宅|同租賃住宅)$/.test(normalized)) return true
  if (normalized.length < 6 || normalized.length > 120 || /^\d+$/.test(normalized)) return false
  return /(?:縣|市).*(?:區|鄉|鎮|市).*(?:路|街|大道|村|里|段|巷|弄|號)/.test(normalized)
}

export function isValidMoney(value) {
  const normalized = normalizeDigits(value).replace(/\s+/g, '').trim()
  return /^(?:NT\$|新臺幣|新台幣)?(?:[1-9]\d{0,11}|[1-9]\d{0,2}(?:,\d{3}){1,3})元?$/.test(
    normalized,
  )
}

export function isValidTaxId(value) {
  const normalized = normalizeDigits(value).replace(/[\s-]/g, '')
  return /^\d{6,30}$/.test(normalized)
}

export function isValidRentalRoom(value) {
  const normalized = normalizeDigits(value).trim()
  if (normalized.length < 2 || normalized.length > 60) return false
  return /(?:第?\s*(?:B?\d+|[一二三四五六七八九十]+)\s*樓|樓層|房間|第?\s*[A-Za-z0-9一二三四五六七八九十-]+\s*(?:房|室))/.test(
    normalized,
  )
}

export function isValidPaymentPeriod(value) {
  const normalized = normalizeDigits(value).replace(/\s+/g, '')
  const match = normalized.match(/^(\d{1,2})個?月(?:租金)?$/)
  return Boolean(match && Number(match[1]) >= 1 && Number(match[1]) <= 12)
}

export function isValidDueDay(value) {
  const normalized = normalizeDigits(value).replace(/\s+/g, '')
  if (/^每月底(?:以前|前)$/.test(normalized)) return true
  const match = normalized.match(/^每月(\d{1,2})日(?:以前|前)$/)
  return Boolean(match && Number(match[1]) >= 1 && Number(match[1]) <= 31)
}

export function isValidPaymentMethod(value) {
  const normalized = String(value ?? '').trim()
  return /^(?:現金(?:繳付|支付)?|轉帳(?:繳付|支付)?|匯款|其他(?:[：:].{1,30})?)$/.test(normalized)
}

export function isValidBankAccount(value) {
  const normalized = normalizeDigits(value).replace(/\s+/g, '')
  return /(?:銀行|金融機構)/.test(normalized) && /戶名/.test(normalized) && /帳號[:：]?[0-9-]{6,}/.test(normalized)
}

export function isValidExpenseAgreement(value) {
  const normalized = normalizeDigits(value).trim()
  if (normalized.length < 2 || normalized.length > 120) return false
  return /(?:出租人|承租人|房東|房客|甲方|乙方|依帳單|每度|每月|新臺幣|NT\$|元|免收|不收取|包含於租金|其他)/.test(
    normalized,
  )
}

export function isValidHandoverTime(value) {
  const normalized = normalizeDigits(value).trim()
  return isValidRocDate(normalized) || /(?:交屋|入住|搬入).*(?:民國)?\d{2,3}[年/.-]\d{1,2}/.test(normalized)
}

export function isValidContractFieldFormat(format, value, options = []) {
  const normalized = String(value ?? '').trim()
  if (!normalized || /尚未辨識|待確認|人工輸入/.test(normalized)) return false

  switch (format) {
    case 'money':
      return isValidMoney(normalized)
    case 'date':
      return isValidRocDate(normalized)
    case 'name':
      return isValidPersonOrEntityName(normalized)
    case 'id':
      return isValidTaiwanIdentityNumber(normalized)
    case 'phone':
      return isValidTaiwanPhone(normalized)
    case 'address':
    case 'party_address':
      return isValidPartyAddress(normalized)
    case 'tax_id':
      return isValidTaxId(normalized)
    case 'days': {
      const days = Number(normalized.match(/\d+/)?.[0] ?? 0)
      return /^\d+\s*日$/.test(normalized) && days >= 3
    }
    case 'months': {
      const months = Number(normalized.match(/\d+/)?.[0] ?? 0)
      return /^\d+\s*個?月(?:租金)?$/.test(normalized) && months > 0
    }
    case 'area':
      return isValidPositiveArea(normalized)
    case 'land_number':
      return isValidLandNumber(normalized)
    case 'building_number':
      return isValidBuildingNumber(normalized)
    case 'purpose':
      return /^[\p{Script=Han}A-Za-z、，,／/\s]{2,30}$/u.test(normalized)
    case 'choice':
      return options.includes(normalized)
    case 'count':
      return /^\d+\s*個$/.test(normalized)
    case 'floor':
      return /^(?:地上|地下)\s*(?:第\s*)?B?\d+\s*層$/i.test(normalized)
    case 'parking_number':
      return /^(?:第\s*)?[A-Za-z0-9-]+\s*號$/.test(normalized) || /位置示意圖/.test(normalized)
    case 'rental_room':
      return isValidRentalRoom(normalized)
    case 'handover_time':
      return isValidHandoverTime(normalized)
    case 'payment_period':
      return isValidPaymentPeriod(normalized)
    case 'due_day':
      return isValidDueDay(normalized)
    case 'payment_method':
      return isValidPaymentMethod(normalized)
    case 'bank_account':
      return isValidBankAccount(normalized)
    case 'expense':
      return isValidExpenseAgreement(normalized)
    case 'signature':
      return /(?:簽章|簽署|已簽|蓋章)/.test(normalized)
    case 'authorization_evidence':
      return /授權/.test(normalized) && /(?:書|證明|文件|檢附|載明)/.test(normalized)
    case 'sublease_evidence':
      return /轉租/.test(normalized) && /(?:同意|授權|證明|文件|檢附)/.test(normalized)
    case 'leftover_clause':
      return /遺留物/.test(normalized) && /(?:催告|通知)/.test(normalized) && /(?:拋棄|處理)/.test(normalized)
    case 'court':
      return /^臺灣[^，,。]{1,20}地方法院/.test(normalized)
    default:
      return normalized.length > 0
  }
}

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
    /^(?:民國\s*)?(\d{2,3})\s*(?:年|[/.\-])\s*(\d{1,2})\s*(?:月|[/.\-])\s*(\d{1,2})\s*日?$/,
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

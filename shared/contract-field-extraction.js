import { resolveTaiwanAddress } from './taiwan-address-resolver.js'

const EMPTY_CANDIDATE = { value: '', sourceValue: '', confidence: 'low' }

const FINANCIAL_DIGITS = {
  零: 0, 〇: 0, '○': 0, 一: 1, 壹: 1, 二: 2, 貳: 2, 贰: 2, 兩: 2, 两: 2,
  三: 3, 參: 3, 叁: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陸: 6, 陆: 6,
  七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9,
}
const SMALL_UNITS = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 }
const MONEY_TOKEN =
  '[0-9０-９,，零〇○一二三四五六七八九十百千萬万億亿壹貳贰參叁肆伍陸陆柒捌玖拾佰仟兩两]+'
const DATE_TOKEN = '[0-9０-９〇○零一二三四五六七八九十]+'

function normalizeFullWidthDigits(value) {
  return value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0))
}

function cleanSource(value) {
  return value?.replace(/^[\s:：。．、-]+|[\s。；;]+$/g, '').replace(/\s+/g, ' ').trim() ?? ''
}

function candidate(value, sourceValue, confidence) {
  return { value: cleanSource(value), sourceValue: cleanSource(sourceValue), confidence }
}

function captureFirst(text, patterns) {
  for (const pattern of patterns) {
    const value = cleanSource(text.match(pattern)?.[1])
    if (value) return value
  }
  return ''
}

function normalizePersonName(rawValue) {
  const value = cleanSource(rawValue)
    .replace(/[（(].*$/, '')
    .replace(/以下簡稱.*$/, '')
    .replace(/[\[［【].*?[\]］】]/g, '')
    .trim()
  if (/遮蔽|模糊|不清|姓名|身分證/.test(value)) return ''
  return /^[\p{Script=Han}·‧]{2,20}$/u.test(value) ? value : ''
}

function extractPerson(text, role) {
  const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rawValue = captureFirst(text, [
    new RegExp(`${escapedRole}\\s*[（(][^\\r\\n）)]*[）)]\\s*[：:]\\s*([^\\r\\n]+)`),
    new RegExp(`${escapedRole}姓名\\s*[：:]\\s*([^\\r\\n]+)`),
    new RegExp(`${escapedRole}\\s*[：:]\\s*([^\\r\\n，,。]{1,30})`),
    new RegExp(`${escapedRole}[^\\r\\n]*[\\r\\n]+(?:[^\\r\\n]*[\\r\\n]+){0,2}\\s*(?:[o○•]\\s*)?姓名\\s*[：:]\\s*([^\\r\\n]+)`),
  ])
  if (/遮蔽/.test(rawValue)) return candidate('影像遮蔽，請人工輸入', rawValue, 'low')
  const value = normalizePersonName(rawValue)
  return value ? candidate(value, rawValue, 'medium') : { ...EMPTY_CANDIDATE }
}

export function parseChineseInteger(rawValue) {
  const normalized = normalizeFullWidthDigits(rawValue).replace(/[\s,，]/g, '')
  if (!normalized) return null
  if (/^\d+$/.test(normalized)) return Number(normalized)
  if (!/[十拾百佰千仟萬万億亿]/.test(normalized)) {
    const digits = [...normalized].map((character) => FINANCIAL_DIGITS[character])
    return digits.every((digit) => digit !== undefined) ? Number(digits.join('')) : null
  }

  let total = 0
  let section = 0
  let digit = 0
  for (const character of normalized) {
    if (/\d/.test(character)) digit = Number(character)
    else if (FINANCIAL_DIGITS[character] !== undefined) digit = FINANCIAL_DIGITS[character]
    else if (SMALL_UNITS[character]) {
      section += (digit || 1) * SMALL_UNITS[character]
      digit = 0
    } else if (character === '萬' || character === '万') {
      total += ((section += digit) || 1) * 10000
      section = 0
      digit = 0
    } else if (character === '億' || character === '亿') {
      total = (total + (section += digit) || 1) * 100000000
      section = 0
      digit = 0
    } else return null
  }
  return total + section + digit
}

function formatMoney(amount) {
  return `NT$${amount.toLocaleString('en-US')}`
}

function extractMoney(text, contextPatterns) {
  for (const contextPattern of contextPatterns) {
    const pattern = new RegExp(`${contextPattern}[^\\r\\n]{0,50}?(?:新臺幣|新台幣|臺幣|台幣|NT\\$?)?\\s*(${MONEY_TOKEN})\\s*元(?:正|整)?`)
    const match = text.match(pattern)
    const rawValue = cleanSource(match?.[1])
    if (!rawValue || /[年月日]/.test(rawValue) || /[年日]/.test(match?.[0] ?? '')) continue
    const amount = parseChineseInteger(rawValue)
    if (amount !== null && amount > 0 && amount <= 100000000) {
      return candidate(formatMoney(amount), rawValue, 'medium')
    }
  }
  return { ...EMPTY_CANDIDATE }
}

function extractAddress(text) {
  const rawValue = captureFirst(text, [
    /(?:甲方)?房屋所在地及使用範圍\s*[：:]?\s*([^\r\n。]{3,100})/,
    /租賃住宅地址[\s\S]{0,100}?(?:位置\s*)?[：:]\s*([^\r\n]+)/,
    /(?:租屋地址|房屋地址|租賃標的地址)\s*[：:]\s*([^\r\n]+)/,
    /坐落於\s*([^\r\n，。]+?)(?:之房屋|，|。)/,
  ])
  if (!rawValue) return { ...EMPTY_CANDIDATE }
  const addressResolution = resolveTaiwanAddress(rawValue, { contractText: text })
  const normalizedAddress = addressResolution.normalizedAddress || rawValue
  const area = normalizedAddress.match(/([\p{Script=Han}]{1,6}[縣市][\p{Script=Han}]{1,8}(?:鄉|鎮|市|區)[\p{Script=Han}]{1,8}(?:村|里)?)/u)?.[1]
  const value = area && normalizedAddress.length <= area.length + 2
    ? `${area}［地址不完整，後段待確認］`
    : normalizedAddress
  return {
    ...candidate(value, rawValue, addressResolution.confidence),
    addressResolution,
  }
}

function formatRocDate(yearText, monthText, dayText) {
  const year = parseChineseInteger(yearText)
  const month = parseChineseInteger(monthText)
  const day = dayText ? parseChineseInteger(dayText) : null
  if (!year || !month || month > 12 || (day !== null && (day < 1 || day > 31))) return ''
  return day ? `民國 ${year} 年 ${month} 月 ${day} 日` : `民國 ${year} 年 ${month} 月［日期待確認］`
}

function extractDates(text) {
  const startMatch = text.match(new RegExp(`自\\s*(?:民國\\s*)?(${DATE_TOKEN})\\s*年\\s*(${DATE_TOKEN})\\s*月(?:\\s*(${DATE_TOKEN})?\\s*日)?\\s*起`))
  const endMatch = text.match(new RegExp(`至\\s*(?:民國\\s*)?(${DATE_TOKEN})\\s*年\\s*(${DATE_TOKEN})\\s*月(?:\\s*(${DATE_TOKEN})?\\s*日)?\\s*止`))
  const startValue = startMatch ? formatRocDate(startMatch[1] ?? '', startMatch[2] ?? '', startMatch[3]) : ''
  const endValue = endMatch ? formatRocDate(endMatch[1] ?? '', endMatch[2] ?? '', endMatch[3]) : ''
  const startSource = startMatch?.[0].replace(/^自\s*/, '').replace(/\s*起$/, '') ?? ''
  const endSource = endMatch?.[0].replace(/^至\s*/, '').replace(/\s*止$/, '') ?? ''
  return {
    startDate: startValue ? candidate(startValue, startSource, startMatch?.[3] ? 'medium' : 'low') : { ...EMPTY_CANDIDATE },
    endDate: endValue ? candidate(endValue, endSource, endMatch?.[3] ? 'medium' : 'low') : { ...EMPTY_CANDIDATE },
  }
}

function extractDueDay(text) {
  const monthEnd = text.match(/(?:租金應於\s*)?(每月(?:底|月)\s*(?:以)?前)(?:繳納)?/)
  if (monthEnd?.[1]) return candidate('每月底前', monthEnd[1], 'medium')
  const numbered = text.match(/(?:租金\s*)?每月\s*([0-9０-９]{1,2})\s*日\s*前/)
  const day = numbered?.[1] ? parseChineseInteger(numbered[1]) : null
  return day && day <= 31
    ? candidate(`每月 ${day} 日前`, numbered[0], 'medium')
    : { ...EMPTY_CANDIDATE }
}

function extractPenalty(text) {
  const fixedAmount = extractMoney(text, ['違約金'])
  if (fixedAmount.value) return fixedAmount
  const tenant = text.match(/(乙方[^\r\n。；]{0,100}?(?:提前(?:遷離|終止|解約)|遷離)[^\r\n。；]{0,100}?一個月租金)/)
  const landlord = text.match(/(甲方[^\r\n。；]{0,100}?提前解約[^\r\n。；]{0,100}?一個月租金[^\r\n。；]{0,40})/)
  const moving = /甲方[^\r\n。；]{0,140}?(?:搬遷|搬家)費用/.test(text)
  const summaries = []
  if (tenant) summaries.push('乙方提前終止：1 個月租金')
  if (landlord) summaries.push(`甲方提前解約：1 個月租金${moving ? '及搬遷費用' : ''}`)
  if (summaries.length) {
    return candidate(summaries.join('；'), [tenant?.[1], landlord?.[1]].filter(Boolean).join('；'), summaries.length === 2 ? 'medium' : 'low')
  }
  const generic = text.match(/((?:支付相當於|賠償)[^\r\n。；]{0,40}?一個月租金)/)
  return generic?.[1] ? candidate('1 個月租金', generic[1], 'low') : { ...EMPTY_CANDIDATE }
}

export function extractContractFieldCandidates(text) {
  const dates = extractDates(text)
  return {
    landlord: extractPerson(text, '出租人'),
    tenant: extractPerson(text, '承租人'),
    address: extractAddress(text),
    startDate: dates.startDate,
    endDate: dates.endDate,
    rent: extractMoney(text, ['(?:租金每個月|每月租金|月租金|租金\\s*[：:]?\\s*每月)']),
    dueDay: extractDueDay(text),
    deposit: extractMoney(text, ['(?:押租保證金|押金|保證金)']),
    penalty: extractPenalty(text),
  }
}

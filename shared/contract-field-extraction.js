import { resolveTaiwanAddress } from './taiwan-address-resolver.js'

const EMPTY_CANDIDATE = { value: '', sourceValue: '', confidence: 'low' }

const FINANCIAL_DIGITS = {
  零: 0,
  〇: 0,
  '○': 0,
  一: 1,
  壹: 1,
  二: 2,
  貳: 2,
  贰: 2,
  兩: 2,
  两: 2,
  三: 3,
  參: 3,
  叁: 3,
  四: 4,
  肆: 4,
  五: 5,
  伍: 5,
  六: 6,
  陸: 6,
  陆: 6,
  七: 7,
  柒: 7,
  八: 8,
  捌: 8,
  九: 9,
  玖: 9,
}
const SMALL_UNITS = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 }
const MONEY_TOKEN =
  '[0-9０-９,，零〇○一二三四五六七八九十百千萬万億亿壹貳贰參叁肆伍陸陆柒捌玖拾佰仟兩两]+'
const DATE_TOKEN = '[0-9０-９〇○零一二三四五六七八九十]+'

function normalizeFullWidthDigits(value) {
  return value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0))
}

// 內政部官方範本的欄位標籤常在冒號前夾一組括號註記：
//   「姓名(名稱)：」「統一編號(身分證明文件編號)：」「戶籍地址(營業登記地址)：」
// 原本的比對要求標籤後「立刻」接冒號，於是照官方範本填寫的合約
// 一律抽不到姓名與統一編號 —— 而那是必填欄位。
// 2026-09-10 實測：四種常見寫法沒有一種能同時抽到姓名與統編。
const LABEL_SUFFIX = '(?:\\s*[（(][^）)]{0,20}[）)])?\\s*[：:]\\s*'


function cleanSource(value) {
  return (
    value
      ?.replace(/^[\s:：。．、-]+|[\s。；;]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim() ?? ''
  )
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
    .replace(/[[［【].*?[\]］】]/g, '')
    // 官方範本的姓名欄同一行右側就是「簽章」欄位，OCR 會一起讀進來：
    //   「姓名(名稱)：陳大華　　簽章」→ 值變成「陳大華 簽章」而驗不過
    .replace(/[\s　]*(?:簽章|簽名|蓋章|用印)[\s　]*$/, '')
    .trim()
  if (/遮蔽|模糊|不清|姓名|身分證/.test(value)) return ''
  return /^[\p{Script=Han}·‧]{2,20}$/u.test(value) ? value : ''
}

function extractPersonNearHeading(text, role) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanSource(line))
  const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 官方範本的當事人標題就是「出租人：」，原本的比對不允許尾隨冒號，
  // 導致緊接其後的「姓名(名稱)：」永遠找不到。
  const headingPattern = new RegExp(
    `^(?:[0-9０-９]+\\s*[.．、]?\\s*)?${escapedRole}(?:\\s*[（(][^）)]*[）)])?\\s*[：:]?\\s*$`,
  )
  const anyPartyHeadingPattern =
    /^(?:[0-9０-９]+\s*[.．、]?\s*)?(?:出租人|承租人|連帶保證人|保證人)(?:\s*[（(][^）)]*[）)])?\s*[：:]?\s*$/
  const namePattern = new RegExp(`^(?:[oO○●•·▪]\\s*)?姓名${LABEL_SUFFIX}(.+)$`)

  for (let headingIndex = 0; headingIndex < lines.length; headingIndex += 1) {
    if (!headingPattern.test(lines[headingIndex] ?? '')) continue

    for (const line of lines.slice(headingIndex + 1, headingIndex + 8)) {
      if (anyPartyHeadingPattern.test(line)) break
      const name = cleanSource(line.match(namePattern)?.[1])
      if (name) return name
    }
  }
  return ''
}

function extractPerson(text, role) {
  const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rawValue =
    extractPersonNearHeading(text, role) ||
    captureFirst(text, [
      new RegExp(`${escapedRole}\\s*[（(][^\\r\\n）)]*[）)]\\s*[：:]\\s*([^\\r\\n]+)`),
      new RegExp(`${escapedRole}姓名${LABEL_SUFFIX}([^\\r\\n]+)`),
      new RegExp(`${escapedRole}\\s*[：:]\\s*([^\\r\\n，,。]{1,30})`),
    ])
  if (/遮蔽/.test(rawValue)) return candidate('影像遮蔽，請人工輸入', rawValue, 'low')
  const value = normalizePersonName(rawValue)
  return value ? candidate(value, rawValue, 'medium') : { ...EMPTY_CANDIDATE }
}

function partySection(text, role) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanSource(line))
  const rolePattern = new RegExp(
    `^(?:[0-9０-９]+\\s*[.．、]?\\s*)?${role}(?:\\s*[（(][^）)]*[）)])?(?:\\s*[：:].*)?$`,
  )
  const otherRolePattern = new RegExp(
    `^(?:[0-9０-９]+\\s*[.．、]?\\s*)?(?:${role === '出租人' ? '承租人' : '出租人'}|連帶保證人|代理人)(?:\\s*[（(][^）)]*[）)])?(?:\\s*[：:].*)?$`,
  )
  const start = lines.findIndex((line) => rolePattern.test(line))
  if (start < 0) return ''

  const section = [lines[start]]
  for (const line of lines.slice(start + 1, start + 14)) {
    // 多欄 PDF 的 OCR 閱讀順序可能把下一章標題插入當事人資料中間。
    // 當事人標籤本身已足夠明確，因此只以另一位當事人的標題作為區段終點。
    if (otherRolePattern.test(line)) break
    section.push(line)
  }
  return section.join('\n')
}

function extractPartyLabeledValue(text, role, labels) {
  const section = partySection(text, role)
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = section.match(new RegExp(`(?:${labelPattern})${LABEL_SUFFIX}([^\\r\\n]+)`))
  const rawValue = cleanSource(match?.[1])
  return rawValue ? candidate(rawValue, rawValue, 'medium') : { ...EMPTY_CANDIDATE }
}

function extractPartyDetails(text, role) {
  const registeredAddress = extractPartyLabeledValue(text, role, ['戶籍地址', '營業登記地址'])
  const mailingAddress = extractPartyLabeledValue(text, role, ['通訊地址'])
  if (/^(?:同上|同戶籍地址)$/.test(mailingAddress.value) && registeredAddress.value) {
    mailingAddress.value = registeredAddress.value
    mailingAddress.confidence = 'low'
  }

  return {
    name: extractPerson(text, role),
    id: extractPartyLabeledValue(text, role, [
      '國民身分證統一編號',
      '身分證明文件編號',
      '身分證字號',
      '統一編號',
    ]),
    registeredAddress,
    mailingAddress,
    phone: extractPartyLabeledValue(text, role, ['聯絡電話', '電話', '手機']),
  }
}

function extractPresence(text, patterns, label) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[0]) return candidate(label, match[0], 'low')
  }
  return { ...EMPTY_CANDIDATE }
}

function extractLabeledText(text, patterns) {
  const rawValue = captureFirst(text, patterns)
  return rawValue ? candidate(rawValue, rawValue, 'medium') : { ...EMPTY_CANDIDATE }
}

function extractNearbyLine(text, labels) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanSource(line))
  const line = lines.find((item) => labels.some((label) => item.includes(label))) ?? ''
  return line ? candidate(line, line, 'low') : { ...EMPTY_CANDIDATE }
}

// 條號開頭的行代表換了一條，費用約定不可能跨條 ——
// 越過這條界線去抓「下一條的勾選框」會抓到完全無關的內容。
const CLAUSE_HEADING = /^第[一二三四五六七八九十百零〇\d]+條/

function extractExpenseAgreement(text, labels) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanSource(line))
  const labelList = Array.isArray(labels) ? labels : [labels]

  let labelIndex = -1
  let label = ''
  for (const candidateLabel of labelList) {
    const index = lines.findIndex((line) => line.includes(candidateLabel))
    if (index >= 0 && (labelIndex < 0 || index < labelIndex)) {
      labelIndex = index
      label = candidateLabel
    }
  }
  if (labelIndex < 0) return { ...EMPTY_CANDIDATE }

  // ⚠️ 先看標籤自己這一行有沒有把答案寫完整。
  //
  // 原本的順序是「先在後 5 行裡找任何有 ■ 的行」，於是
  // 「（六）其他費用及其支付方式：清潔費每月 200 元，由承租人負擔。」
  // 這種已經寫完的敘述式約定，會被 4 行之後、屬於下一條的
  // 「（二）本契約租賃雙方□同意 ■不同意辦理公證。」蓋過去 ——
  // 抽到的內容跟這個欄位毫無關係。2026-09-10 實測踩到。
  const ownLine = lines[labelIndex]
  const afterLabel = ownLine
    .slice(ownLine.indexOf(label) + label.length)
    .replace(/^[：:\s]+/, '')
  if (afterLabel.length > 1 && !/^[□]/.test(afterLabel)) {
    return candidate(ownLine, ownLine, /[■☑✓]/.test(ownLine) ? 'medium' : 'low')
  }

  // 往後找勾選行，但不跨條
  const nearbyLines = []
  for (const line of lines.slice(labelIndex, labelIndex + 5)) {
    if (nearbyLines.length && CLAUSE_HEADING.test(line)) break
    nearbyLines.push(line)
  }

  const checkedLine = nearbyLines.find((line) => /[■☑✓]/.test(line))
  if (checkedLine) return candidate(checkedLine, checkedLine, 'medium')

  const narrative = nearbyLines.find((line, index) => {
    if (/□/.test(line)) return false
    if (index === 0) {
      const afterLabel = line.slice(line.indexOf(label) + label.length).replace(/^[：:\s]+/, '')
      return afterLabel.length > 1
    }
    return /由.+負擔|每(?:月|期|度)|計費|新臺幣|NT\$|元/.test(line)
  })
  return narrative ? candidate(narrative, narrative, 'low') : { ...EMPTY_CANDIDATE }
}

function extractRentalScope(text) {
  const line = String(text ?? '')
    .split(/\r?\n/)
    .map((item) => cleanSource(item))
    .find((item) => /租賃範圍|出租範圍|類型|租賃住宅[^\r\n]{0,12}(?:全部|部分|[□■☑✓])/.test(item))
  if (!line) return { ...EMPTY_CANDIDATE }

  const checked = line.match(/[■☑✓]\s*(全部|部分)/)?.[1]
  if (checked) return candidate(checked, line, 'medium')
  if (/□/.test(line)) return { ...EMPTY_CANDIDATE }

  const direct = line.match(
    /(?:租賃住宅|租賃範圍|出租範圍|類型)\s*[：:]?\s*(全部|部分|整棟|整層|分租[^，,。]*)/,
  )?.[1]
  return direct ? candidate(direct, line, 'medium') : { ...EMPTY_CANDIDATE }
}

function extractBinaryChoice(text, labels) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanSource(line))
  const line = lines.find((item) => labels.some((label) => item.includes(label))) ?? ''
  if (!line) return { ...EMPTY_CANDIDATE }
  const checked = line.match(/[■☑✓●◆]\s*(有|無)/)?.[1]
  if (checked) return candidate(checked, line, 'medium')
  const direct = line.match(/(?:有無|是否)?\s*[：:]?\s*(有|無)(?:\s|$|，|。)/)?.[1]
  return direct ? candidate(direct, line, 'low') : { ...EMPTY_CANDIDATE }
}

function extractParkingDetails(text) {
  const parkingLine =
    String(text ?? '')
      .split(/\r?\n/)
      .find((line) => /車位[：:]|汽車停車位|機車停車位/.test(line)) ?? ''
  const checkedAvailability = parkingLine.match(/[■☑✓●◆]\s*(有|無)/)?.[1]
  const directAvailability = parkingLine.match(/(?:車位|汽車位)\s*[：:]\s*(有|無)/)?.[1]
  const hasParkingDetails = /平面式停車位|機械式停車位|編號第?\s*[A-Za-z0-9０-９-]+\s*號/.test(
    text,
  )
  const parkingAvailable = checkedAvailability || directAvailability || (hasParkingDetails ? '有' : '')

  const carContext = text.match(/汽車停車位[\s\S]{0,180}/)?.[0] ?? ''
  const motorcycleLine =
    String(text ?? '')
      .split(/\r?\n/)
      .find((line) => /機車停車位\s*[：:]/.test(line)) ?? ''
  const motorcycleContext =
    motorcycleLine || text.match(/機車停車位[\s\S]{0,140}/)?.[0] || ''
  const carCount =
    captureFirst(text, [/汽車停車位\s*([0-9０-９]+)\s*個/]) ||
    captureFirst(carContext, [/停車位\s*([0-9０-９]+)\s*個/])
  const motorcycleCount = captureFirst(text, [/機車停車位\s*([0-9０-９]+)\s*個/])
  const carType =
    carContext.match(/[■☑✓●◆]\s*(平面式|機械式)停車位/)?.[1] ||
    carContext.match(/(?:種類[及與]編號[：:]?)?[^\r\n]{0,30}(平面式|機械式)停車位/)?.[1] ||
    ''
  const carFloor = captureFirst(carContext, [
    /地上\s*第?\s*([0-9０-９]+)\s*層/,
    /地下\s*第?\s*([A-Za-z0-9０-９-]+)\s*層/,
    /地上\s*\(下\)\s*第?\s*([A-Za-z0-9０-９-]+)\s*層/,
  ])
  const motorcycleFloor = captureFirst(motorcycleContext, [
    /地上\s*第?\s*([0-9０-９]+)\s*層/,
    /地下\s*第?\s*([A-Za-z0-9０-９-]+)\s*層/,
    /地上\s*\(下\)\s*第?\s*([A-Za-z0-9０-９-]+)\s*層/,
  ])
  const carNumber = captureFirst(carContext, [/編號\s*第?\s*([A-Za-z0-9０-９-]+)\s*號/])
  const motorcycleNumber = captureFirst(motorcycleContext, [
    /編號\s*第?\s*([A-Za-z0-9０-９-]+)\s*號/,
  ])
  const usageLine =
    String(text ?? '')
      .split(/\r?\n/)
      .find((line) => /使用時間/.test(line)) ?? ''
  const usage =
    usageLine.match(/[■☑✓●◆]\s*(全日|日間|夜間|其他)/)?.[1] ||
    usageLine.match(/使用時間\s*[：:]\s*(全日|日間|夜間|其他)/)?.[1] ||
    ''

  return {
    parking_available: parkingAvailable
      ? candidate(parkingAvailable, parkingLine, 'medium')
      : { ...EMPTY_CANDIDATE },
    car_parking_count: carCount
      ? candidate(normalizeFullWidthDigits(carCount) + ' 個', carCount, 'medium')
      : { ...EMPTY_CANDIDATE },
    car_parking_type: carType ? candidate(carType, carContext, 'medium') : { ...EMPTY_CANDIDATE },
    car_parking_floor: carFloor
      ? candidate(normalizeFullWidthDigits(carFloor) + ' 層', carFloor, 'low')
      : { ...EMPTY_CANDIDATE },
    car_parking_number: carNumber
      ? candidate('第 ' + normalizeFullWidthDigits(carNumber) + ' 號', carNumber, 'medium')
      : { ...EMPTY_CANDIDATE },
    motorcycle_parking_count: motorcycleCount
      ? candidate(normalizeFullWidthDigits(motorcycleCount) + ' 個', motorcycleCount, 'medium')
      : { ...EMPTY_CANDIDATE },
    motorcycle_parking_floor: motorcycleFloor
      ? candidate(normalizeFullWidthDigits(motorcycleFloor) + ' 層', motorcycleFloor, 'low')
      : { ...EMPTY_CANDIDATE },
    motorcycle_parking_number: motorcycleNumber
      ? candidate('第 ' + normalizeFullWidthDigits(motorcycleNumber) + ' 號', motorcycleNumber, 'medium')
      : { ...EMPTY_CANDIDATE },
    parking_usage_time: usage ? candidate(usage, usageLine, 'medium') : { ...EMPTY_CANDIDATE },
  }
}

function extractReviewFields(text) {
  const reviewed = text.match(
    new RegExp(
      `(?:本契約)?於\\s*(?:民國\\s*)?(${DATE_TOKEN})\\s*年\\s*(${DATE_TOKEN})\\s*月\\s*(${DATE_TOKEN})\\s*日[^\\r\\n]{0,40}?攜回審閱`,
    ),
  )
  const reviewDateValue = reviewed
    ? formatRocDate(reviewed[1] ?? '', reviewed[2] ?? '', reviewed[3])
    : ''
  const daysMatch = text.match(
    new RegExp(`(?:攜回審閱|審閱期間)[^\\r\\n]{0,20}?(${DATE_TOKEN})\\s*日`),
  )
  const days = daysMatch?.[1] ? parseChineseInteger(daysMatch[1]) : null

  return {
    review_date: reviewDateValue
      ? candidate(reviewDateValue, reviewed?.[0] ?? '', 'medium')
      : { ...EMPTY_CANDIDATE },
    review_days:
      days && days > 0
        ? candidate(`${days} 日`, daysMatch?.[0] ?? '', days >= 3 ? 'medium' : 'low')
        : { ...EMPTY_CANDIDATE },
    landlord_review_signature: extractPresence(
      text,
      [/出租人\s*(?:審閱)?簽章\s*[：:]?/, /出租人\s*[：:]?\s*[^\r\n]{0,30}\(簽章\)/],
      '已載明簽章欄位（請核對是否簽署）',
    ),
    tenant_review_signature: extractPresence(
      text,
      [/承租人\s*(?:審閱)?簽章\s*[：:]?/, /承租人\s*[：:]?\s*[^\r\n]{0,30}\(簽章\)/],
      '已載明簽章欄位（請核對是否簽署）',
    ),
  }
}

function extractArea(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}[^\\r\\n]{0,50}?([0-9０-９,.，]+)\\s*平方公尺`))
    if (match?.[1])
      return candidate(`${normalizeFullWidthDigits(match[1])} 平方公尺`, match[0], 'medium')
  }
  return { ...EMPTY_CANDIDATE }
}

function extractPaymentMethod(text) {
  const line =
    String(text ?? '')
      .split(/\r?\n/)
      .find((item) => /租金支付方式|現金繳付|轉帳繳付/.test(item)) ?? ''
  if (!line) return { ...EMPTY_CANDIDATE }
  if (/□/.test(line) && !/[■☑✓]/.test(line)) return { ...EMPTY_CANDIDATE }
  const methods = []
  const hasOptionMarks = /[□■☑✓]/.test(line)
  const selectedPattern = hasOptionMarks ? '[■☑✓]\\s*' : ''
  if (new RegExp(`${selectedPattern}(?:現金繳付|現金支付)`).test(line)) methods.push('現金')
  if (new RegExp(`${selectedPattern}(?:轉帳繳付|轉帳支付|匯款)`).test(line)) methods.push('轉帳')
  if (new RegExp(`${selectedPattern}其他`).test(line)) methods.push('其他')
  return candidate(methods.join('／') || line, line, 'low')
}

function extractBankAccount(text) {
  const institution = captureFirst(text, [
    /金融機構\s*[：:]\s*([^\r\n，,]+)/,
    /銀行\s*[：:]\s*([^\r\n，,]+)/,
  ])
  const holder = captureFirst(text, [/戶名\s*[：:]\s*([^\r\n，,]+)/])
  const account = captureFirst(text, [/帳號\s*[：:]\s*([0-9０-９-]+)/])
  const parts = [
    institution && `金融機構：${institution}`,
    holder && `戶名：${holder}`,
    account && `帳號：${account}`,
  ].filter(Boolean)
  return parts.length
    ? candidate(parts.join('；'), parts.join('；'), 'medium')
    : { ...EMPTY_CANDIDATE }
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
      section += digit
      total += (section || 1) * 10000
      section = 0
      digit = 0
    } else if (character === '億' || character === '亿') {
      section += digit
      total = (total + section || 1) * 100000000
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
    const pattern = new RegExp(
      `${contextPattern}[^\\r\\n]{0,50}?(?:新臺幣|新台幣|臺幣|台幣|NT\\$?)?\\s*(${MONEY_TOKEN})\\s*元(?:正|整)?`,
    )
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

function extractAddressNearContractLabel(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanSource(line))
  const labelIndex = lines.findIndex((line) => /(?:房|店){1,3}\s*屋所在地及使用範圍/.test(line))
  if (labelIndex < 0) return ''

  for (const line of lines.slice(labelIndex + 1, labelIndex + 14)) {
    if (/第\s*二\s*條/.test(line)) break
    if (
      /(?:縣|市|區|鄉|鎮).*(?:大道|路|街|村|里)/.test(line) &&
      !/以下簡稱|出租人|承租人|保證人/.test(line)
    ) {
      return line
    }
  }
  return ''
}

function extractStandaloneAddressLine(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanSource(line))
    .filter((line) => line.length >= 5 && line.length <= 100)

  const candidates = lines
    .map((line) => ({ line, resolution: resolveTaiwanAddress(line, { contractText: text }) }))
    .filter(
      ({ line, resolution }) =>
        resolution.county &&
        resolution.district &&
        ['accepted', 'inferred'].includes(resolution.status) &&
        /(?:大道|路|街|村|里)/.test(line) &&
        !/以下簡稱|出租人|承租人|保證人|租金|押金/.test(line),
    )
    .sort((left, right) => {
      const leftScore =
        (left.resolution.county?.source === 'google_ocr' ? 2 : 0) +
        (/(?:大道|路|街)/.test(left.line) ? 1 : 0)
      const rightScore =
        (right.resolution.county?.source === 'google_ocr' ? 2 : 0) +
        (/(?:大道|路|街)/.test(right.line) ? 1 : 0)
      return rightScore - leftScore
    })

  return candidates[0]?.line ?? ''
}

function extractAddress(text) {
  const rawValue =
    extractAddressNearContractLabel(text) ||
    captureFirst(text, [
      /(?:甲方)?房屋所在地及使用範圍\s*[：:]?\s*([^\r\n。]{3,100})/,
      /租賃住宅地址[\s\S]{0,100}?(?:位置\s*)?[：:]\s*([^\r\n]+)/,
      /(?:租屋地址|房屋地址|租賃標的地址)\s*[：:]\s*([^\r\n]+)/,
      /坐落於\s*([^\r\n，。]+?)(?:之房屋|，|。)/,
    ]) ||
    extractStandaloneAddressLine(text)
  if (!rawValue) return { ...EMPTY_CANDIDATE }
  const resolvedAddress = resolveTaiwanAddress(rawValue, { contractText: text })
  const normalizedAddress = resolvedAddress.normalizedAddress || rawValue
  const warnings = new Set(resolvedAddress.warnings)
  const hasRoad = /(?:大道|路|街)/.test(normalizedAddress)
  const hasNumberedDoor = /(?:[0-9０-９]+|[〇○零一二三四五六七八九十百]+)\s*號/.test(
    normalizedAddress,
  )
  if (
    (!hasRoad && !/(?:段|巷|弄|號|樓)/.test(normalizedAddress)) ||
    (hasRoad && !hasNumberedDoor)
  ) {
    warnings.add('address_incomplete')
  }
  const addressResolution = {
    ...resolvedAddress,
    warnings: [...warnings],
  }
  return {
    ...candidate(normalizedAddress, rawValue, addressResolution.confidence),
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
  const startMatch = text.match(
    new RegExp(
      `自\\s*(?:民國\\s*)?(${DATE_TOKEN})\\s*年\\s*(${DATE_TOKEN})\\s*月(?:\\s*(${DATE_TOKEN})?\\s*日)?\\s*起`,
    ),
  )
  const endMatch = text.match(
    new RegExp(
      `至\\s*(?:民國\\s*)?(${DATE_TOKEN})\\s*年\\s*(${DATE_TOKEN})\\s*月(?:\\s*(${DATE_TOKEN})?\\s*日)?\\s*止`,
    ),
  )
  const startValue = startMatch
    ? formatRocDate(startMatch[1] ?? '', startMatch[2] ?? '', startMatch[3])
    : ''
  const endValue = endMatch ? formatRocDate(endMatch[1] ?? '', endMatch[2] ?? '', endMatch[3]) : ''
  const startSource = startMatch?.[0].replace(/^自\s*/, '').replace(/\s*起$/, '') ?? ''
  const endSource = endMatch?.[0].replace(/^至\s*/, '').replace(/\s*止$/, '') ?? ''
  return {
    startDate: startValue
      ? candidate(startValue, startSource, startMatch?.[3] ? 'medium' : 'low')
      : { ...EMPTY_CANDIDATE },
    endDate: endValue
      ? candidate(endValue, endSource, endMatch?.[3] ? 'medium' : 'low')
      : { ...EMPTY_CANDIDATE },
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
  const tenant = text.match(
    /(乙方[^\r\n。；]{0,100}?(?:提前(?:遷離|終止|解約)|遷離)[^\r\n。；]{0,100}?一個月租金)/,
  )
  const landlord = text.match(
    /(甲方[^\r\n。；]{0,100}?提前解約[^\r\n。；]{0,100}?一個月租金[^\r\n。；]{0,40})/,
  )
  const moving = /甲方[^\r\n。；]{0,140}?(?:搬遷|搬家)費用/.test(text)
  const summaries = []
  if (tenant) summaries.push('乙方提前終止：1 個月租金')
  if (landlord) summaries.push(`甲方提前解約：1 個月租金${moving ? '及搬遷費用' : ''}`)
  if (summaries.length) {
    return candidate(
      summaries.join('；'),
      [tenant?.[1], landlord?.[1]].filter(Boolean).join('；'),
      summaries.length === 2 ? 'medium' : 'low',
    )
  }
  const generic = text.match(/((?:支付相當於|賠償)[^\r\n。；]{0,40}?一個月租金)/)
  return generic?.[1] ? candidate('1 個月租金', generic[1], 'low') : { ...EMPTY_CANDIDATE }
}

export function extractContractFieldCandidates(text) {
  const dates = extractDates(text)
  const review = extractReviewFields(text)
  const landlord = extractPartyDetails(text, '出租人')
  const tenant = extractPartyDetails(text, '承租人')
  const agent = extractPartyDetails(text, '代理人')
  const deposit = extractMoney(text, ['(?:押租保證金|押金|保證金)'])
  const depositMonthsMatch = text.match(
    /(?:押租保證金|押金)[^\r\n]{0,50}?([0-9０-９一二三四五六七八九十兩两]+)\s*個月租金/,
  )
  const depositMonths = depositMonthsMatch?.[1] ? parseChineseInteger(depositMonthsMatch[1]) : null
  const paymentPeriodMatch = text.match(
    /每期應繳納\s*([0-9０-９一二三四五六七八九十兩两]+)\s*個月租金/,
  )
  const paymentPeriod = paymentPeriodMatch?.[1] ? parseChineseInteger(paymentPeriodMatch[1]) : null
  const rentalRoomMatch = text.match(
    /第\s*([0-9０-９一二三四五六七八九十]+)\s*層[^\r\n]{0,40}?(?:第\s*)?([0-9０-９A-Za-z一二三四五六七八九十]*)\s*(房|室)/,
  )
  const parking = extractParkingDetails(text)
  const accessoryPurpose = captureFirst(text, [
    /附屬建物用途\s*[：:]?\s*([^\r\n，,。]{1,30})/,
    /附屬建物[：:]?\s*(陽台|平台|花台|露台|雨遮)/,
  ])
  const leftoverClause = text.match(
    /(?:十九[、.．]\s*)?遺留物之處理[\s\S]{0,400}?(?:視為拋棄其所有權|請求給付不足之費用)/,
  )?.[0]
  const jurisdictionCourt = captureFirst(text, [
    /以\s*(臺灣[^\r\n，,。]{1,20}地方法院)\s*為第一審管轄法院/,
    /第一審管轄法院\s*[：:]?\s*(臺灣[^\r\n，,。]{1,20}地方法院)/,
  ])

  return {
    ...review,
    landlord: landlord.name,
    landlord_id: landlord.id,
    landlord_registered_address: landlord.registeredAddress,
    landlord_mailing_address: landlord.mailingAddress,
    landlord_phone: landlord.phone,
    tenant: tenant.name,
    tenant_id: tenant.id,
    tenant_registered_address: tenant.registeredAddress,
    tenant_mailing_address: tenant.mailingAddress,
    tenant_phone: tenant.phone,
    agent_name: agent.name,
    agent_id: agent.id,
    authorization_document: extractPresence(
      text,
      [/授權書/, /授權證明/, /授權代理人/],
      '契約載有授權證明（請核對附件）',
    ),
    sublease_consent: extractPresence(
      text,
      [/出租人同意轉租/, /同意轉租書/, /轉租同意書/],
      '契約載有轉租同意（請核對附件）',
    ),
    address: extractAddress(text),
    tax_id: extractLabeledText(text, [/(?:房屋)?稅籍編號\s*[：:]?\s*([^\r\n。]+)/]),
    land_number: extractLabeledText(text, [/(?:基地坐落|地號)\s*[：:]?\s*([^\r\n。]*?地號)/]),
    building_number: extractLabeledText(text, [/(?:專有部分)?建號\s*[：:]?\s*([^\r\n，,。]+)/]),
    exclusive_area: extractArea(text, ['專有部分', '主建物面積']),
    accessory_available: accessoryPurpose || /附屬建物[^\r\n]{0,50}\d+\s*平方公尺/.test(text)
      ? candidate('有', accessoryPurpose || '附屬建物', 'low')
      : { ...EMPTY_CANDIDATE },
    accessory_purpose: accessoryPurpose
      ? candidate(accessoryPurpose, accessoryPurpose, 'medium')
      : { ...EMPTY_CANDIDATE },
    accessory_area: extractArea(text, ['附屬建物面積', '附屬建物']),
    rental_scope: extractRentalScope(text),
    rental_room: rentalRoomMatch?.[0]
      ? candidate(rentalRoomMatch[0], rentalRoomMatch[0], 'low')
      : { ...EMPTY_CANDIDATE },
    rental_area: extractArea(text, ['租賃範圍']),
    parking_space: extractNearbyLine(text, ['汽車停車位', '機車停車位', '車位編號']),
    ...parking,
    rental_equipment: extractBinaryChoice(text, ['租賃附屬設備']),
    startDate: dates.startDate,
    endDate: dates.endDate,
    start_date: dates.startDate,
    end_date: dates.endDate,
    handover_time: extractLabeledText(text, [
      /(?:交屋日期|入住日期|可搬入時間)\s*[：:]\s*([^\r\n]+)/,
    ]),
    rent: extractMoney(text, ['(?:租金每個月|每月租金|月租金|租金\\s*[：:]?\\s*每月)']),
    payment_period: paymentPeriod
      ? candidate(`${paymentPeriod} 個月`, paymentPeriodMatch?.[0] ?? '', 'medium')
      : { ...EMPTY_CANDIDATE },
    dueDay: extractDueDay(text),
    due_day: extractDueDay(text),
    payment_method: extractPaymentMethod(text),
    bank_account: extractBankAccount(text),
    deposit_months: depositMonths
      ? candidate(
          `${depositMonths} 個月租金`,
          depositMonthsMatch?.[0] ?? '',
          depositMonths <= 2 ? 'medium' : 'low',
        )
      : { ...EMPTY_CANDIDATE },
    deposit,
    management_fee: extractExpenseAgreement(text, '管理費'),
    water_fee: extractExpenseAgreement(text, '水費'),
    electricity_billing: extractExpenseAgreement(text, '電費'),
    // 官方範本的寫法是「每期每度___元」，不是「每度電費」
    electricity_rate: extractExpenseAgreement(text, ['每度電費', '每度單價', '平均電價', '每期每度']),
    gas_fee: extractExpenseAgreement(text, '瓦斯費'),
    internet_fee: extractExpenseAgreement(text, '網路費'),
    other_fee: extractExpenseAgreement(text, '其他費用'),
    leftover_handling: leftoverClause
      ? candidate('已載明遺留物處理條款', leftoverClause, 'medium')
      : { ...EMPTY_CANDIDATE },
    jurisdiction_court: jurisdictionCourt
      ? candidate(jurisdictionCourt, jurisdictionCourt, 'medium')
      : { ...EMPTY_CANDIDATE },
    penalty: extractPenalty(text),
  }
}

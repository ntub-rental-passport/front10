import {
  ADDRESS_LOCATION_HINTS,
  ADMIN_DATASET_METADATA,
  HISTORICAL_ADMIN_DIVISIONS,
  TAIWAN_ADMIN_DIVISIONS,
} from './data/taiwan-administrative-divisions.js'

function normalizeText(value) {
  return String(value ?? '')
    .replace(/台/g, '臺')
    .replace(/[\s,，。．、:：]/g, '')
}

function extractReferenceDate(contractText) {
  const normalized = String(contractText ?? '').replace(/\s+/g, '')
  const match = normalized.match(/(?:自|起租日|租期自)?(?:民國)?([0-9０-９]{2,3})年([0-9０-９]{1,2})月(?:([0-9０-９]{1,2})日)?/)
  if (!match) return null
  const year = Number(match[1].replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0)))
  const month = Number(match[2].replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0)))
  const day = Number((match[3] ?? '1').replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0)))
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year + 1911}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function findCountyMatches(text) {
  return TAIWAN_ADMIN_DIVISIONS.filter(({ county, aliases = [] }) =>
    [county, ...aliases].some((name) => text.includes(normalizeText(name))),
  )
}

function findCurrentDistrictMatches(text) {
  return TAIWAN_ADMIN_DIVISIONS.flatMap(({ county, districts }) =>
    districts
      .filter((district) => text.includes(normalizeText(district)))
      .map((district) => ({ county, district })),
  )
}

function findHistoricalMatch(text, referenceDate) {
  return HISTORICAL_ADMIN_DIVISIONS.find((entry) => {
    const countyPresent = text.includes(normalizeText(entry.county))
    const districtPresent = text.includes(normalizeText(entry.district))
    const dateSupportsHistory = Boolean(referenceDate && referenceDate <= entry.validTo)
    const districtLooksLikeCurrentCounty = entry.district === entry.currentCounty
    const namesPresent = districtPresent
      && (!text.includes('縣') || countyPresent)
      && (!districtLooksLikeCurrentCounty || countyPresent || dateSupportsHistory)
    return namesPresent && (!referenceDate || dateSupportsHistory)
  }) ?? null
}

function uniqueLocations(locations) {
  return locations.filter((location, index) =>
    locations.findIndex((candidate) =>
      candidate.county === location.county && candidate.district === location.district,
    ) === index,
  )
}

function replaceLocationPrefix(rawText, county, district, matchedCounty, matchedDistrict) {
  let remainder = String(rawText ?? '').trim()
  let locationEnd = -1
  for (const token of [matchedCounty, matchedDistrict].filter(Boolean)) {
    const pattern = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/臺/g, '[臺台]'), 'g')
    const match = pattern.exec(remainder)
    if (match) locationEnd = Math.max(locationEnd, (match.index ?? 0) + match[0].length)
  }
  if (locationEnd >= 0) {
    remainder = remainder.slice(locationEnd)
  } else {
    for (const token of [matchedCounty, matchedDistrict].filter(Boolean)) {
      const pattern = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/臺/g, '[臺台]'), 'g')
      remainder = remainder.replace(pattern, '')
    }
  }
  remainder = remainder.replace(/^[\s,，。．、:：-]+/, '')
  return `${county}${district}${remainder}`
}

export function resolveTaiwanAddress(rawText, options = {}) {
  const originalText = String(rawText ?? '').trim()
  const text = normalizeText(originalText)
  const referenceDate = options.referenceDate ?? extractReferenceDate(options.contractText)
  const warnings = []

  if (!text) {
    return {
      rawText: originalText,
      normalizedAddress: originalText,
      county: null,
      district: null,
      status: 'unresolved',
      confidence: 'low',
      evidenceType: 'ocr_text',
      referenceDate,
      warnings: ['address_empty'],
    }
  }

  const historical = findHistoricalMatch(text, referenceDate)
  if (historical) {
    const countyWasRead = text.includes(normalizeText(historical.county))
    return {
      rawText: originalText,
      normalizedAddress: replaceLocationPrefix(
        originalText,
        historical.county,
        historical.district,
        countyWasRead ? historical.county : null,
        historical.district,
      ),
      county: { value: historical.county, source: countyWasRead ? 'google_ocr' : 'administrative_inference' },
      district: { value: historical.district, source: 'google_ocr' },
      status: countyWasRead ? 'accepted' : 'inferred',
      confidence: countyWasRead || referenceDate ? 'high' : 'medium',
      evidenceType: countyWasRead ? 'ocr_text' : 'administrative_inference',
      referenceDate,
      warnings,
    }
  }

  const countyMatches = findCountyMatches(text)
  const districtMatches = findCurrentDistrictMatches(text)
  const compatible = uniqueLocations(districtMatches.filter(({ county }) =>
    countyMatches.length === 0 || countyMatches.some((match) => match.county === county),
  ))

  if (countyMatches.length && districtMatches.length && compatible.length === 0) {
    return {
      rawText: originalText,
      normalizedAddress: originalText,
      county: { value: countyMatches[0].county, source: 'google_ocr' },
      district: { value: districtMatches[0].district, source: 'google_ocr' },
      status: 'conflict',
      confidence: 'low',
      evidenceType: 'ocr_text',
      referenceDate,
      warnings: ['county_district_conflict'],
    }
  }

  let candidates = compatible
  let evidenceType = countyMatches.length ? 'ocr_text' : 'administrative_inference'
  if (candidates.length > 1) {
    const hinted = candidates.filter((candidate) => ADDRESS_LOCATION_HINTS.some((hint) =>
      hint.county === candidate.county
      && hint.district === candidate.district
      && hint.keywords.some((keyword) => text.includes(normalizeText(keyword))),
    ))
    if (hinted.length === 1) {
      candidates = hinted
      evidenceType = 'road_inference'
      warnings.push('county_inferred_from_road')
    }
  }

  if (candidates.length === 1) {
    const match = candidates[0]
    const countyWasRead = countyMatches.some(({ county }) => county === match.county)
    return {
      rawText: originalText,
      normalizedAddress: replaceLocationPrefix(
        originalText,
        match.county,
        match.district,
        countyWasRead ? countyMatches[0].county : null,
        match.district,
      ),
      county: { value: match.county, source: countyWasRead ? 'google_ocr' : evidenceType },
      district: { value: match.district, source: 'google_ocr' },
      status: countyWasRead ? 'accepted' : 'inferred',
      confidence: evidenceType === 'road_inference' ? 'medium' : 'high',
      evidenceType,
      referenceDate,
      warnings,
    }
  }

  if (candidates.length > 1) warnings.push('ambiguous_district')
  else if (countyMatches.length) warnings.push('district_not_found')
  else warnings.push('administrative_division_not_found')

  return {
    rawText: originalText,
    normalizedAddress: originalText,
    county: countyMatches.length === 1
      ? { value: countyMatches[0].county, source: 'google_ocr' }
      : null,
    district: null,
    status: candidates.length > 1 ? 'ambiguous' : 'unresolved',
    confidence: 'low',
    evidenceType: 'ocr_text',
    referenceDate,
    warnings,
  }
}

export function validateTaiwanAddressInput(rawText, options = {}) {
  const resolution = resolveTaiwanAddress(rawText, options)

  if (resolution.status === 'conflict') {
    const county = resolution.county?.value ?? '輸入的縣市'
    const district = resolution.district?.value ?? '輸入的行政區'
    return {
      valid: false,
      code: 'county_district_conflict',
      message: `縣市與行政區不相符：「${county}」不包含「${district}」，請確認後再儲存。`,
      resolution,
    }
  }

  if (resolution.status === 'ambiguous') {
    return {
      valid: false,
      code: 'administrative_division_ambiguous',
      message: '行政區名稱在多個縣市重複，請補上正確縣市後再儲存。',
      resolution,
    }
  }

  if (
    !resolution.county
    || !resolution.district
    || !['accepted', 'inferred'].includes(resolution.status)
  ) {
    return {
      valid: false,
      code: 'administrative_division_not_found',
      message: '找不到可驗證的縣市與行政區，請至少輸入正確的縣市及行政區。',
      resolution,
    }
  }

  return {
    valid: true,
    code: 'valid',
    message: '',
    resolution,
  }
}

export function getAdministrativeDatasetSummary() {
  return {
    ...ADMIN_DATASET_METADATA,
    countyCount: TAIWAN_ADMIN_DIVISIONS.length,
    divisionCount: TAIWAN_ADMIN_DIVISIONS.reduce((total, entry) => total + entry.districts.length, 0),
  }
}

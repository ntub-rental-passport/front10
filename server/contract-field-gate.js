import { extractContractFieldCandidates } from '../shared/contract-field-extraction.js'
import { CONTRACT_FIELD_DEFINITIONS } from '../shared/contract-field-schema.js'
import { isValidContractFieldFormat } from '../shared/contract-field-validation.js'

export const FIELD_KEYWORDS = Object.fromEntries(
  CONTRACT_FIELD_DEFINITIONS.map((definition) => [definition.id, definition.keywords]),
)

const FIELD_DEFINITION_BY_ID = new Map(
  CONTRACT_FIELD_DEFINITIONS.map((definition) => [definition.id, definition]),
)

const CANDIDATE_KEYS = Object.fromEntries(
  CONTRACT_FIELD_DEFINITIONS.map((definition) => [definition.id, definition.candidateKey]),
)

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/[：:，,。．；;（）()]/g, '')
}

function findSource(pageTexts, sourceValue) {
  if (!sourceValue) return null
  const normalizedSource = normalizeText(sourceValue)

  for (const [pageIndex, pageText] of pageTexts.entries()) {
    const directStart = pageText.indexOf(sourceValue)
    if (directStart >= 0) {
      return { pageIndex, sourceStart: directStart, sourceEnd: directStart + sourceValue.length }
    }
    if (normalizedSource && normalizeText(pageText).includes(normalizedSource)) {
      return { pageIndex, sourceStart: -1, sourceEnd: -1 }
    }
  }
  return null
}

function getEvidenceWords(page, sourceValue) {
  const normalizedSource = normalizeText(sourceValue)
  if (!normalizedSource) return []
  const words = page?.words ?? []

  for (let start = 0; start < words.length; start += 1) {
    let combined = ''
    for (let end = start; end < Math.min(words.length, start + 40); end += 1) {
      combined += normalizeText(words[end].text)
      if (!combined) continue
      if (combined.includes(normalizedSource)) return words.slice(start, end + 1)
      if (!normalizedSource.startsWith(combined)) break
    }
  }
  return []
}

function averageConfidence(words) {
  if (!words.length) return 0
  return words.reduce((sum, word) => sum + (Number(word.confidence) || 0), 0) / words.length
}

function unionBoundingBoxes(words) {
  const boxes = words.map((word) => word.boundingBox).filter(Boolean)
  if (!boxes.length) return null
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function findLabelBox(page, fieldId) {
  const keywords = FIELD_KEYWORDS[fieldId] ?? []
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword)
    for (let start = 0; start < page.words.length; start += 1) {
      const matched = []
      let combined = ''
      for (let end = start; end < Math.min(page.words.length, start + 8); end += 1) {
        matched.push(page.words[end])
        combined += normalizeText(page.words[end].text)
        if (combined.startsWith(normalizedKeyword) && combined.length >= normalizedKeyword.length) {
          return unionBoundingBoxes(matched)
        }
      }
    }
  }
  return null
}

function isLabelDistanceNormal(page, fieldId, sourceBox) {
  if (!sourceBox) return false
  const labelBox = findLabelBox(page, fieldId)
  if (!labelBox) return false
  const horizontalGap = Math.max(0, sourceBox.left - labelBox.right)
  const verticalGap = Math.abs(sourceBox.top - labelBox.top)
  return horizontalGap <= page.width * 0.65 && verticalGap <= page.height * 0.18
}

function isFormatValid(fieldId, value) {
  if (!value || /待確認|人工輸入/.test(value)) return false
  const definition = FIELD_DEFINITION_BY_ID.get(fieldId)
  return isValidContractFieldFormat(definition?.format ?? 'text', value, definition?.options)
}

function countSourceCandidates(pageTexts, sourceValue) {
  const normalizedSource = normalizeText(sourceValue)
  if (!normalizedSource) return 0
  return pageTexts.reduce((total, pageText) => {
    const normalizedPage = normalizeText(pageText)
    let count = 0
    let start = 0
    while ((start = normalizedPage.indexOf(normalizedSource, start)) >= 0) {
      count += 1
      start += normalizedSource.length
    }
    return total + count
  }, 0)
}

export function collectRelevantSnippets(pageTexts, fieldIds, radius = 180) {
  const snippets = []
  const seen = new Set()
  for (const [pageIndex, pageText] of pageTexts.entries()) {
    for (const fieldId of fieldIds) {
      for (const keyword of FIELD_KEYWORDS[fieldId] ?? []) {
        let startIndex = 0
        while (true) {
          const index = pageText.indexOf(keyword, startIndex)
          if (index < 0) break
          const text = pageText.slice(
            Math.max(0, index - radius),
            Math.min(pageText.length, index + keyword.length + radius),
          )
          const key = `${fieldId}:${pageIndex}:${text}`
          if (!seen.has(key)) snippets.push({ fieldId, pageIndex, keyword, text })
          seen.add(key)
          startIndex = index + keyword.length
        }
      }
    }
  }
  return snippets
}

export function analyzeContractFields({ text, pageTexts, visionPages }) {
  const extracted = extractContractFieldCandidates(text)
  const fieldReviews = {}
  const decisions = {}
  const unresolvedFieldIds = []

  for (const [fieldId, candidateKey] of Object.entries(CANDIDATE_KEYS)) {
    const candidate = extracted[candidateKey]
    const source = findSource(pageTexts, candidate.sourceValue)
    const page = source ? visionPages[source.pageIndex] : null
    const evidenceWords = page ? getEvidenceWords(page, candidate.sourceValue) : []
    const googleConfidence = averageConfidence(evidenceWords)
    const sourceBoundingBox = unionBoundingBoxes(evidenceWords)
    const formatValid = isFormatValid(fieldId, candidate.value)
    const labelDistanceNormal = page
      ? isLabelDistanceNormal(page, fieldId, sourceBoundingBox)
      : false
    const candidateCount = countSourceCandidates(pageTexts, candidate.sourceValue)
    const reasons = []

    if (!candidate.value) reasons.push('rule_parse_failed')
    if (!source) reasons.push('source_not_found')
    if (googleConfidence < 0.85) reasons.push('google_confidence_low')
    if (!formatValid) reasons.push('format_validation_failed')
    if (!labelDistanceNormal) reasons.push('label_distance_unverified')
    if (candidateCount > 1) reasons.push('multiple_candidates')
    if (fieldId === 'address' && candidate.addressResolution?.status === 'inferred') {
      reasons.push(
        candidate.addressResolution.evidenceType === 'road_inference'
          ? 'county_inferred_from_road'
          : 'county_inferred_from_district',
      )
    }
    if (fieldId === 'address' && candidate.addressResolution?.status === 'ambiguous') {
      reasons.push('administrative_division_ambiguous')
    }
    if (fieldId === 'address' && candidate.addressResolution?.status === 'conflict') {
      reasons.push('administrative_division_conflict')
    }
    if (
      fieldId === 'address' &&
      candidate.addressResolution?.warnings?.includes('address_incomplete')
    ) {
      reasons.push('address_incomplete')
    }

    const confidence =
      reasons.length === 0
        ? 'high'
        : candidate.value && source && googleConfidence >= 0.65 && formatValid
          ? 'medium'
          : 'low'
    if (confidence !== 'high') unresolvedFieldIds.push(fieldId)

    if (candidate.value) {
      fieldReviews[fieldId] = {
        value: candidate.value,
        sourceValue: candidate.sourceValue,
        confidence,
        reviewState: 'unreviewed',
        sourcePageIndex: source?.pageIndex ?? null,
        sourceStart: source?.sourceStart ?? -1,
        sourceEnd: source?.sourceEnd ?? -1,
        evidenceType:
          fieldId === 'address'
            ? (candidate.addressResolution?.evidenceType ?? 'ocr_text')
            : 'ocr_text',
        sourceBoundingBox,
        googleConfidence: Number(googleConfidence.toFixed(4)),
        formatValid,
        labelDistanceNormal,
        candidateCount,
        reviewReasons: reasons,
        reviewSource: 'rules',
        ...(fieldId === 'address' && candidate.addressResolution
          ? { addressResolution: candidate.addressResolution }
          : {}),
      }
    }
    decisions[fieldId] = {
      confidence,
      googleConfidence: Number(googleConfidence.toFixed(4)),
      formatValid,
      labelDistanceNormal,
      candidateCount,
      reasons,
    }
  }

  return { fieldReviews, decisions, unresolvedFieldIds }
}

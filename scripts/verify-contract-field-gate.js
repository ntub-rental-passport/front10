import assert from 'node:assert/strict'
import { analyzeContractFields, collectRelevantSnippets } from '../server/contract-field-gate.js'

const pageText = [
  '出租人：王小明',
  '承租人：李小華',
  '租期自民國113年1月1日起至民國114年1月1日止',
  '每月租金新台幣18,000元',
  '押金新台幣36,000元',
].join('\n')

const words = [
  ['出租人', 20, 30, 100, 60, 0.72],
  ['王小明', 130, 30, 220, 60, 0.7],
  ['承租人', 20, 80, 100, 110, 0.74],
  ['李小華', 130, 80, 220, 110, 0.7],
  ['租期自', 20, 130, 100, 160, 0.95],
  ['民國113年1月1日', 130, 130, 330, 160, 0.96],
  ['每月租金', 20, 180, 120, 210, 0.97],
  ['新台幣', 130, 180, 200, 210, 0.96],
  ['18,000', 210, 180, 300, 210, 0.96],
  ['押金', 20, 230, 80, 260, 0.94],
  ['新台幣', 90, 230, 160, 260, 0.94],
  ['36,000', 170, 230, 260, 260, 0.94],
].map(([text, left, top, right, bottom, confidence], wordIndex) => ({
  wordIndex,
  text,
  confidence,
  boundingBox: { left, top, right, bottom, width: right - left, height: bottom - top },
}))

const analysis = analyzeContractFields({
  text: pageText,
  pageTexts: [pageText],
  visionPages: [{ pageIndex: 0, width: 1000, height: 1400, words }],
})

assert.equal(analysis.fieldReviews.rent.value, 'NT$18,000')
assert.equal(analysis.fieldReviews.rent.confidence, 'high')
assert.equal(analysis.fieldReviews.rent.googleConfidence, 0.96)
assert.equal(analysis.decisions.rent.formatValid, true)
assert.equal(analysis.unresolvedFieldIds.includes('rent'), false)
assert.equal(analysis.fieldReviews.landlord.confidence, 'medium')
assert.equal(analysis.unresolvedFieldIds.includes('landlord'), true)
assert.equal(Object.hasOwn(analysis.decisions, 'review_days'), true)
assert.equal(Object.hasOwn(analysis.decisions, 'landlord_id'), true)
assert.equal(Object.hasOwn(analysis.decisions, 'parking_available'), true)
assert.equal(Object.hasOwn(analysis.decisions, 'leftover_handling'), true)

const snippets = collectRelevantSnippets([pageText], ['landlord', 'rent'])
assert.equal(
  snippets.some((snippet) => snippet.fieldId === 'landlord'),
  true,
)
assert.equal(
  snippets.some((snippet) => snippet.fieldId === 'rent'),
  true,
)
assert.equal(
  snippets.every((snippet) => snippet.text.length < 500),
  true,
)

const inferredAddressText = '甲方房屋所在地及使用範圍：\n淡水區自強路10號'
const inferredAddressAnalysis = analyzeContractFields({
  text: inferredAddressText,
  pageTexts: [inferredAddressText],
  visionPages: [
    {
      pageIndex: 0,
      width: 1000,
      height: 1400,
      words: [
        {
          wordIndex: 0,
          text: '淡水區自強路10號',
          confidence: 0.95,
          boundingBox: { left: 100, top: 100, right: 400, bottom: 140, width: 300, height: 40 },
        },
      ],
    },
  ],
})
assert.equal(inferredAddressAnalysis.fieldReviews.address.value, '新北市淡水區自強路10號')
assert.equal(inferredAddressAnalysis.fieldReviews.address.evidenceType, 'administrative_inference')
assert.equal(
  inferredAddressAnalysis.fieldReviews.address.addressResolution.rawText,
  '淡水區自強路10號',
)
assert.equal(
  inferredAddressAnalysis.fieldReviews.address.addressResolution.warnings.includes(
    'address_incomplete',
  ),
  false,
)
assert.equal(
  inferredAddressAnalysis.fieldReviews.address.reviewReasons.includes(
    'county_inferred_from_district',
  ),
  true,
)

console.log('Contract confidence gate checks passed.')

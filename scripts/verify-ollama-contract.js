import assert from 'node:assert/strict'
import {
  buildOllamaPrompt,
  createFieldSchema,
  createPerformanceMetrics,
  getOllamaConfig,
  normalizeOllamaFieldReviews,
} from '../server/ollama-contract.js'

const pageTexts = [
  [
    '出租人：王小明',
    '承租人：李小華',
    '租賃地址：臺北市中正區忠孝東路一段1號',
    '租期自民國113年1月1日起至民國114年1月1日止',
    '每月租金新台幣18,000元，租金每月5日前繳納',
    '押金新台幣36,000元',
  ].join('\n'),
  '承租人提前終止契約，應支付一個月租金作為違約金。',
]

const payload = {
  fields: {
    rent: {
      value: 'NT$18,000',
      sourceValue: '每月租金新台幣18,000元',
      sourcePageIndex: 0,
      evidenceType: 'ocr_text',
    },
    deposit: {
      value: 'NT$99,999',
      sourceValue: '押金新台幣99,999元',
      sourcePageIndex: 0,
      evidenceType: 'ocr_text',
    },
    penalty: {
      value: '1 個月租金',
      sourceValue: '一個月租金作為違約金',
      sourcePageIndex: 1,
      evidenceType: 'ocr_text',
    },
  },
}

const reviews = normalizeOllamaFieldReviews(payload, pageTexts)
assert.equal(reviews.rent.value, 'NT$18,000')
assert.equal(reviews.rent.confidence, 'medium')
assert.equal(reviews.rent.sourcePageIndex, 0)
assert.equal(reviews.rent.sourceStart >= 0, true)
assert.equal(reviews.deposit, undefined, '沒有 OCR 原文證據的 AI 金額不得採用')
assert.equal(reviews.penalty.sourcePageIndex, 1)

const imageReviews = normalizeOllamaFieldReviews(
  {
    fields: {
      deposit: {
        value: 'NT$36,000',
        sourceValue: '參萬陸仟元',
        sourcePageIndex: 0,
        evidenceType: 'image',
      },
    },
  },
  pageTexts,
  {
    imageCrops: [
      {
        fieldIds: ['deposit'],
        pageIndex: 0,
        visionBoundingBox: { left: 100, top: 200, right: 600, bottom: 350 },
      },
    ],
  },
)
assert.equal(imageReviews.deposit.value, 'NT$36,000')
assert.equal(imageReviews.deposit.confidence, 'low')
assert.equal(imageReviews.deposit.evidenceType, 'image')

const prompt = buildOllamaPrompt(pageTexts)
assert.match(prompt, /sourcePageIndex: 0/)
assert.match(prompt, /不可使用常識補寫、猜測或虛構內容/)

const targetedSchema = createFieldSchema(['landlord', 'start_date'])
assert.deepEqual(targetedSchema.properties.fields.required, ['landlord', 'start_date'])
assert.equal(targetedSchema.properties.fields.properties.rent, undefined)

const targetedPrompt = buildOllamaPrompt(
  pageTexts,
  2500,
  [],
  ['landlord'],
  [{ fieldId: 'landlord', pageIndex: 0, keyword: '出租人', text: '出租人：王小明' }],
)
assert.match(targetedPrompt, /landlord: 出租人姓名/)
assert.doesNotMatch(targetedPrompt, /deposit: 押租保證金/)
assert.doesNotMatch(targetedPrompt, /承租人：李小華/)

const metrics = createPerformanceMetrics({
  total_duration: 4_200_000_000,
  load_duration: 480_000_000,
  prompt_eval_duration: 1_670_000_000,
  eval_duration: 2_000_000_000,
  prompt_eval_count: 420,
  eval_count: 64,
})
assert.equal(metrics.totalMs, 4200)
assert.equal(metrics.promptEvalMs, 1670)
assert.equal(metrics.promptTokens, 420)
assert.equal(metrics.tokensPerSecond, 32)

const disabledConfig = getOllamaConfig({ OLLAMA_OCR_ENABLED: 'false' })
assert.equal(disabledConfig.enabled, false)
assert.equal(disabledConfig.model, 'gemma4:e2b')

console.log('Ollama contract field review regression checks passed.')

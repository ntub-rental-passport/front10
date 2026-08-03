const CONTRACT_FIELD_IDS = [
  'landlord',
  'tenant',
  'address',
  'start_date',
  'end_date',
  'rent',
  'due_day',
  'deposit',
  'penalty',
]

const CONTRACT_FIELD_LABELS = {
  landlord: '出租人姓名',
  tenant: '承租人姓名',
  address: '租賃地址',
  start_date: '租賃開始日',
  end_date: '租賃結束日',
  rent: '每月租金',
  due_day: '租金繳納期限',
  deposit: '押租保證金',
  penalty: '提前終止或違約金',
}

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'
const DEFAULT_OLLAMA_MODEL = 'gemma4:e2b'
const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_CONTEXT_LENGTH = 2048
const DEFAULT_MAX_OCR_CHARS = 2_500
const DEFAULT_NUM_PREDICT = 220

const FIELD_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'sourceValue', 'sourcePageIndex', 'evidenceType'],
  properties: {
    value: { type: 'string', maxLength: 120 },
    sourceValue: { type: 'string', maxLength: 160 },
    sourcePageIndex: { type: ['integer', 'null'], minimum: 0 },
    evidenceType: { type: 'string', enum: ['ocr_text', 'image', 'none'] },
  },
}

export function createFieldSchema(fieldIds) {
  const validFieldIds = fieldIds.filter((fieldId) => CONTRACT_FIELD_IDS.includes(fieldId))
  return {
    type: 'object',
    additionalProperties: false,
    required: ['fields'],
    properties: {
      fields: {
        type: 'object',
        additionalProperties: false,
        required: validFieldIds,
        properties: Object.fromEntries(
          validFieldIds.map((fieldId) => [fieldId, FIELD_RESULT_SCHEMA]),
        ),
      },
    },
  }
}

export const CONTRACT_FIELD_SCHEMA = createFieldSchema(CONTRACT_FIELD_IDS)

function positiveInteger(rawValue, fallback) {
  const value = Number(rawValue)
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
}

export function getOllamaConfig(env = process.env) {
  return {
    enabled: env.OLLAMA_OCR_ENABLED !== 'false',
    baseUrl: String(env.OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/$/, ''),
    model: env.OLLAMA_OCR_MODEL || DEFAULT_OLLAMA_MODEL,
    timeoutMs: positiveInteger(env.OLLAMA_OCR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    contextLength: positiveInteger(env.OLLAMA_OCR_CONTEXT_LENGTH, DEFAULT_CONTEXT_LENGTH),
    maxOcrChars: positiveInteger(env.OLLAMA_OCR_MAX_CHARS, DEFAULT_MAX_OCR_CHARS),
    numPredict: positiveInteger(env.OLLAMA_OCR_NUM_PREDICT, DEFAULT_NUM_PREDICT),
  }
}

function truncateOcrText(text, maxChars) {
  if (text.length <= maxChars) return text

  const headLength = Math.ceil(maxChars * 0.7)
  const tailLength = maxChars - headLength
  return [
    text.slice(0, headLength),
    '\n\n［中段因本機模型記憶體限制而省略］\n\n',
    text.slice(-tailLength),
  ].join('')
}

export function buildOllamaPrompt(
  pageTexts,
  maxChars = DEFAULT_MAX_OCR_CHARS,
  imageCrops = [],
  targetFieldIds = CONTRACT_FIELD_IDS,
  snippets = [],
) {
  const labelledPages = snippets.length
    ? snippets
        .map(
          (snippet) =>
            `--- ${snippet.fieldId}／第 ${snippet.pageIndex + 1} 頁／${snippet.keyword} ---\n${snippet.text}`,
        )
        .join('\n\n')
    : pageTexts
        .map((pageText, index) => `--- 第 ${index + 1} 頁（sourcePageIndex: ${index}）---\n${pageText}`)
        .join('\n\n')

  const ocrText = truncateOcrText(labelledPages, maxChars)
  const fieldList = targetFieldIds.map(
    (fieldId) => `- ${fieldId}: ${CONTRACT_FIELD_LABELS[fieldId]}`,
  ).join('\n')
  const imageList = imageCrops.length
    ? imageCrops
        .map(
          (crop, index) =>
            `- Region ${index + 1}: ${crop.label}；可校對 ${crop.fieldIds.join('、')}；sourcePageIndex: ${crop.pageIndex}`,
        )
        .join('\n')
    : '本次沒有可用的欄位裁切圖片，只能使用 OCR 原文。'

  return `你是臺灣房屋租賃契約欄位校對器。Google Cloud Vision 已先完成 OCR，你只能根據下方 OCR 原文提取欄位，不可使用常識補寫、猜測或虛構內容。

需要提取的欄位：
${fieldList}

規則：
1. value 是適合顯示的正規化結果；金額使用 NT$12,000，民國日期使用「民國 113 年 1 月 1 日」。
2. 優先使用 OCR 原文。若 sourceValue 可逐字在 OCR 原文找到，evidenceType 填 ocr_text。
3. 只有對應欄位列有 Region 時，才可直接看聯絡表中相同編號的裁切區域校正；此時 sourceValue 填圖片中實際看到的原始文字，evidenceType 填 image。
4. sourcePageIndex 使用標題或圖片清單提供的零起算頁碼；找不到證據時填 null。
5. 遮蔽、塗黑、模糊或無法確認時，value 與 sourceValue 都填空字串，sourcePageIndex 填 null，evidenceType 填 none。
6. 不要把日期當成金額，也不要把租金、押金與違約金互相混用。
7. fields 只需包含本次列出的欄位；找不到的欄位使用空字串，不可省略列出的鍵。
8. 只輸出符合指定 JSON schema 的資料，不要輸出解說文字。

欄位裁切區域（聯絡表由上到下依 Region 編號排列）：
${imageList}

Google OCR 原文：
${ocrText}`
}

function normalizeEvidence(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function findEvidence(pageTexts, sourceValue, requestedPageIndex) {
  if (!sourceValue) return null
  const normalizedSource = normalizeEvidence(sourceValue)
  if (!normalizedSource) return null

  const pageIndexes = Number.isInteger(requestedPageIndex)
    ? [requestedPageIndex]
    : pageTexts.map((_, index) => index)

  for (const pageIndex of pageIndexes) {
    const pageText = pageTexts[pageIndex]
    if (typeof pageText !== 'string') continue

    const directStart = pageText.indexOf(sourceValue)
    if (directStart >= 0) {
      return {
        pageIndex,
        sourceStart: directStart,
        sourceEnd: directStart + sourceValue.length,
        sourceValue,
      }
    }

    const normalizedPageText = normalizeEvidence(pageText)
    if (normalizedPageText.includes(normalizedSource)) {
      return {
        pageIndex,
        sourceStart: -1,
        sourceEnd: -1,
        sourceValue,
      }
    }
  }

  return null
}

function cleanModelText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function isPlausibleFieldValue(fieldId, value) {
  if (!value) return false

  switch (fieldId) {
    case 'landlord':
    case 'tenant':
      return value.length <= 40 && !/身分證|電話|地址/.test(value)
    case 'rent':
    case 'deposit':
      return /^(?:NT\$|新[臺台]幣)?\s*[0-9０-９,，]+\s*元?$/.test(value)
    case 'start_date':
    case 'end_date':
      return /(?:民國\s*)?[0-9０-９一二三四五六七八九十〇○]+\s*年/.test(value)
    case 'due_day':
      return /(?:月底|每月|[0-9０-９]+\s*日)/.test(value)
    case 'address':
      return value.length >= 3 && value.length <= 160
    case 'penalty':
      return value.length <= 240
    default:
      return false
  }
}

function findImageEvidence(imageCrops, fieldId, requestedPageIndex) {
  return imageCrops.find(
    (crop) =>
      crop.fieldIds.includes(fieldId) &&
      (!Number.isInteger(requestedPageIndex) || crop.pageIndex === requestedPageIndex),
  )
}

export function normalizeOllamaFieldReviews(payload, pageTexts, options = {}) {
  const fields = payload?.fields && typeof payload.fields === 'object' ? payload.fields : {}
  const imageCrops = Array.isArray(options.imageCrops) ? options.imageCrops : []
  const reviews = {}

  const targetFieldIds = Array.isArray(options.targetFieldIds)
    ? options.targetFieldIds
    : CONTRACT_FIELD_IDS

  for (const fieldId of targetFieldIds) {
    const field = fields[fieldId]
    if (!field || typeof field !== 'object') continue

    const value = cleanModelText(field.value, 120)
    const sourceValue = cleanModelText(field.sourceValue, 160)
    if (!isPlausibleFieldValue(fieldId, value)) continue

    const ocrEvidence =
      field.evidenceType === 'ocr_text'
        ? findEvidence(pageTexts, sourceValue, field.sourcePageIndex)
        : null
    const imageEvidence =
      field.evidenceType === 'image'
        ? findImageEvidence(imageCrops, fieldId, field.sourcePageIndex)
        : null
    if (!ocrEvidence && (!imageEvidence || !sourceValue)) continue

    reviews[fieldId] = {
      value,
      sourceValue: ocrEvidence?.sourceValue ?? sourceValue,
      confidence: ocrEvidence ? 'medium' : 'low',
      reviewState: 'unreviewed',
      sourcePageIndex: ocrEvidence?.pageIndex ?? imageEvidence.pageIndex,
      sourceStart: ocrEvidence?.sourceStart ?? -1,
      sourceEnd: ocrEvidence?.sourceEnd ?? -1,
      evidenceType: ocrEvidence ? 'ocr_text' : 'image',
      sourceBoundingBox: imageEvidence?.visionBoundingBox,
    }
  }

  return reviews
}

function parseOllamaContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama 沒有回傳欄位資料。')
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Ollama 回傳的欄位資料不是有效 JSON。')
  }
}

export async function reviewContractFieldsWithOllama(pageTexts, options = {}) {
  const config = { ...getOllamaConfig(), ...options }
  const targetFieldIds = Array.isArray(config.targetFieldIds)
    ? config.targetFieldIds.filter((fieldId) => CONTRACT_FIELD_IDS.includes(fieldId))
    : CONTRACT_FIELD_IDS
  const imageCrops = Array.isArray(config.imageCrops) ? config.imageCrops : []
  const reviewImages = Array.isArray(config.reviewImages)
    ? config.reviewImages
    : imageCrops.map((crop) => crop.base64)
  if (!config.enabled) {
    return {
      status: 'skipped',
      model: config.model,
      fieldReviews: {},
      durationMs: 0,
      warning: 'AI OCR 模式目前已停用，僅保留 Google OCR 結果。',
    }
  }
  if (!targetFieldIds.length) {
    return {
      status: 'skipped',
      model: config.model,
      fieldReviews: {},
      cropCount: 0,
      durationMs: 0,
      warning: '',
      performanceMetrics: {
        totalMs: 0,
        loadMs: 0,
        promptEvalMs: 0,
        generationMs: 0,
        promptTokens: 0,
        outputTokens: 0,
        tokensPerSecond: 0,
      },
    }
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        think: false,
        format: createFieldSchema(targetFieldIds),
        messages: [
          {
            role: 'user',
            content: buildOllamaPrompt(
              pageTexts,
              config.maxOcrChars,
              imageCrops,
              targetFieldIds,
              config.snippets,
            ),
            ...(reviewImages.length
              ? { images: reviewImages }
              : {}),
          },
        ],
        options: {
          temperature: 0,
          num_ctx: config.contextLength,
          num_predict: config.numPredict,
        },
      }),
    })

    if (!response.ok) {
      const errorText = (await response.text()).trim()
      throw new Error(`Ollama ${response.status}: ${errorText || response.statusText}`)
    }

    const result = await response.json()
    const payload = parseOllamaContent(result?.message?.content)
    const fieldReviews = normalizeOllamaFieldReviews(payload, pageTexts, {
      imageCrops,
      targetFieldIds,
    })
    const performanceMetrics = createPerformanceMetrics(result)

    return {
      status: 'completed',
      model: config.model,
      fieldReviews,
      cropCount: imageCrops.length,
      durationMs: Date.now() - startedAt,
      performanceMetrics,
      warning: Object.keys(fieldReviews).length
        ? ''
        : 'AI 已完成校對，但沒有找到具備 OCR 原文證據的欄位；請人工確認。',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    console.warn('[AI OCR] Ollama field review failed:', errorMessage)

    return {
      status: 'failed',
      model: config.model,
      fieldReviews: {},
      cropCount: imageCrops.length,
      durationMs: Date.now() - startedAt,
      performanceMetrics: {
        totalMs: 0,
        loadMs: 0,
        promptEvalMs: 0,
        generationMs: 0,
        promptTokens: 0,
        outputTokens: 0,
        tokensPerSecond: 0,
      },
      warning: isTimeout
        ? '本機 AI 欄位校對逾時，已保留 Google OCR 結果，請稍後再試。'
        : '本機 AI 暫時無法完成欄位校對，已保留 Google OCR 結果。',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function nsToMs(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number / 1_000_000) : 0
}

export function createPerformanceMetrics(result) {
  const evalDuration = Number(result.eval_duration) || 0
  const evalCount = Number(result.eval_count) || 0
  return {
    totalMs: nsToMs(result.total_duration),
    loadMs: nsToMs(result.load_duration),
    promptEvalMs: nsToMs(result.prompt_eval_duration),
    generationMs: nsToMs(result.eval_duration),
    promptTokens: Number(result.prompt_eval_count) || 0,
    outputTokens: evalCount,
    tokensPerSecond:
      evalDuration > 0 ? Number((evalCount / (evalDuration / 1_000_000_000)).toFixed(2)) : 0,
  }
}

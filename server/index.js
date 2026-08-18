import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import express from 'express'
import multer from 'multer'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { PDFDocument } from 'pdf-lib'
import vision from '@google-cloud/vision'
import { getOllamaConfig, reviewContractFieldsWithOllama } from './ollama-contract.js'
import { analyzeContractFields, collectRelevantSnippets } from './contract-field-gate.js'
import {
  createVisionPagePlaceholder,
  normalizeVisionAnnotation,
  reindexVisionPages,
} from './vision-annotation.js'
import {
  buildFieldImageCrops,
  buildOllamaReviewImages,
  serializeCropMetadata,
} from './vision-field-crops.js'

const app = express()
app.use(cookieParser())

// JWT 驗證：與 FastAPI 共用同一組 JWT_SECRET（都從根目錄 .env 讀取）。
// FastAPI 登入時簽發的 HttpOnly cookie，這裡直接驗證，未登入者無法呼叫 OCR
// （防止任何人匿名上傳檔案燒光 Google Vision API 額度）。
const jwtSecret = process.env.JWT_SECRET || ''
if (!jwtSecret) {
  console.error('❌ 缺少 JWT_SECRET 環境變數（需與 FastAPI 共用同一組值），OCR server 拒絕啟動。')
  process.exit(1)
}

function requireAuth(req, res, next) {
  const token = req.cookies?.access_token
  if (!token) {
    return res.status(401).json({ error: '未登入，請先登入後再使用 OCR 功能。' })
  }
  try {
    req.user = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
    return next()
  } catch {
    return res.status(401).json({ error: '登入已過期或憑證無效，請重新登入。' })
  }
}

const port = Number(process.env.OCR_API_PORT || 8787)
const maxFileSizeMb = Number(process.env.OCR_MAX_FILE_SIZE_MB || 20)
const maxTotalSizeMb = Number(process.env.OCR_MAX_TOTAL_SIZE_MB || 80)
const maxFileCount = Number(process.env.OCR_MAX_FILE_COUNT || 20)
const visionConcurrency = Math.max(1, Number(process.env.OCR_VISION_CONCURRENCY || 4))
const ollamaConfig = getOllamaConfig()
const aiReviewJobs = new Map()
const AI_REVIEW_JOB_TTL_MS = 15 * 60 * 1000
const MAX_AI_REVIEW_FIELDS = 3
const AI_FIELD_PRIORITY = [
  'landlord',
  'tenant',
  'start_date',
  'end_date',
  'rent',
  'deposit',
  'address',
  'due_day',
  'penalty',
]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
    files: maxFileCount,
  },
})

const imageClient = new vision.ImageAnnotatorClient()
const fileClient = new vision.v1.ImageAnnotatorClient()

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
])

const DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'image/tiff'])

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'])

const FORBIDDEN_MEDIA_EXTENSIONS = new Set(['mp3', 'mp4'])
const EXTENSION_MIME_TYPES = new Map([
  ['pdf', new Set(['application/pdf'])],
  ['png', new Set(['image/png'])],
  ['jpg', new Set(['image/jpeg', 'image/jpg'])],
  ['jpeg', new Set(['image/jpeg', 'image/jpg'])],
  ['webp', new Set(['image/webp'])],
  ['bmp', new Set(['image/bmp'])],
  ['tif', new Set(['image/tiff'])],
  ['tiff', new Set(['image/tiff'])],
])

function getExtension(fileName) {
  return path
    .extname(fileName || '')
    .slice(1)
    .toLowerCase()
}

function matchesFileSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false

  switch (mimeType) {
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-'
    case 'image/png':
      return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    case 'image/jpeg':
    case 'image/jpg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    case 'image/webp':
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      )
    case 'image/bmp':
      return buffer.subarray(0, 2).toString('ascii') === 'BM'
    case 'image/tiff':
      return (
        buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
        buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
      )
    default:
      return false
  }
}

function validateUploadedFiles(files) {
  if (!files.length) {
    return '請選擇至少一個租約圖片或 PDF 檔案。'
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > maxTotalSizeMb * 1024 * 1024) {
    return `全部檔案總大小不可超過 ${maxTotalSizeMb}MB。`
  }

  const pdfFiles = files.filter((file) => getExtension(file.originalname) === 'pdf')
  if (pdfFiles.length && files.length > 1) {
    return 'PDF 請單獨上傳；多檔上傳僅支援契約圖片。'
  }

  for (const file of files) {
    const extension = getExtension(file.originalname)
    const expectedMimeTypes = EXTENSION_MIME_TYPES.get(extension)
    if (
      FORBIDDEN_MEDIA_EXTENSIONS.has(extension) ||
      file.mimetype === 'video/mp4' ||
      file.mimetype === 'audio/mpeg'
    ) {
      return '禁止上傳 MP4 影片或 MP3 音樂檔案。'
    }

    if (
      !SUPPORTED_EXTENSIONS.has(extension) ||
      (!IMAGE_MIME_TYPES.has(file.mimetype) && !DOCUMENT_MIME_TYPES.has(file.mimetype)) ||
      !expectedMimeTypes?.has(file.mimetype)
    ) {
      return '僅支援 PDF、PNG、JPG、JPEG、WEBP、BMP、TIFF 圖片格式。'
    }

    if (!matchesFileSignature(file.buffer, file.mimetype)) {
      return `「${decodeUploadedFileName(file.originalname)}」的內容與副檔名不符，已拒絕上傳。`
    }
  }

  return null
}

function parseLanguageHints(rawValue) {
  if (!rawValue) return ['zh-TW', 'en']

  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((value) => parseLanguageHints(value))
  }

  if (typeof rawValue !== 'string') {
    return ['zh-TW', 'en']
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
  } catch {
    // Ignore JSON parse errors and fall back to comma-separated parsing.
  }

  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getUserFacingError(error) {
  const message = error instanceof Error ? error.message : String(error)

  if (
    message.includes('Could not load the default credentials') ||
    message.includes('Could not load the default credentials from any providers')
  ) {
    return '找不到 Google Cloud 憑證。請先設定 GOOGLE_APPLICATION_CREDENTIALS 指向服務帳戶 JSON 金鑰。'
  }

  if (message.includes('unsupported file')) {
    return '目前僅支援 PDF、PNG、JPG、JPEG、WEBP、BMP、TIFF 與 GIF。'
  }

  if (message.includes('Request payload size exceeds')) {
    return '檔案太大，請縮小檔案後再試。'
  }

  return message
}

function decodeUploadedFileName(fileName) {
  if (!fileName || /^[\x00-\x7F]*$/.test(fileName)) return fileName

  const decodedFileName = Buffer.from(fileName, 'latin1').toString('utf8')
  return decodedFileName.includes('\uFFFD') ? fileName : decodedFileName
}

function alignVisionPages(pageTexts, visionPages, sourceFileIndex) {
  return pageTexts.map((pageText, sourcePageIndex) =>
    visionPages[sourcePageIndex]
      ? {
          ...visionPages[sourcePageIndex],
          sourceFileIndex,
          sourcePageIndex,
          text: visionPages[sourcePageIndex].text || pageText,
        }
      : createVisionPagePlaceholder({ sourceFileIndex, sourcePageIndex, text: pageText }),
  )
}

function normalizeVisionResponses(responses, metadata = {}) {
  const pages = []
  const fallbackPageTexts = []

  for (const response of responses) {
    const annotation = normalizeVisionAnnotation(response.fullTextAnnotation, {
      sourceFileIndex: metadata.sourceFileIndex,
      sourcePageIndexOffset: (metadata.sourcePageIndexOffset ?? 0) + pages.length,
    })
    fallbackPageTexts.push(annotation.text)
    pages.push(...annotation.pages)
  }

  return {
    pages,
    pageTexts: pages.length ? pages.map((page) => page.text) : fallbackPageTexts,
  }
}

async function recognizeImage(buffer, languageHints, sourceFileIndex, onProgress) {
  const request = {
    image: { content: buffer },
    imageContext: languageHints.length ? { languageHints } : undefined,
  }

  onProgress?.(0.05, '圖片已送交 Google OCR，等待辨識結果')
  let startedAt = performance.now()
  const [result] = await imageClient.documentTextDetection(request)
  const googleVisionMs = performance.now() - startedAt
  onProgress?.(0.9, 'Google OCR 已回傳圖片辨識結果，正在整理文字')
  startedAt = performance.now()
  const annotation = normalizeVisionAnnotation(result.fullTextAnnotation, { sourceFileIndex })
  const text = annotation.text
  const pageTexts = annotation.pages.length
    ? annotation.pages.map((page) => page.text || text)
    : text
      ? [text]
      : []
  const normalizationMs = performance.now() - startedAt
  onProgress?.(1, '圖片文字整理完成')

  return {
    text,
    pageCount: pageTexts.length,
    pageTexts,
    visionPages: alignVisionPages(pageTexts, annotation.pages, sourceFileIndex),
    warnings: [],
    timings: { googleVisionMs, normalizationMs },
    engine: 'DOCUMENT_TEXT_DETECTION',
  }
}

async function recognizeDocument(buffer, mimeType, languageHints, sourceFileIndex, onProgress) {
  const createFileRequest = (pages) => ({
    inputConfig: {
      mimeType,
      content: buffer,
    },
    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
    imageContext: languageHints.length ? { languageHints } : undefined,
    pages,
  })

  let pageTexts = []
  let visionPages = []
  let sourcePageCount = 0
  let googleVisionMs = 0
  let normalizationMs = 0

  if (mimeType === 'application/pdf') {
    const pdfDocument = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    })
    sourcePageCount = pdfDocument.getPageCount()
    const pagesToRecognize = Math.min(sourcePageCount, 5)
    onProgress?.(0.03, `PDF 解析完成，共 ${sourcePageCount} 頁`)

    // 每次明確指定一頁，避免 Vision 將整份 PDF 全文放進第一個 response。
    for (let pageNumber = 1; pageNumber <= pagesToRecognize; pageNumber += 1) {
      onProgress?.(
        (pageNumber - 1 + 0.08) / pagesToRecognize,
        `Google OCR 正在辨識 PDF 第 ${pageNumber}／${pagesToRecognize} 頁`,
      )
      let startedAt = performance.now()
      const [pageResult] = await fileClient.batchAnnotateFiles({
        requests: [createFileRequest([pageNumber])],
      })
      googleVisionMs += performance.now() - startedAt
      const pageResponses = pageResult.responses?.[0]?.responses ?? []
      startedAt = performance.now()
      const normalized = normalizeVisionResponses(pageResponses, {
        sourceFileIndex,
        sourcePageIndexOffset: pageNumber - 1,
      })
      normalizationMs += performance.now() - startedAt
      const pageText = normalized.pageTexts.find(Boolean) ?? ''
      pageTexts.push(pageText)
      visionPages.push(
        normalized.pages[0] ??
          createVisionPagePlaceholder({
            sourceFileIndex,
            sourcePageIndex: pageNumber - 1,
            text: pageText,
          }),
      )
      onProgress?.(
        pageNumber / pagesToRecognize,
        `Google OCR 已完成 PDF 第 ${pageNumber}／${pagesToRecognize} 頁`,
      )
    }
  } else {
    let startedAt = performance.now()
    const [result] = await fileClient.batchAnnotateFiles({
      requests: [createFileRequest(undefined)],
    })
    googleVisionMs += performance.now() - startedAt
    const responses = result.responses?.[0]?.responses ?? []
    startedAt = performance.now()
    const normalized = normalizeVisionResponses(responses, { sourceFileIndex })
    normalizationMs += performance.now() - startedAt
    pageTexts = normalized.pageTexts
    visionPages = alignVisionPages(pageTexts, normalized.pages, sourceFileIndex)
    sourcePageCount = pageTexts.length
    onProgress?.(1, '文件文字辨識與整理完成')
  }

  const warnings = []
  if (mimeType === 'application/pdf') {
    warnings.push('Vision API 的同步 PDF OCR 單次最多適合處理 5 頁；較長租約建議改成雲端批次流程。')
    if (sourcePageCount > 5) {
      warnings.push(`此 PDF 共 ${sourcePageCount} 頁，本次僅辨識前 5 頁。`)
    }
  }

  const blankPageNumbers = pageTexts
    .map((pageText, index) => (pageText ? null : index + 1))
    .filter((pageNumber) => pageNumber !== null)

  if (blankPageNumbers.length) {
    warnings.push(`第 ${blankPageNumbers.join('、')} 頁未辨識到文字，請在契約編輯器中逐頁確認。`)
  }

  return {
    // 保留頁面順序，空白頁不會讓後續頁碼錯位。
    text: pageTexts
      .map((pageText) => pageText.trimEnd())
      .join('\n\n')
      .trim(),
    pageCount: pageTexts.length,
    pageTexts,
    visionPages,
    warnings,
    timings: { googleVisionMs, normalizationMs },
    engine:
      mimeType === 'application/pdf'
        ? 'batchAnnotateFiles(DOCUMENT_TEXT_DETECTION, PER_PAGE)'
        : 'batchAnnotateFiles(DOCUMENT_TEXT_DETECTION)',
  }
}

function roundTimings(timings) {
  return Object.fromEntries(
    Object.entries(timings).map(([key, value]) => [key, Math.max(0, Math.round(value))]),
  )
}

function selectAiReviewFields(unresolvedFieldIds) {
  const unresolved = new Set(unresolvedFieldIds)
  return AI_FIELD_PRIORITY.filter((fieldId) => unresolved.has(fieldId)).slice(
    0,
    MAX_AI_REVIEW_FIELDS,
  )
}

function saveAiReviewJob(jobId, result) {
  aiReviewJobs.set(jobId, result)
  setTimeout(() => aiReviewJobs.delete(jobId), AI_REVIEW_JOB_TTL_MS).unref()
}

async function recognizeUploadedFiles(files, languageHints, onProgress) {
  const recognizedFiles = new Array(files.length)
  const fileProgress = new Array(files.length).fill(0)
  let nextIndex = 0

  function updateFileProgress(sourceFileIndex, progress, status) {
    fileProgress[sourceFileIndex] = Math.max(
      fileProgress[sourceFileIndex],
      Math.min(1, Math.max(0, progress)),
    )
    onProgress?.({
      ratio: fileProgress.reduce((sum, value) => sum + value, 0) / files.length,
      status,
    })
  }

  async function worker() {
    while (nextIndex < files.length) {
      const sourceFileIndex = nextIndex
      nextIndex += 1
      const file = files[sourceFileIndex]
      const updateProgress = (progress, status) =>
        updateFileProgress(sourceFileIndex, progress, status)
      const result = DOCUMENT_MIME_TYPES.has(file.mimetype)
        ? await recognizeDocument(
            file.buffer,
            file.mimetype,
            languageHints,
            sourceFileIndex,
            updateProgress,
          )
        : await recognizeImage(file.buffer, languageHints, sourceFileIndex, updateProgress)
      recognizedFiles[sourceFileIndex] = { file, result }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(files.length, visionConcurrency) }, () => worker()),
  )
  return recognizedFiles
}

async function runAiReviewJob({ jobId, files, visionPages, pageTexts, targetFieldIds }) {
  const timings = { cropGenerationMs: 0, ollamaMs: 0 }
  const warnings = []

  try {
    let startedAt = performance.now()
    const fieldImageCrops = await buildFieldImageCrops(visionPages, files, {
      fieldIds: targetFieldIds,
      maxCrops: 2,
    })
    timings.cropGenerationMs = performance.now() - startedAt

    let reviewImages = []
    if (fieldImageCrops.length) {
      try {
        reviewImages = await buildOllamaReviewImages(fieldImageCrops)
      } catch (error) {
        console.warn('[AI OCR] Failed to build selective review contact sheet:', error)
        warnings.push('無法建立低信心欄位裁切圖，本次 AI 改用附近文字校對。')
      }
    }

    const reviewCrops = reviewImages.length ? fieldImageCrops : []
    const snippets = collectRelevantSnippets(pageTexts, targetFieldIds)
    startedAt = performance.now()
    const aiReview = await reviewContractFieldsWithOllama(pageTexts, {
      ...ollamaConfig,
      targetFieldIds,
      snippets,
      imageCrops: reviewCrops,
      reviewImages,
    })
    timings.ollamaMs = performance.now() - startedAt
    if (aiReview.warning) warnings.push(aiReview.warning)

    saveAiReviewJob(jobId, {
      jobId,
      status: aiReview.status,
      model: aiReview.model,
      fieldReviews: aiReview.fieldReviews,
      targetFieldIds,
      cropCount: aiReview.cropCount ?? reviewCrops.length,
      cropRegions: serializeCropMetadata(fieldImageCrops),
      mode: reviewImages.length ? 'multimodal' : 'text',
      durationMs: aiReview.durationMs,
      performanceMetrics: aiReview.performanceMetrics,
      timings: roundTimings(timings),
      warnings,
    })
  } catch (error) {
    console.error('[AI OCR] Background review failed:', error)
    saveAiReviewJob(jobId, {
      jobId,
      status: 'failed',
      model: ollamaConfig.model,
      fieldReviews: {},
      targetFieldIds,
      cropCount: 0,
      cropRegions: [],
      mode: 'text',
      durationMs: Math.round(timings.ollamaMs),
      performanceMetrics: null,
      timings: roundTimings(timings),
      warnings: ['背景 AI 複核未完成，已保留規則式欄位結果。'],
    })
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'rentmate-ocr-api',
    credentialsConfigured: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    aiOcr: {
      enabled: ollamaConfig.enabled,
      model: ollamaConfig.model,
      url: ollamaConfig.baseUrl,
    },
  })
})

app.get('/api/ocr/review/:jobId', requireAuth, (req, res) => {
  const job = aiReviewJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: '找不到這次 AI 複核工作，可能已逾期。' })
  return res.json(job)
})

function createOcrProgressResponse(req, res) {
  const enabled = req.body.progressStream === 'ndjson'
  let latestProgress = 0

  if (enabled) {
    res.status(200)
    res.set({
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
  }

  function write(event) {
    if (!enabled || res.writableEnded) return
    res.write(`${JSON.stringify(event)}\n`)
  }

  return {
    enabled,
    progress(progress, status) {
      latestProgress = Math.max(latestProgress, Math.min(99, Math.round(progress)))
      write({ type: 'progress', progress: latestProgress, status })
    },
    complete(result) {
      if (!enabled) return res.json(result)
      write({ type: 'result', progress: 100, status: 'OCR 辨識完成', result })
      return res.end()
    },
    fail(error, status = 500) {
      if (!enabled) return res.status(status).json({ error })
      write({ type: 'error', error })
      return res.end()
    },
  }
}

app.post('/api/ocr', requireAuth, upload.array('files', maxFileCount), async (req, res) => {
  let progressResponse

  try {
    const files = Array.isArray(req.files) ? req.files : []
    const validationError = validateUploadedFiles(files)
    if (validationError) return res.status(400).json({ error: validationError })

    progressResponse = createOcrProgressResponse(req, res)
    progressResponse.progress(8, '檔案上傳與內容驗證完成')
    const languageHints = parseLanguageHints(req.body.languageHints)
    progressResponse.progress(12, '檔案驗證完成，準備呼叫 Google OCR')
    const visionStageStartedAt = performance.now()
    progressResponse.progress(15, 'Google OCR 已開始辨識文件')
    const recognizedFiles = await recognizeUploadedFiles(
      files,
      languageHints,
      ({ ratio, status }) => {
        progressResponse.progress(15 + ratio * 65, status)
      },
    )
    const googleVisionStageMs = performance.now() - visionStageStartedAt

    progressResponse.progress(84, 'OCR 文字辨識完成，正在合併逐頁結果')
    const pageTexts = recognizedFiles.flatMap(({ result }) => result.pageTexts)
    const visionPages = reindexVisionPages(
      recognizedFiles.flatMap(({ result }) => result.visionPages),
    )
    const text = pageTexts
      .map((pageText) => pageText.trimEnd())
      .join('\n\n')
      .trim()

    if (!text) {
      return progressResponse.fail(
        'OCR 沒有辨識到可用文字，請改用更清晰的掃描檔或照片再試一次。',
        422,
      )
    }

    const fileDetails = recognizedFiles.map(({ file, result }) => ({
      fileName: path.basename(decodeUploadedFileName(file.originalname)),
      mimeType: file.mimetype,
      size: file.size,
      pageCount: result.pageCount,
      wordCount: result.visionPages.reduce((count, page) => count + page.words.length, 0),
    }))
    const warnings = recognizedFiles.flatMap(({ file, result }) =>
      result.warnings.map((warning) =>
        files.length > 1 ? `${decodeUploadedFileName(file.originalname)}：${warning}` : warning,
      ),
    )
    progressResponse.progress(88, '逐頁結果整理完成，正在抽取租約欄位')
    let startedAt = performance.now()
    const ruleAnalysis = analyzeContractFields({ text, pageTexts, visionPages })
    const ruleExtractionMs = performance.now() - startedAt
    progressResponse.progress(95, '租約欄位抽取完成，正在建立辨識結果')
    const targetFieldIds = ollamaConfig.enabled
      ? selectAiReviewFields(ruleAnalysis.unresolvedFieldIds)
      : []
    const jobId = targetFieldIds.length ? randomUUID() : ''

    if (jobId) {
      aiReviewJobs.set(jobId, {
        jobId,
        status: 'pending',
        model: ollamaConfig.model,
        fieldReviews: {},
        targetFieldIds,
        cropCount: 0,
        cropRegions: [],
        mode: 'selective',
        durationMs: 0,
        performanceMetrics: null,
        timings: { cropGenerationMs: 0, ollamaMs: 0 },
        warnings: [],
      })
      void runAiReviewJob({ jobId, files, visionPages, pageTexts, targetFieldIds })
    }

    const timings = roundTimings({
      googleVisionMs: googleVisionStageMs,
      normalizationMs: recognizedFiles.reduce(
        (sum, item) => sum + item.result.timings.normalizationMs,
        0,
      ),
      ruleExtractionMs,
      cropGenerationMs: 0,
      ollamaMs: 0,
    })
    const baseEngine =
      files.length === 1
        ? recognizedFiles[0].result.engine
        : `DOCUMENT_TEXT_DETECTION (${files.length} images)`

    const result = {
      fileName: fileDetails.map((file) => file.fileName).join('、'),
      mimeType: files.length === 1 ? files[0].mimetype : 'multiple/images',
      size: files.reduce((sum, file) => sum + file.size, 0),
      languageHints,
      text,
      pageCount: pageTexts.length,
      pageTexts,
      warnings,
      engine: `${baseEngine} + RULE_GATE`,
      files: fileDetails,
      storage: 'temporary-memory',
      visionPages,
      cropRegions: [],
      fieldReviews: ruleAnalysis.fieldReviews,
      fieldDecisions: ruleAnalysis.decisions,
      timings,
      aiReview: {
        status: jobId ? 'pending' : 'skipped',
        jobId,
        model: ollamaConfig.model,
        fieldCount: 0,
        ruleFieldCount: Object.keys(ruleAnalysis.fieldReviews).length,
        unresolvedFieldCount: ruleAnalysis.unresolvedFieldIds.length,
        targetFieldIds,
        cropCount: 0,
        mode: jobId ? 'selective' : 'rules',
        durationMs: 0,
        performanceMetrics: null,
      },
    }
    progressResponse.progress(98, '辨識結果整理完成，準備顯示')
    return progressResponse.complete(result)
  } catch (error) {
    console.error('[OCR] failed:', error)
    const userFacingError = getUserFacingError(error)
    if (progressResponse) return progressResponse.fail(userFacingError)
    return res.status(500).json({ error: userFacingError })
  }
})

app.use((error, _req, res, next) => {
  if (!(error instanceof multer.MulterError)) return next(error)

  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `單一檔案不可超過 ${maxFileSizeMb}MB。` })
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ error: `一次最多上傳 ${maxFileCount} 張圖片。` })
  }

  return res.status(400).json({ error: '上傳資料格式不正確，請重新選擇檔案。' })
})

app.listen(port, () => {
  console.log(`OCR API listening on http://localhost:${port}`)
})

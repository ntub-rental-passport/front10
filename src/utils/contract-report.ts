import { PDFDocument } from 'pdf-lib'

export type ContractReportRisk = {
  id: string
  title: string
  severity: 'high' | 'medium' | 'low'
  sourceLabel: string
  pageIndex: number | null
  clause: string
  description: string
  advice: string
  legalBasis?: string[]
}

export type ContractReportInput = {
  fileName: string
  risks: ContractReportRisk[]
  fieldValues?: Record<string, string>
  privacyMode: boolean
  generatedAt?: Date
  reportId?: string
}

export type ContractReportResult = {
  bytes: Uint8Array
  fileName: string
  reportId: string
  generatedAtLabel: string
}

type MaskType = 'PERSON' | 'TW_ID' | 'PHONE' | 'EMAIL' | 'ADDRESS' | 'BANK_ACCOUNT'

const SENSITIVE_FIELD_TYPES: Record<string, MaskType> = {
  landlord: 'PERSON',
  tenant: 'PERSON',
  agent_name: 'PERSON',
  landlord_id: 'TW_ID',
  tenant_id: 'TW_ID',
  agent_id: 'TW_ID',
  landlord_phone: 'PHONE',
  tenant_phone: 'PHONE',
  landlord_registered_address: 'ADDRESS',
  tenant_registered_address: 'ADDRESS',
  landlord_mailing_address: 'ADDRESS',
  tenant_mailing_address: 'ADDRESS',
  address: 'ADDRESS',
}

const TYPE_LABELS: Record<MaskType, string> = {
  PERSON: 'PERSON',
  TW_ID: 'TW_ID',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  ADDRESS: 'ADDRESS',
  BANK_ACCOUNT: 'BANK_ACCOUNT',
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createReportId(date = new Date(), randomSource = crypto): string {
  const datePart = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replaceAll('-', '')
  const bytes = new Uint8Array(5)
  randomSource.getRandomValues(bytes)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
  return `RM-${datePart}-${suffix}`
}

export function createDeidentifier(fieldValues: Record<string, string> = {}) {
  const valueTokens = new Map<string, string>()
  const counters: Record<MaskType, number> = {
    PERSON: 0,
    TW_ID: 0,
    PHONE: 0,
    EMAIL: 0,
    ADDRESS: 0,
    BANK_ACCOUNT: 0,
  }

  const tokenFor = (rawValue: string, type: MaskType): string => {
    const normalized = rawValue.trim()
    const key = `${type}:${normalized}`
    const existing = valueTokens.get(key)
    if (existing) return existing
    counters[type] += 1
    const token = `<${TYPE_LABELS[type]}_${counters[type]}>`
    valueTokens.set(key, token)
    return token
  }

  const knownValues = Object.entries(fieldValues)
    .map(([fieldId, value]) => ({
      type: SENSITIVE_FIELD_TYPES[fieldId],
      value: String(value ?? '').trim(),
    }))
    .filter((entry): entry is { type: MaskType; value: string } => Boolean(entry.type && entry.value))
    .sort((first, second) => second.value.length - first.value.length)

  return (input: string): string => {
    let output = String(input ?? '')

    for (const entry of knownValues) {
      output = output.replace(
        new RegExp(escapeRegExp(entry.value), 'g'),
        tokenFor(entry.value, entry.type),
      )
    }

    const patterns: Array<{ type: MaskType; pattern: RegExp }> = [
      { type: 'EMAIL', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
      { type: 'TW_ID', pattern: /\b[A-Z][12]\d{8}\b/gi },
      { type: 'TW_ID', pattern: /\b[A-Z][89A-D]\d{8}\b/gi },
      { type: 'PHONE', pattern: /(?<!\d)09\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g },
      { type: 'PHONE', pattern: /(?<!\d)0\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/g },
    ]

    for (const { type, pattern } of patterns) {
      output = output.replace(pattern, (match) => tokenFor(match, type))
    }
    output = output.replace(
      /((?:銀行帳號|帳戶|匯款帳號)[：:\s]{0,4})(\d[\d\s-]{8,20}\d)/g,
      (_, label: string, account: string) => `${label}${tokenFor(account, 'BANK_ACCOUNT')}`,
    )
    return output
  }
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function severityLabel(severity: ContractReportRisk['severity']): string {
  return severity === 'high' ? '高風險' : severity === 'medium' ? '中風險' : '低風險'
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = String(text ?? '').split(/\r?\n/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let line = ''
    for (const char of paragraph) {
      const nextLine = line + char
      if (line && context.measureText(nextLine).width > maxWidth) {
        lines.push(line)
        line = char
      } else {
        line = nextLine
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('無法建立 PDF 頁面影像。'))
        return
      }
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/png')
  })
}

export async function generateContractReportPdf(
  input: ContractReportInput,
): Promise<ContractReportResult> {
  if (typeof document === 'undefined') throw new Error('PDF 報告只能在瀏覽器中產生。')
  await document.fonts?.ready

  const generatedAt = input.generatedAt ?? new Date()
  const reportId = input.reportId ?? createReportId(generatedAt)
  const generatedAtLabel = formatGeneratedAt(generatedAt)
  const deidentify = createDeidentifier(input.fieldValues)
  const protect = (value: string) => input.privacyMode ? deidentify(value) : String(value ?? '')
  const pageWidth = 1240
  const pageHeight = 1754
  const marginX = 92
  const top = 100
  const bottom = 120
  const contentWidth = pageWidth - marginX * 2
  const canvases: HTMLCanvasElement[] = []
  let canvas: HTMLCanvasElement
  let context: CanvasRenderingContext2D
  let cursorY = top

  const newPage = () => {
    canvas = document.createElement('canvas')
    canvas.width = pageWidth
    canvas.height = pageHeight
    const nextContext = canvas.getContext('2d')
    if (!nextContext) throw new Error('瀏覽器不支援報告繪製。')
    context = nextContext
    context.fillStyle = '#f8f7ff'
    context.fillRect(0, 0, pageWidth, pageHeight)
    context.save()
    context.translate(pageWidth / 2, pageHeight / 2)
    context.rotate(-Math.PI / 5)
    context.font = '700 92px "Noto Sans TC", "Microsoft JhengHei", sans-serif'
    context.fillStyle = 'rgba(82, 63, 229, 0.055)'
    context.textAlign = 'center'
    context.fillText('RentMate AI 診斷報告', 0, 0)
    context.restore()
    context.textAlign = 'left'
    cursorY = top
    canvases.push(canvas)
  }

  const ensureSpace = (height: number) => {
    if (cursorY + height > pageHeight - bottom) newPage()
  }

  const drawText = (
    text: string,
    options: { size?: number; color?: string; weight?: number; lineHeight?: number; gap?: number } = {},
  ) => {
    const size = options.size ?? 30
    const lineHeight = options.lineHeight ?? Math.round(size * 1.55)
    context.font = `${options.weight ?? 400} ${size}px "Noto Sans TC", "Microsoft JhengHei", sans-serif`
    context.fillStyle = options.color ?? '#27233a'
    const lines = wrapText(context, text, contentWidth)
    ensureSpace(Math.max(lineHeight, lines.length * lineHeight) + (options.gap ?? 0))
    for (const line of lines) {
      context.fillText(line, marginX, cursorY)
      cursorY += lineHeight
    }
    cursorY += options.gap ?? 0
  }

  const drawRule = () => {
    ensureSpace(34)
    context.strokeStyle = '#d9d4ef'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(marginX, cursorY)
    context.lineTo(pageWidth - marginX, cursorY)
    context.stroke()
    cursorY += 34
  }

  newPage()
  drawText('RENTMATE · CONTRACT REVIEW', { size: 22, color: '#6657d9', weight: 700, gap: 18 })
  drawText('契約 AI 診斷分析報告書', { size: 58, color: '#12101a', weight: 800, lineHeight: 76, gap: 30 })
  drawText(`報告編號：${reportId}`, { size: 26, color: '#5f5a70', gap: 8 })
  drawText(`產出日期：${generatedAtLabel}（Asia/Taipei）`, { size: 26, color: '#5f5a70', gap: 8 })
  drawText(`契約檔案：${protect(input.fileName)}`, { size: 26, color: '#5f5a70', gap: 8 })
  drawText(`報告版本：${input.privacyMode ? '隱私保護版' : '完整資料版'}`, { size: 26, color: input.privacyMode ? '#087f5b' : '#b54708', weight: 700, gap: 36 })
  drawRule()

  const counts = {
    high: input.risks.filter((risk) => risk.severity === 'high').length,
    medium: input.risks.filter((risk) => risk.severity === 'medium').length,
    low: input.risks.filter((risk) => risk.severity === 'low').length,
  }
  drawText('診斷摘要', { size: 38, color: '#12101a', weight: 800, gap: 18 })
  drawText(
    `共 ${input.risks.length} 項提醒｜高風險 ${counts.high}｜中風險 ${counts.medium}｜低風險 ${counts.low}`,
    { size: 30, weight: 700, gap: 18 },
  )
  drawText(
    counts.high
      ? `建議先處理 ${counts.high} 項高風險內容，再依序確認其他提醒。`
      : '目前沒有高風險項目，仍建議逐項核對契約原文。',
    { size: 27, color: '#5f5a70', gap: 38 },
  )

  input.risks.forEach((risk, index) => {
    ensureSpace(310)
    drawText(`${index + 1}. ${protect(risk.title)}`, {
      size: 34,
      color: risk.severity === 'high' ? '#c92a2a' : risk.severity === 'medium' ? '#a44b0a' : '#087f5b',
      weight: 800,
      gap: 8,
    })
    drawText(`${severityLabel(risk.severity)}｜${protect(risk.sourceLabel)}${risk.pageIndex === null ? '' : `｜契約第 ${risk.pageIndex + 1} 頁`}`, {
      size: 23,
      color: '#6f6980',
      weight: 700,
      gap: 12,
    })
    if (risk.clause) drawText(`契約內容：${protect(risk.clause)}`, { size: 26, gap: 10 })
    drawText(`風險說明：${protect(risk.description)}`, { size: 26, gap: 10 })
    drawText(`建議處理：${protect(risk.advice)}`, { size: 26, color: '#4033b4', weight: 700, gap: 10 })
    if (risk.legalBasis?.length) {
      drawText(`參考依據：${protect(risk.legalBasis.join('、'))}`, { size: 23, color: '#6f6980', gap: 18 })
    }
    drawRule()
  })

  ensureSpace(250)
  drawText('使用提醒', { size: 36, color: '#12101a', weight: 800, gap: 18 })
  drawText('本報告由 AI 與規則式檢核產生，可能出現誤判或遺漏，應回到契約原文確認。', { size: 25, gap: 10 })
  drawText('本報告不是律師法律意見，也不代表官方認證或契約效力判定。重大風險或爭議案件請諮詢專業人士。', { size: 25, gap: 10 })
  if (input.privacyMode) {
    drawText('本報告已依已辨識欄位及常見台灣個資格式去識別化，但仍建議分享前人工快速檢查。', { size: 25, color: '#087f5b', weight: 700 })
  }

  canvases.forEach((pageCanvas, pageIndex) => {
    const pageContext = pageCanvas.getContext('2d')
    if (!pageContext) return
    pageContext.font = '500 20px "Noto Sans TC", "Microsoft JhengHei", sans-serif'
    pageContext.fillStyle = '#777185'
    pageContext.textAlign = 'left'
    pageContext.fillText(`${reportId}｜${generatedAtLabel}`, marginX, pageHeight - 62)
    pageContext.textAlign = 'right'
    pageContext.fillText(`第 ${pageIndex + 1}／${canvases.length} 頁`, pageWidth - marginX, pageHeight - 62)
  })

  const pdfDocument = await PDFDocument.create()
  pdfDocument.setTitle('RentMate 契約 AI 診斷分析報告書')
  pdfDocument.setAuthor('RentMate')
  pdfDocument.setSubject(input.privacyMode ? '隱私保護版契約風險分析' : '完整資料版契約風險分析')
  pdfDocument.setCreator('RentMate')
  pdfDocument.setProducer('RentMate')
  pdfDocument.setCreationDate(generatedAt)
  pdfDocument.setModificationDate(generatedAt)

  for (const pageCanvas of canvases) {
    const image = await pdfDocument.embedPng(await canvasToPngBytes(pageCanvas))
    const page = pdfDocument.addPage([595.28, 841.89])
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
  }

  const sourceBaseName = input.fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || '契約'
  const baseName = input.privacyMode ? 'RentMate_隱私保護版' : sourceBaseName
  return {
    bytes: await pdfDocument.save({ useObjectStreams: true }),
    fileName: `${baseName}_RentMate_AI診斷_${reportId}.pdf`,
    reportId,
    generatedAtLabel,
  }
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

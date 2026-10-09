import { PDFDocument } from 'pdf-lib'
import { isValidTaiwanNationalId } from '@/shared/contract-field-validation.js'
import type { ContractDocument } from './contract-document'

export function contractPdfPassword(value: string): string {
  const normalized = value.normalize('NFKC').replace(/\s/g, '').toUpperCase()
  if (!isValidTaiwanNationalId(normalized)) throw new Error('請先補齊並核對租客的有效身分證字號，再下載加密 PDF。')
  return normalized
}

type Run = { text: string; bold?: boolean; color?: string; underline?: 'solid' | 'dashed'; checked?: boolean }
type Paragraph = {
  text: string
  runs: Run[]
  size: number
  before: number
  after: number
  color?: string
  sans?: boolean
  center?: boolean
  keepWithNext?: boolean
  box?: boolean
  boxTop?: number
  boxBottom?: number
}
const SERIF = '"Noto Serif TC", "Songti TC", "PMingLiU", serif'
const SANS = '"Microsoft JhengHei", "PingFang TC", sans-serif'

/** Keep field and choice formatting instead of flattening the contract to plain text. */
export function contractPdfParagraphs(document: ContractDocument, heading: string, source: string): Paragraph[] {
  const paragraph = (runs: Run[], options: Partial<Paragraph> = {}): Paragraph => ({
    text: runs.map(run => run.text).join(''), runs, size: 23, before: 0, after: 6, ...options,
  })
  const rows = [
    paragraph([{ text: '內政部 113 年 7 月 8 日台內地字第 11302639334 號函修正' }], { size: 18, center: true, color: '#6b7280' }),
    paragraph([{ text: '住 宅 租 賃 契 約 書', bold: true }], { size: 38, center: true, before: 10, after: 4 }),
    paragraph([{ text: heading }], { size: 20, center: true, color: '#6b7280', after: 36 }),
    paragraph([
      { text: '本頁由辨識並校對後的欄位回拼而成，僅供核對內容之用，' },
      { text: '不等於雙方簽署的契約正本', bold: true },
      { text: `。${document.blankCount ? `其中 ${document.blankCount} 個欄位尚未填寫，以＿＿＿＿標示：${document.blankLabels.join('、')}。` : ''}` },
    ], { size: 20, sans: true, color: '#78350f', box: true, boxTop: 20, boxBottom: source ? 0 : 20, after: source ? 0 : 40 }),
    ...(source ? [paragraph([{ text: source }], { size: 20, sans: true, color: '#92400e', box: true, boxTop: 8, boxBottom: 20, after: 40 })] : []),
  ]
  for (const [index, section] of document.sections.entries()) {
    rows.push(paragraph([{ text: section.title, bold: true }], { size: 25, before: index ? 30 : 0, after: 12, keepWithNext: true }))
    for (const line of section.lines) {
      if (line.kind === 'aside') {
        rows.push(paragraph([{ text: line.subtitle || line.note || '', bold: Boolean(line.subtitle) }], line.subtitle
          ? { before: 14, after: 6, keepWithNext: true }
          : { size: 20, sans: true, color: '#6b7280' }))
      } else {
        const runs: Run[] = line.segments.flatMap((segment): Run[] => {
          if (segment.kind === 'literal') return [{ text: segment.text }]
          if (segment.kind === 'value') return [{
            text: ` ${segment.text} `, bold: segment.filled,
            underline: segment.filled ? 'solid' : 'dashed', color: segment.filled ? '#1a1a1a' : '#9ca3af',
          }]
          return segment.options.flatMap(option => [
            { text: option.checked ? '☑' : '☐', checked: option.checked, color: option.checked ? '#1a1a1a' : '#6b7280' },
            { text: ` ${option.text}　`, bold: option.checked, color: option.checked ? '#1a1a1a' : '#6b7280' },
          ])
        })
        rows.push(paragraph(runs))
      }
    }
  }
  return rows
}

/** Local-font rendering, with A4 pagination; no contract data sent to a rendering service. */
export async function createContractPdf(document_: ContractDocument, heading: string, source: string): Promise<Uint8Array> {
  await document.fonts.load(`23px ${SERIF}`)
  await document.fonts.load(`bold 23px ${SERIF}`)
  await document.fonts.ready
  const pdf = await PDFDocument.create()
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('瀏覽器無法產生 PDF，請換用支援 Canvas 的瀏覽器。')
  const left = 90, width = 1060, top = 80, bottom = 1625
  let y = top
  const reset = () => {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    y = top
  }
  reset()
  const savePage = async () => {
    if (pdf.getPageCount() >= 60) throw new Error('契約頁數過多，無法匯出。')
    ctx.font = `18px ${SERIF}`
    ctx.fillStyle = '#6b7280'
    const footer = `RentMate · ${pdf.getPageCount() + 1}`
    ctx.fillText(footer, (canvas.width - ctx.measureText(footer).width) / 2, 1695)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PDF 產生失敗。')), 'image/png'))
    const image = await pdf.embedPng(await blob.arrayBuffer())
    pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
    reset()
  }
  type Glyph = { char: string; width: number; run: Run }
  const font = (p: Paragraph, run: Run) => { ctx.font = `${run.bold ? 'bold ' : ''}${p.size}px ${p.sans ? SANS : SERIF}` }
  const wrap = (p: Paragraph): Glyph[][] => {
    const lines: Glyph[][] = [[]]
    let used = 0
    const available = width - (p.box ? 52 : 0)
    for (const run of p.runs) {
      font(p, run)
      for (const char of run.text) {
        if (char === '\n') { lines.push([]); used = 0; continue }
        const advance = run.checked !== undefined ? p.size : ctx.measureText(char).width
        if (used + advance > available && lines[lines.length - 1]!.length) { lines.push([]); used = 0 }
        lines[lines.length - 1]!.push({ char, width: advance, run })
        used += advance
      }
    }
    return lines
  }
  const paragraphs = contractPdfParagraphs(document_, heading, source)
  for (const [index, p] of paragraphs.entries()) {
    const lines = wrap(p)
    const lineHeight = p.size * (p.sans ? 1.75 : 2)
    const next = paragraphs[index + 1]
    // Keep headings with the first two lines below them; paragraphs have at least two lines per split.
    const following = p.keepWithNext && next ? next.before + Math.min(2, wrap(next).length) * next.size * (next.sans ? 1.75 : 2) : 0
    const required = p.before + (p.boxTop || 0) + Math.min(lines.length, p.keepWithNext ? lines.length : 3) * lineHeight + p.after + following
    if (y > top && y + required > bottom) await savePage()
    y += y === top ? 0 : p.before
    const paintBox = (height: number) => {
      ctx.fillStyle = '#fffbeb'
      ctx.fillRect(left, y, width, height)
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(left, y, 4, height)
    }
    if (p.boxTop) { paintBox(p.boxTop); y += p.boxTop }
    for (const [lineIndex, line] of lines.entries()) {
      const remaining = lines.length - lineIndex
      const needed = lineHeight * (remaining === 2 ? 2 : 1) + (remaining === 1 ? p.boxBottom || 0 : 0)
      if (y + needed > bottom) await savePage()
      if (p.box) paintBox(lineHeight)
      let x = p.center ? (canvas.width - line.reduce((sum, glyph) => sum + glyph.width, 0)) / 2 : left + (p.box ? 26 : 0)
      const baseline = y + (lineHeight - p.size) / 2 + p.size * 0.82
      for (const glyph of line) {
        const { run } = glyph
        font(p, run)
        ctx.fillStyle = run.color || p.color || '#1a1a1a'
        if (run.checked !== undefined) {
          // Draw boxes explicitly: local Chinese fonts do not all contain checkbox glyphs.
          const boxSize = p.size * 0.68, boxY = baseline - boxSize
          ctx.strokeStyle = ctx.fillStyle
          ctx.lineWidth = 1.4
          ctx.strokeRect(x + 2, boxY, boxSize, boxSize)
          if (run.checked) {
            ctx.beginPath()
            ctx.moveTo(x + 4, boxY + boxSize * 0.5)
            ctx.lineTo(x + 2 + boxSize * 0.42, boxY + boxSize * 0.82)
            ctx.lineTo(x + 2 + boxSize * 0.88, boxY + boxSize * 0.15)
            ctx.stroke()
          }
        } else ctx.fillText(glyph.char, x, baseline)
        if (run.underline) {
          ctx.strokeStyle = '#9ca3af'
          ctx.lineWidth = 1
          ctx.setLineDash(run.underline === 'dashed' ? [4, 3] : [])
          ctx.lineDashOffset = -x
          ctx.beginPath()
          ctx.moveTo(x, baseline + 5)
          ctx.lineTo(x + glyph.width, baseline + 5)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.lineDashOffset = 0
        }
        x += glyph.width
      }
      y += lineHeight
    }
    if (p.boxBottom) { paintBox(p.boxBottom); y += p.boxBottom }
    y += p.after
  }
  if (y > top) await savePage()
  return pdf.save()
}

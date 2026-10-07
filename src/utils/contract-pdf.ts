import { PDFDocument } from 'pdf-lib'
import { isValidTaiwanNationalId } from '@/shared/contract-field-validation.js'
import type { ContractDocument } from './contract-document'

export function contractPdfPassword(value: string): string {
  const normalized = value.normalize('NFKC').replace(/\s/g, '').toUpperCase()
  if (!isValidTaiwanNationalId(normalized)) throw new Error('請先補齊並核對租客的有效身分證字號，再下載加密 PDF。')
  return normalized
}

export function contractPdfParagraphs(document: ContractDocument, heading: string, source: string) {
  return [
    { text: '住宅租賃契約書', size: 38, bold: true },
    { text: heading, size: 23 },
    { text: '本文件由校對欄位回拼，僅供核對內容，不等於雙方簽署的契約正本。', size: 23 },
    ...(document.blankCount ? [{ text: `尚未填寫：${document.blankLabels.join('、')}。`, size: 23 }] : []),
    { text: source, size: 22 },
    ...document.sections.flatMap(section => [
      { text: section.title, size: 29, bold: true },
      ...section.lines.map(line => line.kind === 'aside'
        ? { text: line.subtitle || line.note || '', size: 24, bold: Boolean(line.subtitle) }
        : { text: line.segments.map(segment => segment.kind === 'choice'
          ? segment.options.map(option => `${option.checked ? '☑' : '☐'} ${option.text}`).join('　')
          : segment.text).join(''), size: 25 }),
    ]),
  ]
}

/** Rasterize Chinese with local fonts; no font/CDN or third-party data requests. */
export async function createContractPdf(document_: ContractDocument, heading: string, source: string): Promise<Uint8Array> {
  await document.fonts.ready
  const pdf = await PDFDocument.create()
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('瀏覽器無法產生 PDF，請換用支援 Canvas 的瀏覽器。')
  let y = 100
  const reset = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); y = 100 }
  reset()
  const savePage = async () => {
    if (pdf.getPageCount() >= 60) throw new Error('契約頁數過多，無法匯出。')
    ctx.font = '20px "Microsoft JhengHei", "PingFang TC", sans-serif'
    ctx.fillStyle = '#666'
    ctx.fillText(`RentMate · ${pdf.getPageCount() + 1}`, 90, 1695)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PDF 產生失敗。')), 'image/png'))
    const image = await pdf.embedPng(await blob.arrayBuffer())
    pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
    reset()
  }
  for (const paragraph of contractPdfParagraphs(document_, heading, source)) {
    const setFont = () => { ctx.font = `${paragraph.bold ? 'bold ' : ''}${paragraph.size}px "Microsoft JhengHei", "PingFang TC", sans-serif`; ctx.fillStyle = '#191919' }
    if (paragraph.bold && y > 1510) await savePage()
    setFont()
    const lines: string[] = []
    let line = ''
    for (const char of paragraph.text) {
      if (char === '\n') { lines.push(line); line = ''; continue }
      if (ctx.measureText(line + char).width > 1060) { lines.push(line); line = '' }
      line += char
    }
    if (line) lines.push(line)
    for (const text of lines) {
      if (y + paragraph.size * 1.7 > 1625) { await savePage(); setFont() }
      ctx.fillText(text, 90, y)
      y += paragraph.size * 1.7
    }
    y += 15
  }
  if (y > 100) await savePage()
  return pdf.save()
}

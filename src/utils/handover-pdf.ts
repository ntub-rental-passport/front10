import { PDFDocument } from 'pdf-lib'
import type { HandoverEvidence, HandoverItem, HandoverProperty } from '@/src/composables/useHandover'
import { countItemsWithEvidence, firstEvidenceOfPhase, formatHandoverTimestamp } from './handover'
import {
  baselineExportGroups,
  checkoutConclusion,
  checkoutExportItems,
  formatConfidence,
  paginateBaselineGroups,
} from './handover-export'

const PAGE_WIDTH = 1240
const PAGE_HEIGHT = 1754
const MARGIN = 80
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_TOP = 350
const FOOTER_TOP = PAGE_HEIGHT - 76
const TEXT_COLOR = '#25324a'
const MUTED_COLOR = '#627088'
const BORDER_COLOR = '#cbd0d8'
const MIN_FONT_SIZE = 12

// 分頁與繪製共用高度，避免調整版面後，項目或簽名區悄悄超出頁碼上緣。
const CHECKLIST_HEIGHTS = {
  roomTitle: 32,
  tableHeading: 36,
  roomGap: 8,
  item: 48,
  signatureTopGap: 30,
  signatureLine: 40,
  signatureLineGap: 16,
}
const BASELINE_HEIGHTS = { roomHeading: 44, itemBox: 250, itemGap: 16 }

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > width) {
        lines.push(line)
        line = char
      } else {
        line += char
      }
    }
    lines.push(line)
  }
  return lines
}

function drawTextBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size = 24,
  color = TEXT_COLOR,
): void {
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (let fontSize = size; fontSize >= MIN_FONT_SIZE; fontSize -= 1) {
    ctx.font = `${fontSize}px "Microsoft JhengHei", "PingFang TC", sans-serif`
    const lines = wrapText(ctx, text, width)
    const lineHeight = fontSize * 1.4
    if (lines.length * lineHeight > height) continue
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
    return
  }
  // 長備註不應讓整份匯出失敗、迫使使用者刪除存證；縮到下限後明示截斷，避免誤認為已列出全文。
  const lineHeight = MIN_FONT_SIZE * 1.4
  const lines = wrapText(ctx, text, width).slice(0, Math.max(1, Math.floor(height / lineHeight)))
  const suffix = '…（內容過長，完整內容請見 App）'
  const lastLine = Array.from(lines[lines.length - 1])
  while (lastLine.length && ctx.measureText(lastLine.join('') + suffix).width > width) {
    lastLine.pop()
  }
  lines[lines.length - 1] = lastLine.join('') + suffix
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
}

function drawRoomTitle(
  ctx: CanvasRenderingContext2D,
  room: string,
  continued: boolean,
  y: number,
  height: number,
): void {
  ctx.fillStyle = '#f0f2f5'
  ctx.fillRect(MARGIN, y, CONTENT_WIDTH, height)
  drawTextBox(ctx, `${room}${continued ? '（續頁）' : ''}`, MARGIN + 12, y + 3, CONTENT_WIDTH - 24, height - 6, 26)
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('無法建立 PDF 頁面影像。')),
      'image/jpeg',
      quality,
    )
  })
}

async function flushPage(canvas: HTMLCanvasElement, pdf: PDFDocument): Promise<void> {
  const blob = await canvasToJpegBlob(canvas, 0.82)
  const image = await pdf.embedJpg(await blob.arrayBuffer())
  pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
}

async function drawPhoto(
  ctx: CanvasRenderingContext2D,
  evidence: HandoverEvidence | null,
  x: number,
  y: number,
  width: number,
  height: number,
  missingLabel = '（未拍攝）',
): Promise<void> {
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y, width, height)
  let label = missingLabel
  if (evidence) {
    const image = new Image()
    try {
      image.src = evidence.url
      await image.decode()
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('照片尺寸無效。')
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
      const sourceWidth = width / scale
      const sourceHeight = height / scale
      ctx.drawImage(
        image,
        (image.naturalWidth - sourceWidth) / 2,
        (image.naturalHeight - sourceHeight) / 2,
        sourceWidth,
        sourceHeight,
        x, y, width, height,
      )
      label = ''
    } catch {
      // 單張壞檔不應讓其他物品的存證一起無法匯出，也不能被誤認成從未存證。
      label = '（照片讀取失敗）'
    } finally {
      // 不快取解碼後的照片，避免大量存證在手機上與頁面影像一起佔住記憶體。
      image.removeAttribute('src')
    }
  }
  ctx.strokeStyle = BORDER_COLOR
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, height)
  if (label) {
    drawTextBox(ctx, label, x + 16, y + height / 2 - 18, width - 32, 40, 24, MUTED_COLOR)
  }
}

async function generatePdf(
  property: HandoverProperty,
  title: string,
  description: string,
  totalPages: number,
  drawContent: (ctx: CanvasRenderingContext2D, pageIndex: number) => Promise<void> | void,
): Promise<Uint8Array> {
  if (typeof document === 'undefined') throw new Error('點交 PDF 只能在瀏覽器中產生。')
  if (!totalPages) throw new Error('沒有可匯出的點交項目。')
  try {
    await document.fonts.ready
    const generatedAt = new Date()
    const generatedAtLabel = formatHandoverTimestamp(generatedAt.toISOString())
    const pdf = await PDFDocument.create()
    pdf.setTitle(`RentMate｜${title}`)
    pdf.setAuthor('RentMate')
    pdf.setCreator('RentMate')
    pdf.setCreationDate(generatedAt)

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      const canvas = document.createElement('canvas')
      try {
        canvas.width = PAGE_WIDTH
        canvas.height = PAGE_HEIGHT
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('無法建立 PDF，請換用支援 Canvas 的瀏覽器。')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
        drawTextBox(ctx, `RentMate｜${title}`, MARGIN, 70, CONTENT_WIDTH, 64, 42)
        drawTextBox(ctx, `租屋處：${property.alias}（${property.address}）`, MARGIN, 146, CONTENT_WIDTH, 76, 26)
        drawTextBox(ctx, `匯出時間：${generatedAtLabel}`, MARGIN, 228, CONTENT_WIDTH, 34, 22, MUTED_COLOR)
        drawTextBox(ctx, description, MARGIN, 270, CONTENT_WIDTH, 62, 22, MUTED_COLOR)
        await drawContent(ctx, pageIndex)
        drawTextBox(ctx, `第 ${pageIndex + 1}／${totalPages} 頁`, MARGIN, FOOTER_TOP, CONTENT_WIDTH, 36, 22, MUTED_COLOR)
        await flushPage(canvas, pdf)
      } finally {
        // iOS 無法承受數十張 A4 canvas 同時存活；每頁嵌入後立刻歸還 backing store，失敗也要釋放。
        canvas.width = 0
        canvas.height = 0
      }
    }
    return await pdf.save()
  } catch (cause) {
    // 原生編碼與 pdf-lib 的錯誤可能只有英文，呼叫端需要可直接顯示的中文訊息。
    const detail = cause instanceof Error ? cause.message : '請稍後再試。'
    throw new Error(`點交 PDF 產生失敗：${detail}`, { cause })
  }
}

export async function generateHandoverChecklistPdf(
  property: HandoverProperty,
  items: HandoverItem[],
): Promise<Uint8Array> {
  const groups = baselineExportGroups(items.filter((item) => item.propertyId === property.id))
  const signatureLines = [
    '租客簽名：__________________________',
    '房東簽名：__________________________',
    '日期：______年______月______日',
  ]
  const pages = paginateBaselineGroups(groups, {
    availableHeight: FOOTER_TOP - CONTENT_TOP,
    itemHeight: CHECKLIST_HEIGHTS.item,
    roomHeadingHeight: CHECKLIST_HEIGHTS.roomTitle + CHECKLIST_HEIGHTS.tableHeading + CHECKLIST_HEIGHTS.roomGap,
    lastPageReserve: CHECKLIST_HEIGHTS.signatureTopGap + signatureLines.length * CHECKLIST_HEIGHTS.signatureLine
      + (signatureLines.length - 1) * CHECKLIST_HEIGHTS.signatureLineGap,
  })
  return generatePdf(
    property,
    '入住點交條列清單',
    '說明：請於點交當天逐項勾選並於備註欄記錄物品現況，回家後再對照拍攝存證。',
    pages.length,
    (ctx, pageIndex) => {
      let y = CONTENT_TOP
      const columnWidths = [48, 324, 514, 194]
      const drawRow = (values: string[], height: number, header = false) => {
        let x = MARGIN
        values.forEach((value, index) => {
          const width = columnWidths[index]
          if (header) {
            ctx.fillStyle = '#fafafa'
            ctx.fillRect(x, y, width, height)
          }
          ctx.strokeStyle = BORDER_COLOR
          ctx.strokeRect(x, y, width, height)
          drawTextBox(ctx, value, x + 8, y + 6, width - 16, height - 12, 22)
          x += width
        })
        y += height
      }
      for (const section of pages[pageIndex].sections) {
        drawRoomTitle(ctx, section.room, section.continued, y, CHECKLIST_HEIGHTS.roomTitle)
        y += CHECKLIST_HEIGHTS.roomTitle
        drawRow(['☐', '物品', '現況備註', '已拍攝'], CHECKLIST_HEIGHTS.tableHeading, true)
        for (const item of section.items) {
          drawRow(['☐', item.name, '', firstEvidenceOfPhase(item, 'baseline') ? '✓' : ''], CHECKLIST_HEIGHTS.item)
        }
        y += CHECKLIST_HEIGHTS.roomGap
      }
      if (pageIndex === pages.length - 1) {
        y += CHECKLIST_HEIGHTS.signatureTopGap
        for (const line of signatureLines) {
          drawTextBox(ctx, line, MARGIN, y, CONTENT_WIDTH, CHECKLIST_HEIGHTS.signatureLine)
          y += CHECKLIST_HEIGHTS.signatureLine + CHECKLIST_HEIGHTS.signatureLineGap
        }
      }
    },
  )
}

export async function generateHandoverBaselinePdf(
  property: HandoverProperty,
  items: HandoverItem[],
): Promise<Uint8Array> {
  const propertyItems = items.filter((item) => item.propertyId === property.id)
  const groups = baselineExportGroups(propertyItems)
  const pages = paginateBaselineGroups(groups, {
    availableHeight: FOOTER_TOP - CONTENT_TOP,
    itemHeight: BASELINE_HEIGHTS.itemBox + BASELINE_HEIGHTS.itemGap,
    roomHeadingHeight: BASELINE_HEIGHTS.roomHeading,
  })
  const description = `共 ${propertyItems.length} 項，其中 ${countItemsWithEvidence(propertyItems, 'baseline')} 項已存證，涵蓋 ${groups.length} 個房間。`
  return generatePdf(property, '入住點交完整證據包', description, pages.length, async (ctx, pageIndex) => {
    let y = CONTENT_TOP
    for (const section of pages[pageIndex].sections) {
      drawRoomTitle(ctx, section.room, section.continued, y, BASELINE_HEIGHTS.roomHeading)
      y += BASELINE_HEIGHTS.roomHeading
      for (const item of section.items) {
        const evidence = firstEvidenceOfPhase(item, 'baseline')
        ctx.strokeStyle = BORDER_COLOR
        ctx.strokeRect(MARGIN, y, CONTENT_WIDTH, BASELINE_HEIGHTS.itemBox)
        await drawPhoto(ctx, evidence, MARGIN + 16, y + 16, 280, 200)
        const textX = MARGIN + 320
        const textWidth = CONTENT_WIDTH - 336
        drawTextBox(ctx, item.name, textX, y + 12, textWidth, 52, 30)
        const lines: string[] = []
        if (evidence) {
          if (evidence.aiLabel) lines.push(`AI 標籤：${evidence.aiLabel}`)
          const confidence = formatConfidence(evidence.aiConfidence)
          if (confidence) lines.push(`AI 清晰度：${confidence}`)
          lines.push(`拍攝時間：${formatHandoverTimestamp(evidence.capturedAt)}`)
          if (evidence.integrityNote) lines.push(evidence.integrityNote)
          if (evidence.note) lines.push(`備註：${evidence.note}`)
          if (evidence.userNote) lines.push(`使用者備註：${evidence.userNote}`)
        }
        drawTextBox(ctx, lines.join('\n'), textX, y + 68, textWidth, 166, 23, MUTED_COLOR)
        y += BASELINE_HEIGHTS.itemBox + BASELINE_HEIGHTS.itemGap
      }
    }
  })
}

export async function generateHandoverCheckoutPdf(
  property: HandoverProperty,
  items: HandoverItem[],
): Promise<Uint8Array> {
  const exportItems = checkoutExportItems(items.filter((item) => item.propertyId === property.id))
  return generatePdf(property, '退租點交證據包', `共 ${exportItems.length} 項搬入存證，每項一頁。`, exportItems.length, async (ctx, pageIndex) => {
    const item = exportItems[pageIndex]
    const baseline = firstEvidenceOfPhase(item, 'baseline')
    const checkout = firstEvidenceOfPhase(item, 'checkout')
    const photoWidth = (CONTENT_WIDTH - 32) / 2
    const checkoutX = MARGIN + photoWidth + 32
    drawTextBox(ctx, '搬入', MARGIN, CONTENT_TOP, photoWidth, 48, 30)
    drawTextBox(ctx, '退租', checkoutX, CONTENT_TOP, photoWidth, 48, 30)
    await drawPhoto(ctx, baseline, MARGIN, CONTENT_TOP + 56, photoWidth, 400)
    await drawPhoto(ctx, checkout, checkoutX, CONTENT_TOP + 56, photoWidth, 400, '')
    if (baseline) {
      drawTextBox(ctx, `拍攝時間：${formatHandoverTimestamp(baseline.capturedAt)}`, MARGIN, 820, photoWidth, 64, 22, MUTED_COLOR)
    }
    if (checkout) {
      drawTextBox(ctx, `拍攝時間：${formatHandoverTimestamp(checkout.capturedAt)}`, checkoutX, 820, photoWidth, 64, 22, MUTED_COLOR)
    }
    drawTextBox(ctx, `物品：${item.name}`, MARGIN, 930, CONTENT_WIDTH, 90, 38)
    drawTextBox(ctx, `房間：${item.room}`, MARGIN, 1030, CONTENT_WIDTH, 64, 28)
    drawTextBox(ctx, `結論：${checkoutConclusion(item)}`, MARGIN, 1110, CONTENT_WIDTH, 64, 34)
    if (item.diff) {
      drawTextBox(ctx, `信心度：${formatConfidence(item.diff.confidence)}`, MARGIN, 1190, CONTENT_WIDTH, 44, 26, MUTED_COLOR)
      if (item.diff.summary) {
        drawTextBox(ctx, `比對說明：${item.diff.summary}`, MARGIN, 1250, CONTENT_WIDTH, 360, 28)
      }
    }
  })
}

export function downloadHandoverPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  // iOS 的下載流程不能依賴 detached anchor 恰好可用，先掛進 DOM 再觸發。
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

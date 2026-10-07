import { PDFDocument } from 'pdf-lib'
import type { HandoverItem, HandoverProperty } from '../composables/useHandover'
import {
  firstEvidenceOfPhase,
  formatHandoverTimestamp,
  groupItemsByRoom,
  captureAngles,
  completedCaptureAngles,
} from './handover'

/** Standalone A4 pages using local Chinese fonts, as in the contract PDF exporter. */
export async function createHandoverPdf(
  property: HandoverProperty,
  items: HandoverItem[],
  mode: 'full' | 'checklist',
): Promise<Uint8Array> {
  await document.fonts.ready
  if (mode === 'full') return createEvidencePack(property, items)
  const pdf = await PDFDocument.create()
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('瀏覽器無法產生 PDF。')
  const font = '"Microsoft JhengHei", "PingFang TC", sans-serif'
  let y = 85
  const reset = () => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 1240, 1754)
    y = 85
  }
  reset()
  const savePage = async () => {
    ctx.font = `20px ${font}`
    ctx.fillStyle = '#666666'
    ctx.fillText(`RentMate · ${pdf.getPageCount() + 1}`, 550, 1700)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF 產生失敗。'))), 'image/png'),
    )
    const image = await pdf.embedPng(await blob.arrayBuffer())
    pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
    reset()
  }
  const ensure = async (height: number) => {
    if (y + height > 1620) await savePage()
  }
  const text = async (value: string, size = 24, bold = false) => {
    const lines: string[] = []
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`
    for (const paragraph of value.split('\n')) {
      let line = ''
      for (const char of paragraph) {
        if (ctx.measureText(line + char).width > 1080) {
          lines.push(line)
          line = ''
        }
        line += char
      }
      lines.push(line)
    }
    for (const line of lines) {
      await ensure(size * 1.65)
      ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`
      ctx.fillStyle = '#252525'
      ctx.fillText(line, 80, y)
      y += size * 1.65
    }
  }
  await text('入住點交條列清單', 36, true)
  await text(`租屋處：${property.alias}（${property.address}）`)
  await text(`匯出時間：${formatHandoverTimestamp(new Date().toISOString())}`, 21)
  await text(
    `共 ${items.length} 項，已存證 ${items.filter((it) => firstEvidenceOfPhase(it, 'baseline')).length} 項`,
    21,
  )
  for (const group of groupItemsByRoom(items)) {
    await ensure(180)
    y += 20
    await text(group.room, 28, true)
    for (const item of group.items) {
      const evidence = firstEvidenceOfPhase(item, 'baseline')
      await ensure(120)
      await text(`${mode === 'checklist' ? '□ ' : ''}${item.name}`, 25, true)
      if (mode === 'checklist') {
        await text(
          `照片：${evidence ? '已存證' : '未拍攝'}　現況備註：________________________________`,
          22,
        )
      }
      y += 22
    }
  }
  if (mode === 'checklist') {
    await ensure(160)
    await text('租客簽名：________________　房東簽名：________________', 22)
    await text('日期：______年______月______日', 22)
  }
  await savePage()
  return pdf.save()
}

/** Branded evidence tables; long notes continue in a new, labelled table. */
async function createEvidencePack(
  property: HandoverProperty,
  items: HandoverItem[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('瀏覽器無法產生 PDF。')
  const colors = {
    primary: '#4d43ad',
    ink: '#232139',
    muted: '#706d85',
    line: '#dedbea',
    pale: '#f3f1fa',
    white: '#ffffff',
  }
  const primary = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-surface')
    .trim()
  if (primary && CSS.supports('color', primary)) colors.primary = primary
  const font = '"Microsoft JhengHei", "PingFang TC", sans-serif'
  const left = 72,
    width = 1096,
    bottom = 1618
  let y = 0
  const write = (
    text: string,
    x: number,
    top: number,
    size = 22,
    bold = false,
    color = colors.ink,
  ) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = color
    ctx.fillText(text, x, top)
  }
  const box = (x: number, top: number, w: number, h: number, fill: string, border = false) => {
    ctx.fillStyle = fill
    ctx.fillRect(x, top, w, h)
    if (border) {
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1.5
      ctx.strokeRect(x, top, w, h)
    }
  }
  const wrap = (value: string, maxWidth: number, size = 22, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`
    const lines: string[] = []
    for (const paragraph of value.split('\n')) {
      let line = ''
      for (const char of paragraph) {
        if (ctx.measureText(line + char).width > maxWidth && line) {
          lines.push(line)
          line = ''
        }
        line += char
      }
      lines.push(line)
    }
    return lines
  }
  const reset = (first: boolean) => {
    box(0, 0, 1240, 1754, colors.white)
    box(0, 0, 1240, 12, colors.primary)
    write('RentMate', left, 48, 32, true, colors.primary)
    write('入住點交完整證據包', first ? left : 770, first ? 108 : 54, first ? 40 : 27, true)
    y = first ? 180 : 112
  }
  const save = async () => {
    box(left, 1650, width, 1, colors.line)
    write('RentMate  /  入住點交紀錄', left, 1675, 19, false, colors.muted)
    write(`第 ${pdf.getPageCount() + 1} 頁`, 1060, 1675, 19, false, colors.muted)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF 產生失敗。'))), 'image/png'),
    )
    const image = await pdf.embedPng(await blob.arrayBuffer())
    pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
    reset(false)
  }
  const roomHeading = (room: string, count: number, continued = false) => {
    const lines = wrap(`${room}${continued ? '（續）' : ''}`, width - 150, 26, true)
    const height = Math.max(58, lines.length * 36 + 20)
    box(left, y, width, height, colors.pale)
    box(left, y, 5, height, colors.primary)
    lines.forEach((line, i) => write(line, left + 20, y + 12 + i * 36, 26, true, colors.primary))
    write(`${count} 項`, left + width - 80, y + 17, 21, false, colors.muted)
    y += height + 16
  }
  reset(true)
  const address = wrap(`${property.alias}（${property.address}）`, width - 155)
  const metaHeight = 90 + address.length * 32
  box(left, y, width, metaHeight, colors.pale, true)
  write('租屋處', left + 22, y + 22, 21, true, colors.muted)
  address.forEach((line, i) => write(line, left + 130, y + 22 + i * 32))
  write(
    `匯出時間  ${formatHandoverTimestamp(new Date().toISOString())}`,
    left + 22,
    y + metaHeight - 44,
    20,
    false,
    colors.muted,
  )
  y += metaHeight + 16
  const groups = groupItemsByRoom(items)
  const summaries = [
    `點交項目  ${items.length} 項`,
    `已完成  ${items.filter(it => completedCaptureAngles(it) === 2).length} 項`,
    `未完成  ${items.filter(it => completedCaptureAngles(it) < 2).length} 項`,
  ]
  summaries.forEach((value, i) => {
    const w = (width - 24) / 3
    box(left + i * (w + 12), y, w, 58, colors.white, true)
    write(value, left + i * (w + 12) + 20, y + 17, 23, true, colors.primary)
  })
  y += 90
  for (const group of groups) {
    if (y + 430 > bottom) await save()
    roomHeading(group.room, group.items.length)
    for (const { item, evidence, photoIndex } of group.items.flatMap((item) => {
      const photos = [...item.evidences, ...(item.history ?? [])].filter(
        (e) => e.phase === 'baseline',
      )
      return photos.length
        ? photos.map((evidence, photoIndex) => ({ item, evidence, photoIndex }))
        : [{ item, evidence: undefined, photoIndex: 0 }]
    })) {
      let image: HTMLImageElement | undefined
      if (evidence)
        image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          const timer = setTimeout(
            () => reject(new Error(`「${item.name}」照片讀取逾時，請稍後重試。`)),
            20000,
          )
          img.crossOrigin = 'anonymous'
          img.referrerPolicy = 'no-referrer'
          img.onload = () => {
            clearTimeout(timer)
            resolve(img)
          }
          img.onerror = () => {
            clearTimeout(timer)
            reject(new Error(`無法讀取「${item.name}」照片，請重新載入後再匯出。`))
          }
          img.src = evidence.url
        })
      const fields = evidence
        ? [
            ['存證編號', evidence.evidenceNumber || `RM-IN-${evidence.id.padStart(8, '0')}`],
            [
              '照片角度',
              captureAngles.find((a) => a.value === evidence.angle)?.label || '其他／舊照片',
            ],
            [
              '拍攝時間',
              evidence.photoTakenAt
                ? `${formatHandoverTimestamp(evidence.photoTakenAt)}（裝置回報）`
                : '未取得；不以收件時間代替',
            ],
            ['收件時間', formatHandoverTimestamp(evidence.receivedAt || evidence.capturedAt)],
            ['房屋', evidence.propertySnapshot?.address || property.address],
            ['房間／物件', `${item.room}／${item.name}`],
            [
              '照片來源',
              evidence.captureSource === 'camera'
                ? '現場拍攝'
                : evidence.captureSource === 'file'
                  ? '檔案上傳'
                  : '未記錄',
            ],
            ...(evidence.integrityNote ? [['來源說明', evidence.integrityNote]] : []),
            ['辨識結果', evidence.aiLabel || '尚無辨識結果'],
            [
              '原始檔',
              evidence.originalAvailable
                ? '已保存收件原檔，可於系統下載核對'
                : '舊紀錄未保存原始檔',
            ],
            ...(evidence.originalSha256 ? [['SHA-256', evidence.originalSha256]] : []),
            [
              '重拍紀錄',
              evidence.replacesId
                ? `重拍自 RM-IN-${evidence.replacesId.padStart(8, '0')}`
                : '此筆未標記為重拍',
            ],
            ...(evidence.supersededBy
              ? [['歷程狀態', `已由 RM-IN-${evidence.supersededBy.padStart(8, '0')} 取代`]]
              : []),
            ...(evidence.removedAt
              ? [['歷程狀態', `已於 ${formatHandoverTimestamp(evidence.removedAt)} 移至歷程`]]
              : []),
            ['修改狀態', evidence.modificationNote || '上傳前是否修改無法查證'],
            ['系統處理', evidence.processingNote || '舊紀錄僅保留處理後照片'],
            ...(evidence.note ? [['備註', evidence.note]] : []),
            ...(evidence.userNote ? [['使用者備註', evidence.userNote]] : []),
            ...(evidence.descriptionHistory ?? []).map((entry) => [
              '描述歷程',
              `${formatHandoverTimestamp(entry.updatedAt)} 修改前：${entry.previous || '空白'}`,
            ]),
            ...(evidence.angleHistory ?? []).map((entry) => [
              '角度歷程',
              `${formatHandoverTimestamp(entry.updatedAt)} ${entry.previous} → ${entry.current}`,
            ]),
          ]
        : [['存證狀態', '尚未拍攝']]
      const rows = fields.flatMap(([label, value]) =>
        wrap(value, 574).map((line, i) => ({
          label: i === 0 ? label : '',
          text: line,
          start: i === 0,
        })),
      )
      let offset = 0
      const titleLines = wrap(
        `${item.name}${evidence ? ` · 照片 ${photoIndex + 1}` : ''}`,
        width - 210,
        26,
        true,
      )
      const titleHeight = Math.max(62, titleLines.length * 36 + 24)
      while (offset < rows.length) {
        const desired =
          titleHeight +
          Math.max(image && offset === 0 ? 290 : 100, (rows.length - offset) * 36 + 28)
        if (y + Math.min(desired, 1100) > bottom) {
          await save()
          roomHeading(group.room, group.items.length, true)
        }
        const count = Math.max(
          1,
          Math.min(rows.length - offset, Math.floor((bottom - y - titleHeight - 28) / 36)),
        )
        const bodyHeight = Math.max(image && offset === 0 ? 290 : 100, count * 36 + 28)
        const height = titleHeight + bodyHeight
        box(left, y, width, height, colors.white, true)
        box(left, y, width, titleHeight, colors.pale, true)
        titleLines.forEach((line, i) => write(line, left + 20, y + 17 + i * 36, 26, true))
        write(
          offset
            ? '續頁'
            : evidence?.supersededBy || evidence?.removedAt
              ? '歷程'
              : evidence
                ? '已收件'
                : '待拍攝',
          left + width - 112,
          y + 20,
          21,
          false,
          colors.primary,
        )
        const bodyY = y + titleHeight
        box(left, bodyY, 320, bodyHeight, '#faf9fc', true)
        if (image && offset === 0) {
          const scale = Math.min(
            280 / image.naturalWidth,
            (Math.min(bodyHeight, 370) - 40) / image.naturalHeight,
          )
          const w = image.naturalWidth * scale,
            h = image.naturalHeight * scale
          ctx.drawImage(image, left + (320 - w) / 2, bodyY + 20, w, h)
        } else
          write(
            offset ? '詳細紀錄（續）' : '尚未拍攝照片',
            left + 80,
            bodyY + 40,
            21,
            false,
            colors.muted,
          )
        box(left + 320, bodyY, 144, bodyHeight, '#faf9fc', true)
        rows.slice(offset, offset + count).forEach((row, i) => {
          const top = bodyY + 14 + i * 36
          if (row.start && i > 0) box(left + 320, top - 7, width - 320, 1, colors.line)
          if (row.label) write(row.label, left + 334, top, 20, true, colors.muted)
          write(row.text, left + 482, top, 22)
        })
        y += height + 20
        offset += count
      }
    }
    y += 10
  }
  await save()
  return pdf.save()
}

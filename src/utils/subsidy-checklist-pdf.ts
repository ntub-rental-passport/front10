import { PDFDocument } from 'pdf-lib'

export interface ChecklistItem {
  id: string
  title: string
  help: string
  tag: string
}

/** Render Chinese using the browser's local fonts, without sending data to a service. */
export async function createChecklistPdf(
  items: ChecklistItem[],
  checked: string[],
): Promise<Uint8Array> {
  await document.fonts.ready
  const pdf = await PDFDocument.create()
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法建立 PDF，請換用支援 Canvas 的瀏覽器。')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  let y = 90
  const text = (value: string, size = 25, color = '#25324a') => {
    ctx.font = `${size}px "Microsoft JhengHei", "PingFang TC", sans-serif`
    ctx.fillStyle = color
    let line = ''
    for (const char of value) {
      if (ctx.measureText(line + char).width > 1080) {
        ctx.fillText(line, 80, y)
        y += size * 1.6
        line = ''
      }
      line += char
    }
    ctx.fillText(line, 80, y)
    y += size * 1.6
  }
  text('RentMate｜租補申請準備清單', 38)
  text('自行勾選的準備狀態；實際文件要求以政府網站為準。', 23)
  y += 24
  for (const item of items) {
    text(`• ${checked.includes(item.id) ? '已準備' : '待準備'}｜${item.title}（${item.tag}）`, 28)
    text(item.help, 24, '#627088')
    y += 22
  }
  y += 20
  text('填表前再確認', 30)
  for (const line of [
    '• 租約姓名、租屋地址、租期、月租金與房型，逐項對照原本。',
    '• 聯絡方式、戶籍／通訊地址、家庭成員及撥款帳戶，由本人在官網填寫。',
    '• 身分證、健保卡等證件與照片，僅依官方要求直接提供給政府。',
    '• 房屋稅單、建物謄本等查證資料另行保存；補件以承辦通知為準。',
    '• 在政府網站完成身分驗證、填表、上傳、核對送出，並保留案件編號。',
  ])
    text(line, 24)
  y += 24
  text('RentMate 僅提供清單與教學，不代辦、不查詢或同步政府案件。', 22)
  text('這份清單不包含租約個資、證件照片或帳戶資料。', 22)
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PDF 圖片產生失敗。'))),
      'image/png',
    ),
  )
  const image = await pdf.embedPng(await png.arrayBuffer())
  pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
  return pdf.save()
}

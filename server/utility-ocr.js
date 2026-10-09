import multer from 'multer'
import sharp from 'sharp'

// Only labelled, unambiguous values are auto-filled. Never guess from account numbers.
export function extractUtilityFields(raw, mode) {
  const text = String(raw || '').normalize('NFKC')
  const number = '([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)'
  const labels = mode === 'meter'
    ? '(?:本期(?:電表)?(?:讀數|指數)|本次(?:讀數|指數)|目前讀數|電表讀數)'
    : '(?:本期應繳(?:總)?金額|應繳(?:總)?金額|本期電費|電費總額|總計金額)'
  const candidates = [...text.matchAll(new RegExp(`${labels}\\s*[:：]?\\s*(?:NT\\$|\\$)?\\s*${number}`, 'g'))]
    .map(match => Number(match[1].replaceAll(',', '')))
  if (mode === 'meter' && !candidates.length) {
    // A tightly cropped meter display may contain just one reading followed by kWh.
    const match = text.trim().match(new RegExp(`^${number}\\s*(?:kwh|度)?$`, 'i'))
    if (match) candidates.push(Number(match[1].replaceAll(',', '')))
  }
  const unique = [...new Set(candidates.filter(n => Number.isFinite(n) && n >= 0 && n <= 100_000_000))]
  return unique.length === 1 ? { [mode === 'meter' ? 'current' : 'amount']: unique[0] } : {}
}

export function registerUtilityOcr(app, { requireAuth, imageClient, usageReporter }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 32, parts: 2 } }).single('file')
  const receive = (req, res, next) => upload(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 422).json({ error: '請上傳一張 10MB 以下的照片，並選擇辨識類型。' })
    next()
  })
  app.post('/api/ocr/utility', requireAuth, receive, async (req, res) => {
    if (!req.file || !['meter', 'bill'].includes(req.body.mode))
      return res.status(422).json({ error: '請選擇電表或帳單照片。' })
    let buffer
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 25_000_000 })
      const meta = await image.metadata()
      if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw Error('unsupported')
      buffer = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    } catch {
      return res.status(422).json({ error: '照片格式無法讀取，請使用 JPG、PNG 或 WebP（最多 10MB、2500 萬像素）。' })
    }
    try {
      const [result] = await imageClient.documentTextDetection({ image: { content: buffer }, imageContext: { languageHints: ['zh-TW', 'en'] } }, { timeout: 45000 })
      usageReporter.record(1)
      if (result.error?.code) throw Object.assign(Error('Vision error'), { code: result.error.code })
      const fields = extractUtilityFields(result.fullTextAnnotation?.text, req.body.mode)
      return res.json({ fields, message: Object.keys(fields).length ? '已填入辨識結果，請對照照片確認後保存。' : '未找到明確的讀數或應繳金額，請裁切照片後重試，或手動填寫。' })
    } catch (error) {
      // Do not log images, OCR text, addresses or account numbers.
      return res.status(503).json({ error: Number(error.code) === 8 ? '照片辨識服務額度不足，請先手動填寫，稍後再試。' : '照片辨識暫時無法使用，請手動填寫或稍後重試。' })
    }
  })
}

/**
 * Google Vision 用量回報（後端：backend/admin/ai_usage.py、backend/routers/ai_usage_api.py）。
 *
 * Vision 按頁計費，是這個專案唯一按量計費的 AI 服務。每次 Vision 回應後記下頁數，
 * 2 秒內的彙總成一次回報，帶著服務憑證（用跟 FastAPI 共用的 JWT_SECRET 簽、
 * svc 是 ocr、1 分鐘就過期）送到 POST /api/internal/ai-usage。
 *
 * 回報失敗不能讓使用者的辨識跟著失敗：數字留著，30 秒後再試。OCR 服務重啟時
 * 還沒送出的那幾秒會遺失，那是可以接受的誤差。
 */
import jwt from 'jsonwebtoken'

export function createUsageReporter({
  secret,
  baseUrl,
  fetchImpl = globalThis.fetch,
  batchMs = 2000,
  retryMs = 30_000,
  logger = console,
}) {
  let units = 0
  let calls = 0
  let timer = null

  function schedule(delay) {
    if (!timer) timer = setTimeout(() => void flush(), delay)
  }

  async function flush() {
    timer = null
    if (units === 0 && calls === 0) return
    const report = { provider: 'vision', units, calls }
    units = 0
    calls = 0
    try {
      const token = jwt.sign({ svc: 'ocr' }, secret, { algorithm: 'HS256', expiresIn: 60 })
      const response = await fetchImpl(`${baseUrl}/api/internal/ai-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
        body: JSON.stringify(report),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      units += report.units
      calls += report.calls
      logger.warn(`Vision 用量回報失敗，${retryMs / 1000} 秒後重試：${error.message}`)
      schedule(retryMs)
    }
  }

  /** 一次 Vision 回應用掉幾頁。0 或不合理的數字不記 */
  function record(pages) {
    if (!Number.isInteger(pages) || pages <= 0) return
    units += pages
    calls += 1
    schedule(batchMs)
  }

  return { record, flush }
}

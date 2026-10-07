/** Recheck account/session validity with FastAPI before accepting an OCR request. */
export function createSessionCheck({ baseUrl, fetchImpl = fetch }) {
  return async function checkSession(req, res, next) {
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/auth/me`, {
        headers: { Cookie: `access_token=${req.cookies.access_token}` },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      })
      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({ error: '登入已失效，請重新登入後再使用 OCR。' })
      }
      if (!response.ok) throw new Error('account service unavailable')
      return next()
    } catch {
      return res.status(503).json({ error: '目前無法確認登入狀態，請稍後再試。' })
    }
  }
}

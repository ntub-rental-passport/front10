import { describe, expect, it, vi } from 'vitest'
import { createSessionCheck } from './auth-session.js'

describe('OCR session revocation', () => {
  async function check(status, failure = false) {
    const fetchImpl = failure ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ status, ok: status === 200 })
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()
    await createSessionCheck({ baseUrl: 'http://backend', fetchImpl })({ cookies: { access_token: 'test-cookie' } }, res, next)
    return { fetchImpl, res, next }
  }
  it('checks active session before running OCR', async () => {
    const { fetchImpl, next } = await check(200)
    expect(fetchImpl).toHaveBeenCalledWith('http://backend/api/auth/me', expect.objectContaining({ headers: { Cookie: 'access_token=test-cookie' } }))
    expect(next).toHaveBeenCalledOnce()
  })
  it('rejects a revoked cookie', async () => {
    const { res, next } = await check(401)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
  it('fails closed when the account service cannot respond', async () => {
    const { res, next } = await check(0, true)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(next).not.toHaveBeenCalled()
  })
})

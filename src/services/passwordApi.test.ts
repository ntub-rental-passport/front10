import { afterEach, describe, expect, it, vi } from 'vitest'
import { changePassword, completePasswordReset, startPasswordReset } from './authApi'

afterEach(() => vi.unstubAllGlobals())
describe('password API', () => {
  it('keeps passwords and verification codes in POST bodies', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', request)
    await changePassword('old-test-password', 'new-test-password')
    expect(request).toHaveBeenCalledWith('/api/auth/password/change', expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({ currentPassword: 'old-test-password', newPassword: 'new-test-password' }),
    }))
  })
  it('surfaces delivery errors without showing validation objects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '驗證信寄送失敗，請稍後重新申請。' }), { status: 503 })))
    await expect(startPasswordReset('test@example.com')).rejects.toThrow('驗證信寄送失敗')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ type: 'invalid' }] }), { status: 422 })))
    await expect(completePasswordReset('test', '000000', 'new-test-password')).rejects.toThrow('驗證服務暫時無法使用')
  })
  it('does not report success on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(startPasswordReset('test@example.com')).rejects.toThrow('無法連線到帳號服務')
  })
})

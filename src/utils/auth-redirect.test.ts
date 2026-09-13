import { describe, expect, it } from 'vitest'
import { normalizeAuthRedirect } from './auth-redirect'

describe('normalizeAuthRedirect', () => {
  it('保留合法的站內頁面與查詢參數', () => {
    expect(normalizeAuthRedirect('/app/contract-analysis?tab=rag')).toBe(
      '/app/contract-analysis?tab=rag',
    )
  })

  it('拒絕外部、協定相對與非字串網址', () => {
    expect(normalizeAuthRedirect('https://example.com')).toBeNull()
    expect(normalizeAuthRedirect('//example.com')).toBeNull()
    expect(normalizeAuthRedirect(['/app'])).toBeNull()
  })

  it('拒絕再次導回登入註冊流程', () => {
    expect(normalizeAuthRedirect('/login')).toBeNull()
    expect(normalizeAuthRedirect('/auth/register?role=tenant')).toBeNull()
    expect(normalizeAuthRedirect('/verify-email')).toBeNull()
  })
})

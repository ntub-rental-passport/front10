const AUTH_FLOW_PATHS = new Set([
  '/login',
  '/register',
  '/auth/login',
  '/auth/register',
  '/verify-email',
  '/welcome',
  '/staff-login',
])

/**
 * 只接受站內路徑，避免登入完成後被導向外部網站或再次掉回登入流程。
 */
export function normalizeAuthRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null
  }

  const pathname = value.split(/[?#]/, 1)[0] || '/'
  if (AUTH_FLOW_PATHS.has(pathname)) return null

  return value
}

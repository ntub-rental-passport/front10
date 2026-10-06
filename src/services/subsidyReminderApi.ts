import { getAuthSession } from '@/src/composables/useAuth'
import type { ScheduledNotif } from '@/src/utils/notif-schedule'

const base = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export async function subsidyReminders(
  method = 'GET',
  input?: { applicationDate: string; days: number },
  id?: string,
): Promise<ScheduledNotif[]> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再設定提醒。')
  const response = await fetch(
    `${base}/subsidy/reminders${id ? '/' + encodeURIComponent(id) : ''}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: input ? JSON.stringify(input) : undefined,
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(
      typeof data.detail === 'string' ? data.detail : '無法讀取或儲存提醒，請稍後再試。',
    )
  }
  return method === 'GET' ? response.json() : []
}

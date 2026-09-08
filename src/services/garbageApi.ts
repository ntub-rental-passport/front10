import { getAuthSession } from '@/src/composables/useAuth'
import { parseStops, type TruckPosition } from '@/src/utils/garbage'

const BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export interface GarbageReminder {
  id: string
  stationId: string
  stationName: string
  date: string
  arrival: string
  minutesBefore: number
  notifyPush: boolean
  notifyEmail: boolean
  active: boolean
  emailStatus: string
  pushStatus: string
  dueAt: string
}
export interface ReminderInput {
  stationId: string
  date: string
  minutesBefore: number
  notifyPush: boolean
  notifyEmail: boolean
}
export async function garbageRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthSession()?.accessToken
  const response = await fetch(`${BASE}/garbage${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      typeof body?.detail === 'string' ? body.detail : '清運服務暫時無法連線，請稍後再試。',
    )
  return body as T
}
export async function loadGarbageStops() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/taipei-garbage.csv`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error('清運站點資料載入失敗，請重試。')
  const stops = parseStops(await response.text())
  if (!stops.length) throw new Error('未讀取到有效的臺北市清運站點。')
  return stops
}
export const loadTrucks = () =>
  garbageRequest<{ status: string; message: string; vehicles: TruckPosition[] }>('/vehicles')

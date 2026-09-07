import { getAuthSession } from '@/src/composables/useAuth'

export type PropertyRoomStatus = 'rented' | 'vacant' | 'maintenance'

export interface PropertyRoom {
  id: number
  number: string
  status: PropertyRoomStatus
  tenant: string | null
  rent: number | null
  lease_end: string | null
  floor: number | null
  area: number | null
}

export interface LandlordProperty {
  id: number
  name: string
  address: string
  city: string
  rooms: PropertyRoom[]
}

export interface PropertyPayload {
  name: string
  address?: string
  city?: string
}

export interface RoomBatchPayload {
  numbers: string[]
  floor?: number
  area?: number
  expected_rent?: number
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

async function api<T>(path: string, init: FetchInit = {}): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入憑證不存在，請重新登入房東帳號。')
  const response = await fetch(`${API_BASE}/api/landlord/properties${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  }).catch(() => {
    throw new Error('無法連線房務服務，請確認後端服務是否已啟動。')
  })
  const body = (await response.json().catch(() => null)) as (T & { detail?: string }) | null
  if (!response.ok) throw new Error(body?.detail || '房務操作失敗。')
  if (body === null) throw new Error('後端沒有回傳房務資料。')
  return body
}

export function fetchProperties() {
  return api<{ items: LandlordProperty[] }>('')
}

export function createProperty(payload: PropertyPayload) {
  return api<LandlordProperty>('', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateProperty(id: number, payload: PropertyPayload) {
  return api<LandlordProperty>(`/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function deleteProperty(id: number) {
  return api<{ deleted_id: number; name: string }>(`/${id}`, { method: 'DELETE' })
}

export function createRooms(propertyId: number, payload: RoomBatchPayload) {
  return api<LandlordProperty>(`/${propertyId}/rooms`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

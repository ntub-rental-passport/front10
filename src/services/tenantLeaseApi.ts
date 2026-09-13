import { getAuthSession } from '@/src/composables/useAuth'

export interface TenantLeaseOption {
  leaseId: string
  propertyId: string
  roomId: string
  property: string
  address: string
  room: string
  tenant: string
  phone: string
  startDate: string
  endDate: string
  status: 'pending' | 'active' | 'ended' | 'terminated'
  effective: boolean
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')

export async function fetchTenantLeases(): Promise<TenantLeaseOption[]> {
  const token = getAuthSession()?.accessToken
  if (!token) return []
  const response = await fetch(`${API_BASE}/api/tenant/leases`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('目前無法取得租約資料。')
  const body = (await response.json()) as { items: TenantLeaseOption[] }
  return body.items
}

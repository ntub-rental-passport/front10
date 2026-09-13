import { computed, onMounted, readonly, ref } from 'vue'
import {
  fetchProperties,
  type LandlordProperty,
} from '@/src/services/landlordPropertyApi'
import {
  fetchTenants,
  type LandlordTenant,
} from '@/src/services/landlordTenantApi'

export type LandlordWorkspaceScope =
  | 'property'
  | 'tenant'
  | 'contract'
  | 'finance'
  | 'repair'

export const LANDLORD_WORKSPACE_UPDATED_EVENT = 'rentmate:landlord-workspace-updated'
const STORAGE_KEY = 'rentmate-landlord-workspace-update-v1'

const properties = ref<LandlordProperty[]>([])
const tenants = ref<LandlordTenant[]>([])
const loading = ref(false)
const initialized = ref(false)
const propertyDataReady = ref(false)
const tenantDataReady = ref(false)
const error = ref('')
const lastSyncedAt = ref('')
let activeRequest: Promise<void> | null = null
let listenersReady = false

function allTenantParams(): URLSearchParams {
  return new URLSearchParams({
    quick_filter: 'all',
    status: 'all',
    page: '1',
    page_size: '100',
  })
}

export async function refreshLandlordWorkspace(): Promise<void> {
  if (activeRequest) return activeRequest

  loading.value = true
  error.value = ''
  activeRequest = (async () => {
    const [propertyResult, tenantResult] = await Promise.allSettled([
      fetchProperties(),
      fetchTenants(allTenantParams()),
    ])

    const messages: string[] = []
    if (propertyResult.status === 'fulfilled') {
      properties.value = propertyResult.value.items
      propertyDataReady.value = true
    } else {
      messages.push(propertyResult.reason instanceof Error ? propertyResult.reason.message : '房務資料同步失敗')
    }

    if (tenantResult.status === 'fulfilled') {
      tenants.value = tenantResult.value.items
      tenantDataReady.value = true
    } else {
      messages.push(tenantResult.reason instanceof Error ? tenantResult.reason.message : '租客資料同步失敗')
    }

    error.value = messages.join('；')
    initialized.value = true
    if (messages.length < 2) lastSyncedAt.value = new Date().toISOString()
  })().finally(() => {
    loading.value = false
    activeRequest = null
  })

  return activeRequest
}

export function notifyLandlordWorkspaceUpdated(scope: LandlordWorkspaceScope): void {
  if (typeof window === 'undefined') return
  const detail = { scope, at: new Date().toISOString() }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(detail))
  window.dispatchEvent(new CustomEvent(LANDLORD_WORKSPACE_UPDATED_EVENT, { detail }))
}

function ensureWorkspaceListeners(): void {
  if (typeof window === 'undefined' || listenersReady) return
  listenersReady = true
  window.addEventListener(LANDLORD_WORKSPACE_UPDATED_EVENT, () => {
    void refreshLandlordWorkspace()
  })
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void refreshLandlordWorkspace()
  })
}

export function useLandlordWorkspace() {
  ensureWorkspaceListeners()
  onMounted(() => {
    void refreshLandlordWorkspace()
  })

  const rooms = computed(() => properties.value.flatMap((property) => property.rooms))
  const activeTenants = computed(() =>
    tenants.value.filter((tenant) =>
      ['occupied', 'expiring', 'pending'].includes(tenant.lease_status),
    ),
  )

  return {
    properties: readonly(properties),
    tenants: readonly(tenants),
    rooms,
    activeTenants,
    loading: readonly(loading),
    initialized: readonly(initialized),
    propertyDataReady: readonly(propertyDataReady),
    tenantDataReady: readonly(tenantDataReady),
    error: readonly(error),
    lastSyncedAt: readonly(lastSyncedAt),
    refresh: refreshLandlordWorkspace,
  }
}

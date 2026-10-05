import { computed, onMounted, readonly, ref } from 'vue'
import {
  fetchProperties,
  type LandlordProperty,
} from '@/src/services/landlordPropertyApi'
import {
  fetchTenants,
  type LandlordTenant,
} from '@/src/services/landlordTenantApi'
import { getAuthSession } from '@/src/composables/useAuth'
import {
  LANDLORD_WORKSPACE_CHANGED_EVENT,
  activeWorkspaceOwnerId,
} from '@/src/services/landlordApiClient'

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
// 這份快取屬於哪個帳號的哪個工作區。換帳號或切換工作區時先清空，
// 不讓前一個帳號的租客資料殘留在畫面上（2026-09-24 稽核 A 項）。
let loadedFor = ''

function cacheKey(): string {
  const session = getAuthSession()
  return `${session?.userId ?? session?.email ?? ''}@${activeWorkspaceOwnerId() ?? 'own'}`
}

function resetCache(): void {
  properties.value = []
  tenants.value = []
  propertyDataReady.value = false
  tenantDataReady.value = false
  initialized.value = false
  lastSyncedAt.value = ''
}

function allTenantParams(): URLSearchParams {
  return new URLSearchParams({
    quick_filter: 'all',
    status: 'all',
    page: '1',
    page_size: '500',
  })
}

export async function refreshLandlordWorkspace(): Promise<void> {
  const key = cacheKey()
  if (activeRequest && key === loadedFor) return activeRequest
  if (key !== loadedFor) {
    resetCache()
    loadedFor = key
  }

  loading.value = true
  error.value = ''
  const request = (async () => {
    const [propertyResult, tenantResult] = await Promise.allSettled([
      fetchProperties(),
      fetchTenants(allTenantParams()),
    ])

    // 請求途中換了帳號或工作區：這批結果已經不屬於畫面上的那個人，丟掉
    if (key !== loadedFor) return

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
    if (activeRequest === request) {
      loading.value = false
      activeRequest = null
    }
  })
  activeRequest = request
  return request
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
  window.addEventListener(LANDLORD_WORKSPACE_CHANGED_EVENT, () => {
    void refreshLandlordWorkspace()
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

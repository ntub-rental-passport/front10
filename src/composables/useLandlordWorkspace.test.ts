import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/src/services/landlordPropertyApi', () => ({ fetchProperties: vi.fn() }))
vi.mock('@/src/services/landlordTenantApi', () => ({ fetchTenants: vi.fn() }))
vi.mock('vue', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: vi.fn(),
}))

import { fetchProperties } from '@/src/services/landlordPropertyApi'
import { fetchTenants } from '@/src/services/landlordTenantApi'
import { refreshLandlordWorkspace, useLandlordWorkspace } from './useLandlordWorkspace'

beforeEach(() => vi.resetAllMocks())

it('does not report a quota error when only tenants fail to load', async () => {
  vi.mocked(fetchProperties).mockResolvedValue({ items: [] })
  vi.mocked(fetchTenants).mockRejectedValue(new Error('租客服務暫時不可用'))
  await refreshLandlordWorkspace()
  const workspace = useLandlordWorkspace()
  expect(workspace.propertyDataReady.value).toBe(true)
  expect(workspace.propertyError.value).toBe('')
  expect(workspace.error.value).toBe('租客服務暫時不可用')
})

it('reports the property error and clears it after a successful retry', async () => {
  vi.mocked(fetchProperties).mockRejectedValueOnce(new Error('登入憑證已失效'))
  vi.mocked(fetchTenants).mockRejectedValue(new Error('租客服務暫時不可用'))
  await refreshLandlordWorkspace()
  const workspace = useLandlordWorkspace()
  expect(workspace.propertyError.value).toBe('登入憑證已失效')
  vi.mocked(fetchProperties).mockResolvedValue({ items: [] })
  await refreshLandlordWorkspace()
  expect(workspace.propertyError.value).toBe('')
  expect(workspace.properties.value).toEqual([])
})

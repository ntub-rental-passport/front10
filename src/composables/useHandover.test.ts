import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHandover, type HandoverItem } from './useHandover'
import { inspectionRequest } from '@/src/services/inspectionApi'

vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  onMounted: vi.fn(),
}))
vi.mock('@/src/services/inspectionApi', () => ({ inspectionRequest: vi.fn() }))
vi.mock('@/src/composables/useAuth', () => ({ getAuthSession: () => ({ userId: '1' }) }))

const request = vi.mocked(inspectionRequest)
const item: HandoverItem = {
  id: '10',
  propertyId: '1',
  room: '客廳',
  name: '牆壁',
  category: 'fixture',
  createdAt: '2026-09-24T00:00:00Z',
  evidences: [],
}
const uploaded: HandoverItem = {
  ...item,
  evidences: [
    { id: '20', phase: 'baseline', url: 'data:image/jpeg;base64,abc', capturedAt: item.createdAt },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() })
})

async function loadedStore(items: HandoverItem[] = [item]) {
  request.mockResolvedValueOnce([
    { id: '1', alias: '租約', address: '地址', createdAt: item.createdAt },
  ])
  request.mockResolvedValueOnce(structuredClone(items))
  const store = useHandover()
  await store.reload()
  return store
}

describe('database handover state', () => {
  it('loads persisted evidence and comparison on a new page instance', async () => {
    const saved: HandoverItem = {
      ...uploaded,
      diff: { type: 'unchanged', confidence: 0.8, summary: '相同', computedAt: item.createdAt },
    }
    const store = await loadedStore([saved])
    expect(store.itemsOfCurrentProperty.value).toEqual([saved])
    expect(request).toHaveBeenCalledWith('/items?rental_id=1')
  })

  it('keeps the uploaded photo when VLM fails, then retries without uploading again', async () => {
    const store = await loadedStore()
    request
      .mockResolvedValueOnce(structuredClone(uploaded))
      .mockRejectedValueOnce(new Error('分析失敗'))
    await store.addEvidence('10', 'baseline', { url: 'data:image/jpeg;base64,abc' })
    expect(store.itemsOfCurrentProperty.value[0].evidences[0].id).toBe('20')
    expect(store.error.value).toBe('分析失敗')
    expect(store.busy.value).toBe(false)
    const analyzed = {
      ...uploaded,
      evidences: [{ ...uploaded.evidences[0], vlmResult: { has_defect: false } }],
    }
    request.mockResolvedValueOnce({ item: analyzed })
    await store.retryAnalysis('10', '20')
    expect(store.error.value).toBe('')
    expect(store.itemsOfCurrentProperty.value[0].evidences[0].vlmResult).toEqual({
      has_defect: false,
    })
    expect(request.mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(1)
  })

  it('preserves the previous photo and comparison if replacement upload fails', async () => {
    const saved: HandoverItem = {
      ...uploaded,
      diff: { type: 'unchanged', confidence: 0.8, summary: '相同', computedAt: item.createdAt },
    }
    const store = await loadedStore([saved])
    request.mockRejectedValueOnce(new Error('無法儲存'))
    await store.addEvidence('10', 'baseline', { url: 'new' })
    expect(store.itemsOfCurrentProperty.value[0]).toEqual(saved)
  })

  it('retains successful comparisons if another item fails and reports the failed item', async () => {
    const pair: HandoverItem = {
      ...uploaded,
      evidences: [...uploaded.evidences, { ...uploaded.evidences[0], id: '21', phase: 'checkout' }],
    }
    const store = await loadedStore([pair, { ...pair, id: '11', name: '窗戶' }])
    request
      .mockResolvedValueOnce({
        ...pair,
        diff: {
          type: 'new_damage',
          confidence: 0.8,
          summary: '新增裂縫',
          computedAt: item.createdAt,
        },
      })
      .mockRejectedValueOnce(new Error('分析失敗'))
    await store.runAutoDiff()
    expect(store.itemsOfCurrentProperty.value[0].diff?.type).toBe('new_damage')
    expect(store.itemsOfCurrentProperty.value[1].diff).toBeUndefined()
    expect(store.error.value).toContain('窗戶')
  })

  it('does not create demo properties when the account has no rentals', async () => {
    request.mockResolvedValueOnce([])
    const store = useHandover()
    await store.reload()
    expect(store.properties.value).toEqual([])
    expect(store.currentProperty.value).toBeNull()
    expect(store.itemsOfCurrentProperty.value).toEqual([])
  })
})

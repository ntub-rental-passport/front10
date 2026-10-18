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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.clearAllMocks()
  request.mockReset()
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
  it.each([false, true])('reloads only the selected rental items after upload (analysis fails: %s)', async (fails) => {
    const store = await loadedStore()
    const refreshed = { ...uploaded, checkoutComplete: true }
    request.mockClear()
    request.mockResolvedValueOnce(structuredClone(uploaded))
    if (fails) request.mockRejectedValueOnce(new Error('分析失敗'))
    else request.mockResolvedValueOnce({ item: structuredClone(uploaded) })
    request.mockResolvedValueOnce([refreshed])

    expect(await store.addEvidence('10', 'baseline', { url: 'photo', source: 'file', quality: null })).toBe(true)
    await flushPromises()

    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/items/10/photos/baseline', '/analyze', '/items?rental_id=1',
    ])
    expect(store.itemsOfCurrentProperty.value).toEqual([refreshed])
    expect(store.currentProperty.value?.id).toBe('1')
    expect(store.error.value).toBe(fails ? '分析失敗' : '')
    expect(store.busy.value).toBe(false)
    expect(store.analyzingItemIds.size).toBe(0)
  })

  it.each(['10', '11'])('allows another upload while baseline analysis is pending (second item: %s)', async (secondItemId) => {
    const store = await loadedStore([item, { ...item, id: '11' }])
    const firstUpload = deferred<HandoverItem>()
    const firstAnalysis = deferred<{ item: HandoverItem }>()
    const secondAnalysis = deferred<{ item: HandoverItem }>()
    const secondUploaded: HandoverItem = {
      ...uploaded,
      id: secondItemId,
      evidences: [{ ...uploaded.evidences[0], id: '21' }],
    }
    request.mockClear()
    request.mockReturnValueOnce(firstUpload.promise)
      .mockReturnValueOnce(firstAnalysis.promise)
      .mockResolvedValueOnce(secondUploaded)
      .mockReturnValueOnce(secondAnalysis.promise)
      .mockResolvedValue([secondUploaded])

    const first = store.addEvidence('10', 'baseline', { url: 'first', source: 'file', quality: null })
    expect(store.busy.value).toBe(true)
    firstUpload.resolve(uploaded)
    expect(await first).toBe(true)
    expect(store.busy.value).toBe(false)
    expect(store.itemsOfCurrentProperty.value[0]).toEqual(uploaded)
    expect(store.analyzingItemIds.get('10')).toBe(1)

    expect(await store.addEvidence(secondItemId, 'baseline', { url: 'second', source: 'file', quality: null })).toBe(true)
    expect(store.busy.value).toBe(false)
    expect(request.mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(2)
    expect(request).toHaveBeenCalledWith('/analyze', 'POST', { item_id: Number(secondItemId), record_id: 21 })
    expect(store.analyzingItemIds.get(secondItemId)).toBe(secondItemId === '10' ? 2 : 1)
    expect(request).not.toHaveBeenCalledWith('/items?rental_id=1')

    firstAnalysis.resolve({ item: uploaded })
    await flushPromises()
    expect(store.analyzingItemIds.get(secondItemId)).toBe(1)
    if (secondItemId !== '10') expect(store.analyzingItemIds.has('10')).toBe(false)
    expect(store.busy.value).toBe(false)

    secondAnalysis.resolve({ item: secondUploaded })
    await flushPromises()
    expect(store.analyzingItemIds.size).toBe(0)
    expect(request.mock.calls.filter(([path]) => path === '/items?rental_id=1')).toHaveLength(2)
  })

  it('returns upload success despite another photo failing background analysis', async () => {
    const store = await loadedStore()
    const analysis = deferred<{ item: HandoverItem }>()
    const secondUpload = deferred<HandoverItem>()
    request.mockResolvedValueOnce(uploaded)
      .mockReturnValueOnce(analysis.promise)
      .mockReturnValueOnce(secondUpload.promise)
      .mockResolvedValueOnce([uploaded])
      .mockResolvedValueOnce({ item: uploaded })
      .mockResolvedValueOnce([uploaded])
    expect(await store.addEvidence('10', 'baseline', { url: 'first', source: 'file', quality: null })).toBe(true)

    const second = store.addEvidence('10', 'baseline', { url: 'second', source: 'file', quality: null })
    analysis.reject(new Error('第一張辨識失敗'))
    await flushPromises()
    expect(store.error.value).toBe('第一張辨識失敗')
    expect(store.analyzingItemIds.size).toBe(0)
    expect(store.busy.value).toBe(true)
    expect(request).toHaveBeenCalledWith('/items?rental_id=1')

    secondUpload.resolve(uploaded)
    expect(await second).toBe(true)
    await flushPromises()
    expect(store.busy.value).toBe(false)
  })

  it('reloads the currently selected rental when background analysis completes', async () => {
    const store = await loadedStore()
    const analysis = deferred<{ item: HandoverItem }>()
    request.mockResolvedValueOnce(uploaded).mockReturnValueOnce(analysis.promise)
    await store.addEvidence('10', 'baseline', { url: 'photo', source: 'file', quality: null })
    store.properties.value.push({ id: '2', alias: '另一租約', address: '地址', createdAt: item.createdAt })
    request.mockResolvedValueOnce([])
    await store.selectProperty('2')
    request.mockClear()
    request.mockResolvedValueOnce([])

    analysis.resolve({ item: uploaded })
    await flushPromises()
    expect(request).toHaveBeenCalledExactlyOnceWith('/items?rental_id=2')
    expect(store.currentProperty.value?.id).toBe('2')
    expect(store.itemsOfCurrentProperty.value).toEqual([])
  })

  it.each([false, true])('keeps checkout busy until analysis and reload finish (analysis fails: %s)', async (fails) => {
    const store = await loadedStore()
    const checkout: HandoverItem = {
      ...uploaded,
      evidences: [{ ...uploaded.evidences[0], phase: 'checkout' }],
    }
    const analysis = deferred<{ item: HandoverItem }>()
    const reload = deferred<HandoverItem[]>()
    request.mockClear()
    request.mockResolvedValueOnce(checkout)
      .mockReturnValueOnce(analysis.promise)
      .mockReturnValueOnce(reload.promise)
    let resolved = false
    const upload = store.addEvidence('10', 'checkout', { url: 'photo', source: 'file', quality: null })
      .then((saved) => { resolved = true; return saved })
    await flushPromises()
    expect(store.busy.value).toBe(true)
    expect(resolved).toBe(false)
    expect(store.analyzingItemIds.has('10')).toBe(true)
    expect(request).not.toHaveBeenCalledWith('/items?rental_id=1')

    if (fails) analysis.reject(new Error('分析失敗'))
    else analysis.resolve({ item: checkout })
    await flushPromises()
    expect(store.busy.value).toBe(true)
    expect(resolved).toBe(false)
    expect(request).toHaveBeenCalledWith('/items?rental_id=1')
    reload.resolve([checkout])
    expect(await upload).toBe(true)
    expect(store.busy.value).toBe(false)
    expect(store.error.value).toBe(fails ? '分析失敗' : '')
    expect(store.itemsOfCurrentProperty.value).toEqual([checkout])
  })

  it('appends an angle and analyzes the new record even when the primary photo sorts first', async () => {
    const store = await loadedStore([uploaded])
    const multiple: HandoverItem = { ...uploaded, evidences: [
      { ...uploaded.evidences[0], id: '22', angle: 'front' },
      { ...uploaded.evidences[0], id: '21', angle: 'side' },
    ] }
    request.mockResolvedValueOnce(multiple).mockResolvedValueOnce({ item: multiple }).mockResolvedValueOnce([multiple])
    await store.addEvidence('10', 'baseline', {url:'original-data', source:'file', quality:null, append:true, angle:'front', replacesId:'20', originalName:'photo.png'})
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/items/10/photos/baseline', 'PUT', expect.objectContaining({
      image_data:'original-data', append:true, angle:'front', replaces_id:20, original_name:'photo.png',
    }))
    expect(request).toHaveBeenCalledWith('/analyze', 'POST', {item_id:10,record_id:22})
    expect(store.itemsOfCurrentProperty.value[0].evidences).toHaveLength(2)
  })
  it('sends camera source and measured quality to the API', async () => {
    const store = await loadedStore()
    request.mockResolvedValueOnce(structuredClone(uploaded))
    request.mockResolvedValueOnce({ item: structuredClone(uploaded) })
    request.mockResolvedValueOnce([structuredClone(uploaded)])
    await store.addEvidence('10', 'baseline', {
      url: 'data:image/jpeg;base64,abc', source: 'camera',
      quality: { brightness: 140, sharpness: 88, isLevel: true },
    })
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/items/10/photos/baseline', 'PUT', {
      image_data: 'data:image/jpeg;base64,abc', user_note: '', capture_source: 'camera',
      capture_quality: { brightness: 140, sharpness: 88, is_level: true },
    })
  })

  it('keeps the measured light and sharpness when the level reading is unavailable', async () => {
    // iOS 沒授權 deviceorientation 時拿不到傾角，但亮度與清晰度是本機 canvas 算的。
    // 整組丟掉會讓一張有證據的照片被標成「未取得量測值」。
    const store = await loadedStore()
    request.mockResolvedValueOnce(structuredClone(uploaded))
    request.mockResolvedValueOnce({ status: 'success', vlm_result: {}, item: structuredClone(uploaded) })
    request.mockResolvedValueOnce([structuredClone(uploaded)])
    await store.addEvidence('10', 'baseline', {
      url: 'data:image/jpeg;base64,abc',
      source: 'camera',
      quality: { brightness: 140, sharpness: 88, isLevel: null },
    })
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/items/10/photos/baseline', 'PUT', {
      image_data: 'data:image/jpeg;base64,abc',
      user_note: '',
      capture_source: 'camera',
      capture_quality: { brightness: 140, sharpness: 88, is_level: null },
    })
  })

  it('sends null quality for a file upload', async () => {
    const store = await loadedStore()
    request.mockResolvedValueOnce(structuredClone(uploaded))
    request.mockResolvedValueOnce({ item: structuredClone(uploaded) })
    request.mockResolvedValueOnce([structuredClone(uploaded)])
    await store.addEvidence('10', 'baseline', {
      url: 'data:image/jpeg;base64,abc', source: 'file', quality: null,
    })
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/items/10/photos/baseline', 'PUT', {
      image_data: 'data:image/jpeg;base64,abc', user_note: '', capture_source: 'file',
      capture_quality: null,
    })
  })
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
      .mockResolvedValueOnce([structuredClone(uploaded)])
    await store.addEvidence('10', 'baseline', { url: 'data:image/jpeg;base64,abc', source: 'file', quality: null })
    await flushPromises()
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
    expect(await store.addEvidence('10', 'baseline', { url: 'new', source: 'file', quality: null })).toBe(false)
    expect(store.itemsOfCurrentProperty.value[0]).toEqual(saved)
    expect(store.error.value).toBe('無法儲存')
    expect(store.busy.value).toBe(false)
    expect(store.analyzingItemIds.size).toBe(0)
    expect(request).not.toHaveBeenCalledWith('/analyze', expect.anything(), expect.anything())
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

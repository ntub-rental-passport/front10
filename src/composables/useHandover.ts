import { computed, reactive, ref, onMounted } from 'vue'
import { inspectionRequest } from '@/src/services/inspectionApi'
import { getAuthSession } from '@/src/composables/useAuth'

export type EvidencePhase = 'baseline' | 'checkout'

export interface HandoverProperty {
  id: string
  alias: string
  address: string
  createdAt: string
}

export interface HandoverEvidence {
  id: string
  phase: EvidencePhase
  url: string
  capturedAt: string
  aiLabel?: string
  aiConfidence?: number
  note?: string
  userNote?: string
  vlmResult?: Record<string, unknown> | null
}

export type HandoverDiff = {
  type: 'unchanged' | 'new_damage' | 'missing' | 'degraded' | 'uncertain'
  confidence: number
  summary: string
  computedAt: string
}

export interface HandoverItem {
  id: string
  propertyId: string
  room: string
  name: string
  category: 'appliance' | 'furniture' | 'fixture'
  evidences: HandoverEvidence[]
  diff?: HandoverDiff
  createdAt: string
}

export function useHandover() {
  const store = reactive<{
    properties: HandoverProperty[]
    items: HandoverItem[]
    currentPropertyId: string | null
  }>({
    properties: [],
    items: [],
    currentPropertyId: null,
  })
  const busy = ref(false)
  const analyzingItemId = ref<string | null>(null)
  const error = ref('')
  const selectionKey = `rentmate-inspection-rental-${getAuthSession()?.userId ?? getAuthSession()?.email}`
  const properties = computed(() => store.properties)
  const currentProperty = computed(
    () => store.properties.find((p) => p.id === store.currentPropertyId) ?? null,
  )
  const itemsOfCurrentProperty = computed(() => store.items)

  async function perform<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined
    busy.value = true
    error.value = ''
    try {
      return await operation()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '點交操作失敗，請重試。'
    } finally {
      busy.value = false
    }
  }

  async function loadItems() {
    store.items = store.currentPropertyId
      ? await inspectionRequest<HandoverItem[]>(
          `/items?rental_id=${encodeURIComponent(store.currentPropertyId)}`,
        )
      : []
  }

  async function reload() {
    await perform(async () => {
      store.properties = await inspectionRequest<HandoverProperty[]>('/properties')
      const previous = store.currentPropertyId ?? sessionStorage.getItem(selectionKey)
      store.currentPropertyId =
        store.properties.find((p) => p.id === previous)?.id ?? store.properties[0]?.id ?? null
      store.items = []
      await loadItems()
    })
  }
  onMounted(reload)

  async function selectProperty(id: string) {
    if (!store.properties.some((p) => p.id === id)) return
    await perform(async () => {
      store.currentPropertyId = id
      sessionStorage.setItem(selectionKey, id)
      store.items = []
      await loadItems()
    })
  }

  function replaceItem(item: HandoverItem) {
    const index = store.items.findIndex((entry) => entry.id === item.id)
    if (index !== -1) store.items[index] = item
  }

  async function addItem(payload: {
    room: string
    name: string
    category?: HandoverItem['category']
  }) {
    if (!store.currentPropertyId) return
    return perform(async () => {
      const item = await inspectionRequest<HandoverItem>('/items', 'POST', {
        ...payload,
        rental_id: Number(store.currentPropertyId),
      })
      store.items.push(item)
      return item
    })
  }

  async function removeItem(id: string) {
    await perform(async () => {
      await inspectionRequest(`/items/${id}`, 'DELETE')
      store.items = store.items.filter((item) => item.id !== id)
    })
  }

  async function analyze(itemId: string, recordId: string) {
    analyzingItemId.value = itemId
    try {
      const result = await inspectionRequest<{ item: HandoverItem }>('/analyze', 'POST', {
        item_id: Number(itemId),
        record_id: Number(recordId),
      })
      replaceItem(result.item)
    } finally {
      analyzingItemId.value = null
    }
  }

  async function addEvidence(
    itemId: string,
    phase: EvidencePhase,
    payload: { url: string; note?: string },
  ) {
    await perform(async () => {
      const item = await inspectionRequest<HandoverItem>(
        `/items/${itemId}/photos/${phase}`,
        'PUT',
        {
          image_data: payload.url,
          user_note: payload.note ?? '',
        },
      )
      replaceItem(item)
      const record = item.evidences.find((e) => e.phase === phase)!
      await analyze(itemId, record.id)
    })
  }

  async function retryAnalysis(itemId: string, recordId: string) {
    await perform(() => analyze(itemId, recordId))
  }

  async function removeEvidence(itemId: string, recordId: string) {
    await perform(async () =>
      replaceItem(
        await inspectionRequest<HandoverItem>(`/items/${itemId}/photos/${recordId}`, 'DELETE'),
      ),
    )
  }

  async function runAutoDiff() {
    return perform(async () => {
      const candidates = store.items.filter(
        (item) =>
          item.evidences.some((e) => e.phase === 'baseline') &&
          item.evidences.some((e) => e.phase === 'checkout'),
      )
      const failed: string[] = []
      for (const item of candidates) {
        try {
          replaceItem(await inspectionRequest<HandoverItem>(`/items/${item.id}/compare`, 'POST'))
        } catch (cause) {
          failed.push(
            `${item.room} / ${item.name}：${cause instanceof Error ? cause.message : '比對失敗'}`,
          )
        }
      }
      if (failed.length) throw new Error(failed.join('；'))
      return true
    })
  }

  return {
    properties,
    currentProperty,
    selectProperty,
    itemsOfCurrentProperty,
    addItem,
    removeItem,
    addEvidence,
    removeEvidence,
    retryAnalysis,
    runAutoDiff,
    busy,
    analyzingItemId,
    error,
    reload,
  }
}

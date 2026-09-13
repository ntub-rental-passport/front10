import { computed, reactive, watch } from 'vue'

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
}

export type HandoverDiff = {
  type: 'unchanged' | 'new_damage' | 'missing' | 'degraded'
  confidence: number
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

interface HandoverStore {
  properties: HandoverProperty[]
  items: HandoverItem[]
  currentPropertyId: string | null
}

const STORAGE_KEY = 'rentmate-handover-store'
const SAMPLE_PROPERTY_ALIAS = '示範租屋處'
const SAMPLE_PROPERTY_ADDRESS = '台北市中正區示範路 100 號 5 樓'
const DEFAULT_ITEM_PRESETS: Array<{
  room: string
  name: string
  category: HandoverItem['category']
}> = [
  { room: '客廳', name: '冷氣', category: 'appliance' },
  { room: '臥室', name: '床架', category: 'furniture' },
  { room: '浴室', name: '熱水器', category: 'appliance' },
]

function createEmptyStore(): HandoverStore {
  return {
    properties: [],
    items: [],
    currentPropertyId: null,
  }
}

function createTimestamp(): string {
  return new Date().toISOString()
}

function createPropertyId() {
  return `prop-${Date.now()}`
}

function createItemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEvidenceId() {
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function normalizeStore(payload: Partial<HandoverStore> | null | undefined): HandoverStore {
  return {
    properties: payload?.properties ?? [],
    items: payload?.items ?? [],
    currentPropertyId: payload?.currentPropertyId ?? null,
  }
}

function loadStore(): HandoverStore {
  if (!canUseStorage()) return createEmptyStore()

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return createEmptyStore()

  try {
    return normalizeStore(JSON.parse(raw) as HandoverStore)
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return createEmptyStore()
  }
}

function saveStore(store: HandoverStore) {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function createSeedData(): Pick<HandoverStore, 'properties' | 'items' | 'currentPropertyId'> {
  const createdAt = createTimestamp()
  const propertyId = createPropertyId()
  const sampleProperty: HandoverProperty = {
    id: propertyId,
    alias: SAMPLE_PROPERTY_ALIAS,
    address: SAMPLE_PROPERTY_ADDRESS,
    createdAt,
  }

  const items = DEFAULT_ITEM_PRESETS.map((preset) => ({
    id: createItemId(),
    propertyId,
    room: preset.room,
    name: preset.name,
    category: preset.category,
    evidences: [],
    createdAt: createTimestamp(),
  }))

  return {
    properties: [sampleProperty],
    items,
    currentPropertyId: propertyId,
  }
}

function ensureSeedData(store: HandoverStore) {
  if (store.properties.length > 0) return

  const seedData = createSeedData()
  store.properties = seedData.properties
  store.items = seedData.items
  store.currentPropertyId = seedData.currentPropertyId
}

const store = reactive<HandoverStore>(loadStore())
ensureSeedData(store)

watch(
  store,
  (newStore) => {
    saveStore(newStore)
  },
  { deep: true }
)

export function useHandover() {
  const properties = computed(() => store.properties)

  const currentProperty = computed(
    () => store.properties.find((property) => property.id === store.currentPropertyId) ?? null
  )

  const itemsOfCurrentProperty = computed(() =>
    store.items.filter((item) => item.propertyId === store.currentPropertyId)
  )

  function selectProperty(id: string) {
    if (store.properties.some((property) => property.id === id)) {
      store.currentPropertyId = id
    }
  }

  function addProperty(alias: string, address: string): HandoverProperty {
    const property: HandoverProperty = {
      id: createPropertyId(),
      alias,
      address,
      createdAt: createTimestamp(),
    }

    store.properties.push(property)
    store.currentPropertyId = property.id
    return property
  }

  function removeProperty(id: string) {
    store.properties = store.properties.filter((property) => property.id !== id)
    store.items = store.items.filter((item) => item.propertyId !== id)

    if (store.currentPropertyId === id) {
      store.currentPropertyId = store.properties[0]?.id ?? null
    }
  }

  function addItem(payload: {
    room: string
    name: string
    category?: HandoverItem['category']
  }): HandoverItem | null {
    if (!store.currentPropertyId) return null

    const item: HandoverItem = {
      id: createItemId(),
      propertyId: store.currentPropertyId,
      room: payload.room,
      name: payload.name,
      category: payload.category ?? 'furniture',
      evidences: [],
      createdAt: createTimestamp(),
    }

    store.items.push(item)
    return item
  }

  function removeItem(itemId: string) {
    store.items = store.items.filter((item) => item.id !== itemId)
  }

  function addEvidence(
    itemId: string,
    phase: EvidencePhase,
    payload: { url: string; aiLabel?: string; aiConfidence?: number; note?: string }
  ): HandoverEvidence | null {
    const item = store.items.find((entry) => entry.id === itemId)
    if (!item) return null

    const evidence: HandoverEvidence = {
      id: createEvidenceId(),
      phase,
      url: payload.url,
      capturedAt: createTimestamp(),
      aiLabel: payload.aiLabel,
      aiConfidence: payload.aiConfidence,
      note: payload.note,
    }

    item.evidences.push(evidence)
    item.diff = undefined
    return evidence
  }

  function removeEvidence(itemId: string, evidenceId: string) {
    const item = store.items.find((entry) => entry.id === itemId)
    if (!item) return

    item.evidences = item.evidences.filter((evidence) => evidence.id !== evidenceId)
    item.diff = undefined
  }

  function runAutoDiff() {
    itemsOfCurrentProperty.value.forEach((item) => {
      const hasBaseline = item.evidences.some((evidence) => evidence.phase === 'baseline')
      const hasCheckout = item.evidences.some((evidence) => evidence.phase === 'checkout')

      if (!hasBaseline || !hasCheckout) return

      const random = Math.random()
      const type: HandoverDiff['type'] =
        random > 0.7 ? 'new_damage' : random > 0.4 ? 'unchanged' : 'degraded'

      item.diff = {
        type,
        confidence: 0.82 + Math.random() * 0.15,
        computedAt: createTimestamp(),
      }
    })
  }

  return {
    properties,
    currentProperty,
    selectProperty,
    addProperty,
    removeProperty,
    itemsOfCurrentProperty,
    addItem,
    removeItem,
    addEvidence,
    removeEvidence,
    runAutoDiff,
  }
}

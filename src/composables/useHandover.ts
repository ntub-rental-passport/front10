/**
 * useHandover.ts
 * ---------------------------------------------------------
 * 點交存證資料管理 composable。
 *
 * 設計重點：
 *   1. 一個使用者可以有多個「租屋處（property）」，每個租屋處
 *      底下有自己獨立的點交項目清單。
 *   2. 每個點交項目（item）底下記錄搬入（baseline）與退租
 *      （checkout）兩種階段的存證照片。
 *   3. 重新進入頁面時要看得到先前上傳過的紀錄，所以全部寫入
 *      localStorage（鍵名 `rentmate-handover-store`），模仿
 *      useAuth.ts 的寫法。實際整合後端時，只要把每個 setter
 *      改成呼叫 FastAPI 對應的 endpoint 即可。
 */

import { computed, reactive, watch } from 'vue'

// ---------------- 型別 ---------------- //

export type EvidencePhase = 'baseline' | 'checkout'

export interface HandoverProperty {
  /** 唯一 ID（mock 環境用 timestamp，串後端後改為資料庫 PK） */
  id: string
  /** 使用者自取的暱稱，例如「中山區套房」 */
  alias: string
  /** 完整地址 */
  address: string
  createdAt: string
}

export interface HandoverEvidence {
  id: string
  phase: EvidencePhase
  /** 圖片來源：可能是 dataURL（前端剛拍）或後端回傳的 URL */
  url: string
  /** 拍攝時間（ISO 8601） */
  capturedAt: string
  /** Teachable Machine 分類器標籤，未啟用 AI 時為 undefined */
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
  /** 使用者目前選擇的租屋處 */
  currentPropertyId: string | null
}

// ---------------- 持久化工具 ---------------- //

const STORAGE_KEY = 'rentmate-handover-store'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function loadStore(): HandoverStore {
  if (!canUseStorage()) {
    return { properties: [], items: [], currentPropertyId: null }
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return { properties: [], items: [], currentPropertyId: null }
  try {
    const parsed = JSON.parse(raw) as HandoverStore
    return {
      properties: parsed.properties ?? [],
      items: parsed.items ?? [],
      currentPropertyId: parsed.currentPropertyId ?? null,
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return { properties: [], items: [], currentPropertyId: null }
  }
}

function saveStore(store: HandoverStore) {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

// ---------------- 單例 reactive store ---------------- //
// 用 reactive + watch 讓任何修改都自動持久化。整個 app 共用同一份。

const store = reactive<HandoverStore>(loadStore())

watch(
  store,
  (newVal) => {
    saveStore(newVal)
  },
  { deep: true }
)

// 第一次啟動如果沒有任何租屋處，自動建立一筆範例資料，方便展示。
if (store.properties.length === 0) {
  const sampleProperty: HandoverProperty = {
    id: `prop-${Date.now()}`,
    alias: '中山區套房',
    address: '台北市中山區中山北路二段 100 號 5 樓',
    createdAt: new Date().toISOString(),
  }
  store.properties.push(sampleProperty)
  store.currentPropertyId = sampleProperty.id

  // 預先帶幾個常見家具，免得使用者打開後是空白頁
  const presets: Array<{ room: string; name: string; category: HandoverItem['category'] }> = [
    { room: '客廳', name: '冷氣機', category: 'appliance' },
    { room: '主臥室', name: '雙人床墊', category: 'furniture' },
    { room: '陽台', name: '洗衣機', category: 'appliance' },
  ]
  presets.forEach((p, i) => {
    store.items.push({
      id: `item-${Date.now()}-${i}`,
      propertyId: sampleProperty.id,
      room: p.room,
      name: p.name,
      category: p.category,
      evidences: [],
      createdAt: new Date().toISOString(),
    })
  })
}

// ---------------- 對外 API ---------------- //

export function useHandover() {
  // -- 租屋處（property）-- //

  const properties = computed(() => store.properties)

  const currentProperty = computed(() =>
    store.properties.find((p) => p.id === store.currentPropertyId) ?? null
  )

  function selectProperty(id: string) {
    if (store.properties.some((p) => p.id === id)) {
      store.currentPropertyId = id
    }
  }

  function addProperty(alias: string, address: string): HandoverProperty {
    const p: HandoverProperty = {
      id: `prop-${Date.now()}`,
      alias,
      address,
      createdAt: new Date().toISOString(),
    }
    store.properties.push(p)
    // 新增完自動切到新建的那個
    store.currentPropertyId = p.id
    return p
  }

  function removeProperty(id: string) {
    store.properties = store.properties.filter((p) => p.id !== id)
    // 連同該租屋處底下的所有項目一併移除
    store.items = store.items.filter((it) => it.propertyId !== id)
    // 若目前選的就是被刪掉那個，自動切到第一個或 null
    if (store.currentPropertyId === id) {
      store.currentPropertyId = store.properties[0]?.id ?? null
    }
  }

  // -- 點交項目（item）-- //

  /** 取出目前租屋處底下的所有點交項目 */
  const itemsOfCurrentProperty = computed(() =>
    store.items.filter((it) => it.propertyId === store.currentPropertyId)
  )

  function addItem(payload: { room: string; name: string; category?: HandoverItem['category'] }) {
    if (!store.currentPropertyId) return null
    const item: HandoverItem = {
      id: `item-${Date.now()}`,
      propertyId: store.currentPropertyId,
      room: payload.room,
      name: payload.name,
      category: payload.category ?? 'furniture',
      evidences: [],
      createdAt: new Date().toISOString(),
    }
    store.items.push(item)
    return item
  }

  function removeItem(itemId: string) {
    store.items = store.items.filter((it) => it.id !== itemId)
  }

  // -- 存證照片（evidence）-- //

  /**
   * 新增一張存證照片到指定的 item / phase。
   * 在 mock 階段 url 通常是 dataURL；正式串接後端時，這個函式應該
   * 改寫成呼叫 POST /handover/evidences 並使用後端回傳的 URL。
   */
  function addEvidence(
    itemId: string,
    phase: EvidencePhase,
    payload: { url: string; aiLabel?: string; aiConfidence?: number; note?: string }
  ): HandoverEvidence | null {
    const item = store.items.find((it) => it.id === itemId)
    if (!item) return null
    const ev: HandoverEvidence = {
      id: `ev-${Date.now()}`,
      phase,
      url: payload.url,
      capturedAt: new Date().toISOString(),
      aiLabel: payload.aiLabel,
      aiConfidence: payload.aiConfidence,
      note: payload.note,
    }
    item.evidences.push(ev)
    // 一旦兩端的照片有更動，舊的 diff 就失效，要重跑
    item.diff = undefined
    return ev
  }

  function removeEvidence(itemId: string, evidenceId: string) {
    const item = store.items.find((it) => it.id === itemId)
    if (!item) return
    item.evidences = item.evidences.filter((e) => e.id !== evidenceId)
    item.diff = undefined
  }

  // -- 差異比對 -- //
  // mock 版：依機率回傳結果。實際串接後端時，這個 function 應該
  // 改成呼叫 POST /handover/diffs/auto，由後端再跑一次 TM 模型決定。
  function runAutoDiff() {
    itemsOfCurrentProperty.value.forEach((it) => {
      const hasBaseline = it.evidences.some((e) => e.phase === 'baseline')
      const hasCheckout = it.evidences.some((e) => e.phase === 'checkout')
      if (hasBaseline && hasCheckout) {
        const r = Math.random()
        const type: HandoverDiff['type'] =
          r > 0.7 ? 'new_damage' : r > 0.4 ? 'unchanged' : 'degraded'
        it.diff = {
          type,
          confidence: 0.82 + Math.random() * 0.15,
          computedAt: new Date().toISOString(),
        }
      }
    })
  }

  return {
    // properties
    properties,
    currentProperty,
    selectProperty,
    addProperty,
    removeProperty,
    // items
    itemsOfCurrentProperty,
    addItem,
    removeItem,
    // evidences
    addEvidence,
    removeEvidence,
    // diff
    runAutoDiff,
  }
}

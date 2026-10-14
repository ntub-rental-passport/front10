import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, isReactive, nextTick, ssrContextKey } from 'vue'
import GarbagePage from './index.vue'
import type { GarbageCity, GarbageStop, Point } from '@/src/utils/garbage'

const api = vi.hoisted(() => ({
  loadGarbageStops: vi.fn(),
  loadTrucks: vi.fn(),
  garbageRequest: vi.fn(),
}))
vi.mock('@/src/services/garbageApi', () => api)
vi.mock('@/src/composables/useAuth', () => ({ getAuthSession: () => null }))
vi.mock('@/src/components/garbage/GarbageMap.vue', () => ({ default: {} }))

interface PageState {
  city: GarbageCity
  stops: GarbageStop[]
  district: string
  village: string
  queryDate: string
  location: Point | null
  tab: string
  selected: GarbageStop | null
  weeklyStop: GarbageStop | null
  stopGroups: Map<string, GarbageStop[]>
  villages: string[]
  roads: string[]
  filtered: GarbageStop[]
  nearbyStops: GarbageStop[]
  results: GarbageStop[]
  visible: GarbageStop[]
  cityFavoriteCount: number
  reminderOptions: GarbageStop[]
  schedulesAt: (stop: GarbageStop) => GarbageStop[]
}

function stop(id: string, city: GarbageCity, district: string, village: string): GarbageStop {
  return {
    id,
    city,
    district,
    village,
    road: `${village}路`,
    address: `${village}路${id}號`,
    team: '',
    plate: '',
    route: '測試路線',
    trip: '',
    arrival: '18:00',
    departure: '18:10',
    lat: 25.05,
    lng: 121.5,
    collections: {
      garbage: { arrival: '18:00', departure: '18:10', days: [0, 1, 2, 3, 4, 5, 6] },
    },
  }
}
const taipei = [stop('tp-1', '臺北市', '中正區', '臺北里')]
const newTaipei = [
  stop('nt-1', '新北市', '板橋區', '甲里'),
  stop('nt-2', '新北市', '板橋區', '乙里'),
  stop('nt-3', '新北市', '三重區', '丙里'),
]

const unmounts: (() => void)[] = []
function mountPage() {
  interface Node {
    text: string
    children: Node[]
  }
  const node = (): Node => ({ text: '', children: [] })
  const renderer = createRenderer<Node, Node>({
    createElement: node,
    createText: node,
    createComment: node,
    insert: (child, parent) => { parent.children.push(child) },
    remove: () => {},
    setText: (target, text) => { target.text = text },
    setElementText: (target, text) => { target.text = text },
    patchProp: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let state!: PageState
  // 執行頁面的真正 setup 與 computed；最小渲染器驗證更新排程，免依賴 DOM 或 WebGL。
  const render = vi.fn(() => h('div', state.visible.map((s) => s.address).join('、')))
  const app = renderer.createApp({ ...GarbagePage, render })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mixin({
    created() {
      state = (this.$ as unknown as { setupState: PageState }).setupState
    },
  })
  const root = node()
  app.mount(root)
  unmounts.push(() => app.unmount())
  return { state, render, text: () => root.children[0]!.text }
}

async function flushLoad() {
  // loadData 包含載入站點、metadata 與 JSON 的非同步步驟，最後再等待 Vue 渲染。
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-14T12:00:00+08:00'))
  api.loadGarbageStops.mockResolvedValue(taipei)
  api.loadTrucks.mockResolvedValue({ vehicles: [] })
  api.garbageRequest.mockResolvedValue({ email: false, push: false, publicKey: '' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  vi.stubGlobal('localStorage', { getItem: () => '[]', setItem: vi.fn() })
})
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('垃圾清運站點整包替換的響應式更新', () => {
  it('換城市載入後重新求值，並排程渲染新的站點', async () => {
    const page = mountPage()
    await flushLoad()
    const { state } = page
    const previous = [state.stopGroups, state.villages, state.roads, state.filtered]
    expect(state.filtered).toEqual(taipei)
    expect(page.text()).toBe(taipei[0]!.address)

    api.loadGarbageStops.mockResolvedValueOnce(newTaipei)
    page.render.mockClear()
    state.city = '新北市'
    await flushLoad()

    expect(api.loadGarbageStops).toHaveBeenLastCalledWith('新北市')
    expect(state.stops).toBe(newTaipei)
    expect(isReactive(state.stops)).toBe(false)
    expect(isReactive(state.stops[0])).toBe(false)
    expect([...state.stopGroups.values()].flat()).toEqual(newTaipei)
    expect(state.villages).toEqual(['丙里', '乙里', '甲里'])
    expect(state.roads).toEqual(['丙里路', '乙里路', '甲里路'])
    expect(state.filtered).toEqual(newTaipei)
    ;[state.stopGroups, state.villages, state.roads, state.filtered].forEach((value, i) => {
      expect(value).not.toBe(previous[i])
    })
    expect(state.results).toEqual(newTaipei)
    expect(state.reminderOptions).toEqual(newTaipei)
    expect(page.render).toHaveBeenCalled()
    expect(page.text()).toBe(newTaipei.map((s) => s.address).join('、'))
  })

  it('清空已求值的站點後，群組、選項、附近結果與畫面同步清空', async () => {
    const page = mountPage()
    await flushLoad()
    const { state } = page
    state.stops = newTaipei
    state.location = { lat: 25.05, lng: 121.5 }
    state.tab = 'nearby'
    await nextTick()
    expect(state.stopGroups.size).toBe(3)
    expect(state.villages).toHaveLength(3)
    expect(state.roads).toHaveLength(3)
    expect(state.filtered).toHaveLength(3)
    expect(state.nearbyStops).toHaveLength(3)
    expect(state.reminderOptions).toHaveLength(3)
    expect(page.text()).not.toBe('')
    page.render.mockClear()

    state.stops = []
    await nextTick()

    expect(state.stopGroups.size).toBe(0)
    expect(state.villages).toEqual([])
    expect(state.roads).toEqual([])
    expect(state.filtered).toEqual([])
    expect(state.nearbyStops).toEqual([])
    expect(state.results).toEqual([])
    expect(state.visible).toEqual([])
    expect(state.reminderOptions).toEqual([])
    expect(state.cityFavoriteCount).toBe(0)
    expect(page.render).toHaveBeenCalled()
    expect(page.text()).toBe('')
  })

  it('不替換站點也會隨行政區與里別重新篩選，清除條件可恢復結果', async () => {
    const page = mountPage()
    await flushLoad()
    const { state } = page
    state.stops = newTaipei
    expect(state.filtered).toHaveLength(3)

    state.district = '板橋區'
    await nextTick()
    expect(state.filtered).toEqual(newTaipei.slice(0, 2))
    expect(state.villages).toEqual(['乙里', '甲里'])
    expect(state.roads).toEqual(['乙里路', '甲里路'])

    state.village = '甲里'
    await nextTick()
    expect(state.filtered).toEqual([newTaipei[0]])
    expect(state.roads).toEqual(['甲里路'])
    expect(page.text()).toBe(newTaipei[0]!.address)

    state.village = ''
    await nextTick()
    expect(state.filtered).toEqual(newTaipei.slice(0, 2))
    state.district = '三重區'
    await nextTick()
    expect(state.filtered).toEqual([newTaipei[2]])
    state.district = ''
    await nextTick()
    expect(state.filtered).toEqual(newTaipei)
    expect(state.stops).toBe(newTaipei)
    expect(page.text()).toBe(newTaipei.map((s) => s.address).join('、'))
  })

  it('單筆站點放入 selected 或 weeklyStop 的 ref 後仍能取得全部同址班表', async () => {
    const { state } = mountPage()
    await flushLoad()
    const first = newTaipei[0]!
    const later = { ...first, id: 'nt-later', arrival: '20:00', departure: '20:10' }
    state.stops = [first, later]
    state.selected = first
    state.weeklyStop = first

    expect(state.selected).not.toBe(first)
    expect(state.weeklyStop).not.toBe(first)
    expect(state.schedulesAt(state.selected!)).toEqual([first, later])
    expect(state.schedulesAt(state.weeklyStop!)).toEqual([first, later])

    state.city = '新北市'
    await flushLoad()
    expect(state.selected).toBeNull()
    expect(state.weeklyStop).toBeNull()
  })
})

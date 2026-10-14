import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { computed, ref, shallowRef, version, type Ref } from 'vue'
import { overlaps, parseNewTaipeiStops, type GarbageStop } from '../src/utils/garbage'
import { operatesOn } from '../src/utils/garbage-countdown'
import type { StatusFilter } from '../src/utils/garbage-status'

// 使用正式版 Vue，避免開發模式的額外檢查影響是否超過 50 ms 的判斷。
// NODE_ENV=production node --expose-gc --import tsx scripts/benchmark-garbage-reactivity.ts
assert.equal(process.env.NODE_ENV, 'production', 'Run with NODE_ENV=production')
assert.ok(globalThis.gc, 'Run node with --expose-gc')

const compact = JSON.parse(
  readFileSync(new URL('../public/data/new-taipei-garbage.json', import.meta.url), 'utf8'),
)
const warmups = 5
const runs = 20
const queryDay = '2026-10-14'

// 保留頁面的運算式與預設篩選條件，避免為量測而改動正式程式。
// 頁面若調整這四個 computed，這裡也須同步更新。
function createComputeds(stops: Ref<GarbageStop[]>) {
  const district = ref(''),
    village = ref(''),
    road = ref(''),
    timeStart = ref(''),
    timeEnd = ref('')
  // 固定日期，讓不同日期重跑時仍執行相同的每週班表判斷。
  const queryDate = ref(queryDay)
  const statusFilter = ref<StatusFilter>('all')
  function physicalKey(stop: GarbageStop) {
    return [
      stop.city,
      stop.district,
      stop.address.trim(),
      ...(stop.city === '新北市' ? [stop.lat, stop.lng] : []),
    ].join('|')
  }
  const stopGroups = computed(() => {
    const groups = new globalThis.Map<string, GarbageStop[]>()
    for (const stop of stops.value) {
      const key = physicalKey(stop)
      const group = groups.get(key) || []
      group.push(stop)
      groups.set(key, group)
    }
    return groups
  })
  const villages = computed(() =>
    [
      ...new Set(
        stops.value
          .filter((s) => !district.value || s.district === district.value)
          .map((s) => s.village),
      ),
    ].sort(),
  )
  const roads = computed(() =>
    [
      ...new Set(
        stops.value
          .filter(
            (s) =>
              (!district.value || s.district === district.value) &&
              (!village.value || s.village === village.value),
          )
          .map((s) => s.road),
      ),
    ].sort(),
  )
  const normalized = (s: string) => s.trim().replaceAll('台', '臺')
  const filtered = computed(() =>
    stops.value.filter(
      (s) =>
        (!district.value || s.district === district.value) &&
        (!village.value || s.village === village.value) &&
        (!road.value || normalized(s.address).includes(normalized(road.value))) &&
        overlaps(s, timeStart.value, timeEnd.value) &&
        (statusFilter.value !== 'all' || operatesOn(s, queryDate.value)),
    ),
  )
  return { stopGroups, villages, roads, filtered }
}

function sample(shallow: boolean) {
  // 每次重新解析，避免 Vue 的 WeakMap 重用前一次的站點 proxy；解析不列入計時。
  const loaded = parseNewTaipeiStops(compact)
  assert.equal(loaded.length, 26655)
  globalThis.gc!()
  const stops = shallow ? shallowRef(loaded) : ref(loaded)
  const chain = createComputeds(stops)
  const start = performance.now()
  const stopGroups = chain.stopGroups.value
  const villages = chain.villages.value
  const roads = chain.roads.value
  const filtered = chain.filtered.value
  const milliseconds = performance.now() - start
  // 在計時外比對實際輸出，確保兩組都有求值且結果相同。
  return {
    milliseconds,
    output: {
      groups: [...stopGroups].map(([key, group]) => [key, group.map((s) => s.id)]),
      villages,
      roads,
      filtered: filtered.map((s) => s.id),
    },
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

const a: number[] = []
const b: number[] = []
for (let i = 0; i < warmups + runs; i++) {
  // 交替先後順序，降低 JIT、溫度與執行順序對單一組別的偏差。
  const first = sample(i % 2 !== 0)
  const second = sample(i % 2 === 0)
  const [deep, shallow] = i % 2 === 0 ? [first, second] : [second, first]
  assert.deepEqual(deep.output, shallow.output)
  if (i < warmups) continue
  a.push(deep.milliseconds)
  b.push(shallow.milliseconds)
}

const aMedian = median(a)
const bMedian = median(b)
const difference = aMedian - bMedian
console.log(JSON.stringify({
  node: process.version,
  vue: version,
  platform: `${process.platform}/${process.arch}`,
  cpu: cpus()[0]?.model,
  rows: 26655,
  queryDate: queryDay,
  warmupsPerVariant: warmups,
  runsPerVariant: runs,
  timed: 'First .value reads of stopGroups, villages, roads, filtered; parsing and GC excluded',
  a: { kind: 'ref', medianMs: aMedian, samplesMs: a },
  b: { kind: 'shallowRef', medianMs: bMedian, samplesMs: b },
  differenceMs: difference,
  decision: difference >= 50 ? 'Use shallowRef' : 'Keep ref; investigate rendering and map updates',
}, null, 2))

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NEW_TAIPEI_DISTRICTS, parseNewTaipeiStops, validPoint, type NewTaipeiRow } from './garbage'
import { encodeNewTaipeiRows, type CompactNewTaipeiData } from './new-taipei-codec'
import { collectionSchedules, nextCollection, operatesOn } from './garbage-countdown'
import { groupRoutes } from './garbage-routes'
import { stopStatus } from './garbage-status'
import { fetchNewTaipeiRows, validateNewTaipeiRows } from '../../scripts/update-new-taipei-garbage'
import { parseLegacyNewTaipeiStops } from '../../scripts/lib/new-taipei-legacy'
import { loadGarbageStops } from '../services/garbageApi'

const compact: CompactNewTaipeiData = JSON.parse(
  readFileSync(new URL('../../public/data/new-taipei-garbage.json', import.meta.url), 'utf8'),
)
const stops = parseNewTaipeiStops(compact)
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
// 排程更新不會攜帶舊快照；一般測試獨立展開查表，遷移驗證另讀 repo 外的原始備份。
const rows: NewTaipeiRow[] = compact.rows.map((row) => {
  const [
    city,
    lineid,
    linename,
    rank,
    name,
    village,
    longitude,
    latitude,
    time,
    garbage,
    recycling,
    foodscraps,
    identity,
  ] = row
  const [sourceRank, sourceLat, sourceLng] =
    identity === -1
      ? [String(rank), String(latitude), String(longitude)]
      : compact.pools.identity[identity]!.split('|')
  const result: NewTaipeiRow = {
    city: compact.pools.city[city]!,
    lineid: compact.pools.lineid[lineid]!,
    linename: compact.pools.linename[linename]!,
    rank: sourceRank!,
    name,
    village: compact.pools.village[village]!,
    longitude: sourceLng!,
    latitude: sourceLat!,
    time: compact.pools.time[time]!,
    memo: '',
  }
  for (const [prefix, mask] of [
    ['garbage', garbage],
    ['recycling', recycling],
    ['foodscraps', foodscraps],
  ] as const)
    dayNames.forEach((day, index) => {
      result[prefix + day] = mask & (1 << index) ? 'Y' : ''
    })
  return result
})
afterEach(() => vi.unstubAllGlobals())
describe('New Taipei collection data', () => {
  it('matches the independent legacy parser for every snapshot field', () => {
    expect(stops).toHaveLength(rows.length)
    expect(stops).toEqual(parseLegacyNewTaipeiStops(rows))
    expect(parseNewTaipeiStops(encodeNewTaipeiRows(rows))).toEqual(stops)
  })
  it.runIf(Boolean(process.env.NEW_TAIPEI_LEGACY_DATA))(
    'preserves all 26,655 original snapshot stops field for field',
    () => {
      const original: NewTaipeiRow[] = JSON.parse(
        readFileSync(process.env.NEW_TAIPEI_LEGACY_DATA!, 'utf8'),
      )
      const legacy = parseLegacyNewTaipeiStops(original)
      const encoded = parseNewTaipeiStops(encodeNewTaipeiRows(original))
      expect(original).toHaveLength(26655)
      expect(legacy).toHaveLength(26655)
      expect(encoded).toHaveLength(26655)
      expect(stops).toHaveLength(26655)
      expect(encoded).toEqual(legacy)
      expect(stops).toEqual(legacy)
    },
  )
  it('marks Fude 18 estimated interval active through 20:36 and ended at 20:37', () => {
    const stop = stops.find(
      (s) => s.district === '汐止區' && s.address.endsWith('福德二路18號') && s.arrival === '20:26',
    )!
    expect(stop).toBeDefined()
    expect(stop.departureEstimated).toBe(true)
    expect(stop.departure).toBe('20:36')
    for (const time of ['20:26:00', '20:30:00', '20:36:59'])
      expect(stopStatus(stop, Date.parse(`2026-09-10T${time}+08:00`)).state).toBe('active')
    expect(stopStatus(stop, Date.parse('2026-09-10T20:37:00+08:00')).state).toBe('ended')
    expect(stopStatus(stop, Date.parse('2026-09-10T20:30:00+08:00')).label).toContain('約')
  })
  it('keeps Thursday timetable but advances the next run only after 18:27 at Kangning 474', () => {
    const station = stops.filter(
      (s) => s.district === '汐止區' && s.address.endsWith('康寧街474巷內'),
    )
    expect(station.length).toBeGreaterThan(0)
    const schedules = collectionSchedules(station, 'garbage')
    expect(schedules.some((s) => s.days.includes(4) && s.arrival === '18:27')).toBe(true)
    const before = new Date('2026-09-10T18:00:00+08:00')
    const upcoming = nextCollection(schedules, before)!
    expect(upcoming.serviceDate).toBe('2026-09-10')
    expect((upcoming.arrivalAt - before.getTime()) / 60000).toBe(27)
    const after = new Date('2026-09-10T19:59:00+08:00')
    const tomorrow = nextCollection(schedules, after)!
    expect(tomorrow.serviceDate).toBe('2026-09-11')
    expect((tomorrow.arrivalAt - after.getTime()) / 60000).toBe(22 * 60 + 28)
  })
  it('loads all 29 districts with unique city-prefixed IDs and usable coordinates', () => {
    expect([...new Set(stops.map((s) => s.district))].sort()).toEqual(
      [...NEW_TAIPEI_DISTRICTS].sort(),
    )
    expect(new Set(stops.map((s) => s.id)).size).toBe(rows.length)
    expect(stops.every((s) => s.city === '新北市' && s.id.startsWith('ntpc|'))).toBe(true)
    expect(stops.filter(validPoint).length).toBeGreaterThan(stops.length * 0.99)
    expect(validateNewTaipeiRows(rows).rows).toBe(rows.length)
  })
  it('uses independent weekly calendars, including Sunday and Wednesday', () => {
    const row = { ...rows[0] }
    for (const key of Object.keys(row))
      if (/^(garbage|recycling|foodscraps)/.test(key)) row[key] = ''
    row.garbagewednesday = 'Y'
    row.recyclingsunday = 'Y'
    row.foodscrapsmonday = 'Y'
    const [stop] = parseNewTaipeiStops(encodeNewTaipeiRows([row]))
    expect(operatesOn(stop!, '2026-09-09')).toBe(true)
    expect(operatesOn(stop!, '2026-09-08')).toBe(false)
    const now = new Date('2026-09-08T00:00:00+08:00')
    expect(nextCollection(collectionSchedules([stop!], 'garbage'), now)?.serviceDate).toBe(
      '2026-09-09',
    )
    expect(nextCollection(collectionSchedules([stop!], 'recycling'), now)?.serviceDate).toBe(
      '2026-09-13',
    )
    expect(nextCollection(collectionSchedules([stop!], 'food'), now)?.serviceDate).toBe(
      '2026-09-14',
    )
  })
  it('groups route rows by line ID, not individual stop rank', () => {
    const route = groupRoutes(stops).find((r) => r.stops.length > 3)!
    expect(new Set(route.stops.map((s) => s.routeId)).size).toBe(1)
    expect(route.stops.map((s) => s.rank)).toEqual(
      route.stops.map((s) => s.rank).sort((a, b) => a! - b!),
    )
  })
  it('rejects incomplete calendars, invalid rows and duplicate IDs', () => {
    expect(() => parseNewTaipeiStops(encodeNewTaipeiRows([null!]))).toThrow()
    expect(() =>
      parseNewTaipeiStops(encodeNewTaipeiRows([{ ...rows[0]!, garbagemonday: undefined }])),
    ).toThrow()
    expect(() => validateNewTaipeiRows([...rows.slice(1), rows[1]])).toThrow('Duplicate')
    expect(() => validateNewTaipeiRows(rows.slice(0, 10))).toThrow('20%')
  })
  it('loads the compact snapshot and keeps the empty-data error', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(compact)))
    vi.stubGlobal('fetch', fetcher)
    expect(await loadGarbageStops('新北市')).toEqual(stops)
    expect(fetcher.mock.calls[0]![0]).toContain('data/new-taipei-garbage.json')
    fetcher.mockResolvedValue(new Response(JSON.stringify(encodeNewTaipeiRows([]))))
    await expect(loadGarbageStops('新北市')).rejects.toThrow('未讀取到有效的新北市清運站點')
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...compact, version: 2 })))
    await expect(loadGarbageStops('新北市')).rejects.toThrow('版本')
  })
  it('requests subsequent pages and fails closed on upstream errors', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(Array(1000).fill(rows[0]))))
      .mockResolvedValueOnce(new Response('[]'))
    expect(await fetchNewTaipeiRows(fetcher)).toHaveLength(1000)
    expect(fetcher.mock.calls[1]![0]).toContain('page=1')
    await expect(fetchNewTaipeiRows(vi.fn().mockResolvedValue(new Response('{}')))).rejects.toThrow(
      'page',
    )
    await expect(
      fetchNewTaipeiRows(vi.fn().mockResolvedValue(new Response('', { status: 503 }))),
    ).rejects.toThrow('503')
  })
})

describe('New Taipei compact format guards', () => {
  const sample = () => encodeNewTaipeiRows([rows[0]!])

  it('deduplicates repeated strings and stores rounded numeric coordinates', () => {
    const data = encodeNewTaipeiRows([rows[0]!, { ...rows[0]!, name: '另一個地址' }])
    for (const pool of Object.values(data.pools)) expect(pool).toHaveLength(1)
    expect(data.rows[0]!.slice(0, 3)).toEqual([0, 0, 0])
    expect(data.rows[1]!.slice(0, 3)).toEqual([0, 0, 0])
    expect(data.rows[0]![6]).toBe(Number(Number(rows[0]!.longitude).toFixed(6)))
    expect(data.rows[0]![7]).toBe(Number(Number(rows[0]!.latitude).toFixed(6)))
    expect(data.rows[1]![4]).toBe('另一個地址')
    expect(parseNewTaipeiStops(JSON.parse(JSON.stringify(data)))).toEqual(
      parseLegacyNewTaipeiStops([rows[0]!, { ...rows[0]!, name: '另一個地址' }]),
    )
  })
  it('preserves source precision, ID formatting, time normalization and route fallbacks', () => {
    for (const row of [
      {
        ...rows[0]!,
        rank: '001',
        latitude: '25.10000000',
        longitude: '121.500000',
        linename: '',
        time: '0045',
        name: ' 測試路1號 ',
      },
      { ...rows[0]!, latitude: '25.123456789012345', longitude: '121.987654321', time: '23:59' },
      { ...rows[0]!, latitude: '25.1', longitude: '121.5', time: '24:59' },
    ]) {
      const data = JSON.parse(JSON.stringify(encodeNewTaipeiRows([row])))
      expect(parseNewTaipeiStops(data)).toEqual(parseLegacyNewTaipeiStops([row]))
    }
  })
  it('preserves all 128 weekly masks for each collection kind and accepts lowercase flags', () => {
    const calendarRows = Array.from({ length: 128 }, (_, mask) => {
      const row = { ...rows[0]! }
      for (const prefix of ['garbage', 'recycling', 'foodscraps'])
        dayNames.forEach((day, index) => {
          row[prefix + day] = mask & (1 << index) ? 'y' : index % 2 ? 'n' : ''
        })
      return row
    })
    const data = encodeNewTaipeiRows(calendarRows)
    data.rows.forEach((row, mask) => expect(row.slice(9, 12)).toEqual([mask, mask, mask]))
    expect(parseNewTaipeiStops(data)).toEqual(parseLegacyNewTaipeiStops(calendarRows))
  })
  it.each([
    'city',
    'lineid',
    'linename',
    'rank',
    'name',
    'village',
    'longitude',
    'latitude',
    'time',
  ])('rejects a missing upstream %s', (key) => {
    expect(() => encodeNewTaipeiRows([{ ...rows[0]!, [key]: undefined }])).toThrow()
  })
  it.each(['', '-1', '1.5', '1e2', 'NaN'])('rejects invalid upstream rank %s', (rank) => {
    expect(() => encodeNewTaipeiRows([{ ...rows[0]!, rank }])).toThrow()
  })
  it.each(['garbage', 'recycling', 'foodscraps'])(
    'rejects missing or invalid %s flags on every day',
    (prefix) => {
      for (const day of dayNames)
        for (const value of [undefined, 'X', ' Y', '1'])
          expect(() => encodeNewTaipeiRows([{ ...rows[0]!, [prefix + day]: value }])).toThrow(
            '每週',
          )
    },
  )
  it.each([null, [], {}, 'data', 1])('rejects malformed compact containers: %j', (data) => {
    expect(() => parseNewTaipeiStops(data)).toThrow()
  })
  it.each([undefined, 0, 2, '1'])('rejects unsupported version %j', (version) => {
    expect(() => parseNewTaipeiStops({ ...sample(), version })).toThrow('版本')
  })
  it('rejects the upstream format on the browser parsing path', () => {
    expect(() => parseNewTaipeiStops([rows[0]])).toThrow('格式')
  })
  it('requires the exact column layout and string pools', () => {
    const data = sample()
    for (const fields of [
      undefined,
      {},
      data.fields.slice(1),
      [...data.fields, 'extra'],
      [...data.fields].reverse(),
    ])
      expect(() => parseNewTaipeiStops({ ...data, fields })).toThrow('格式')
    for (const pools of [null, [], {}])
      expect(() => parseNewTaipeiStops({ ...data, pools })).toThrow()
    for (const key of Object.keys(data.pools))
      for (const value of [undefined, 'invalid', [null], [1]])
        expect(() =>
          parseNewTaipeiStops({ ...data, pools: { ...data.pools, [key]: value } }),
        ).toThrow('查表')
  })
  it.each([null, {}, [], [0]])('rejects malformed compact rows: %j', (row) => {
    expect(() => parseNewTaipeiStops({ ...sample(), rows: [row] })).toThrow('欄位')
  })
  it('rejects absent rows and extra row columns', () => {
    expect(() => parseNewTaipeiStops({ ...sample(), rows: undefined })).toThrow('格式')
    const data = sample()
    expect(() => parseNewTaipeiStops({ ...data, rows: [[...data.rows[0]!, 0]] })).toThrow('欄位')
  })
  it.each([0, 1, 2, 5, 8, 12])('rejects invalid pool indexes in column %i', (column) => {
    for (const index of [-2, 1, 0.5, '0', null, undefined, Infinity]) {
      const data = sample()
      const row: unknown[] = data.rows[0]!
      row[column] = index
      expect(() => parseNewTaipeiStops(data)).toThrow('索引')
    }
  })
  it.each([9, 10, 11])('rejects invalid weekly bitmasks in column %i', (column) => {
    for (const value of [-1, 128, 256, 1.5, '1', null, undefined, NaN, Infinity]) {
      const data = sample()
      const row: unknown[] = data.rows[0]!
      row[column] = value
      expect(() => parseNewTaipeiStops(data)).toThrow('每週')
    }
  })
  it('rejects invalid rank, address and coordinates', () => {
    const cases: [number, unknown[]][] = [
      [3, [-1, 1.5, '1', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]],
      [4, ['', 1, null]],
      [6, ['121.5', null, NaN, Infinity, 121.1234567]],
      [7, ['25.1', null, NaN, Infinity, 25.1234567]],
    ]
    for (const [column, values] of cases)
      for (const value of values) {
        const data = sample()
        const row: unknown[] = data.rows[0]!
        row[column] = value
        expect(() => parseNewTaipeiStops(data)).toThrow('無效')
      }
  })
  it('rejects invalid districts, line IDs, times and inconsistent original identities', () => {
    for (const [key, value] of [
      ['city', '臺北市'],
      ['lineid', ''],
      ['time', '25:00'],
      ['identity', 'bad'],
      ['identity', '1|NaN|121.5'],
      ['identity', '1|25|121|extra'],
      ['identity', `2|${rows[0]!.latitude}|${rows[0]!.longitude}`],
      ['identity', '1|25|121'],
    ] as const) {
      const data = sample()
      data.pools[key][0] = value
      expect(() => parseNewTaipeiStops(data)).toThrow(/無效|不一致/)
    }
  })
})

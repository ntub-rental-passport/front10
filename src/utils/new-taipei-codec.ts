import type { NewTaipeiRow } from './garbage'

export const NEW_TAIPEI_FIELDS = [
  'city',
  'lineid',
  'linename',
  'rank',
  'name',
  'village',
  'longitude',
  'latitude',
  'time',
  'garbage',
  'recycling',
  'foodscraps',
  'identity',
] as const
export const NEW_TAIPEI_POOLS = [
  'city',
  'lineid',
  'linename',
  'village',
  'time',
  'identity',
] as const
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const REQUIRED = [
  'city',
  'lineid',
  'linename',
  'rank',
  'name',
  'village',
  'longitude',
  'latitude',
  'time',
]

export interface CompactNewTaipeiData {
  version: 1
  fields: typeof NEW_TAIPEI_FIELDS
  pools: Record<(typeof NEW_TAIPEI_POOLS)[number], string[]>
  rows: [
    city: number,
    lineid: number,
    linename: number,
    rank: number,
    name: string,
    village: number,
    longitude: number,
    latitude: number,
    time: number,
    garbage: number,
    recycling: number,
    foodscraps: number,
    identity: number,
  ][]
}

export function encodeNewTaipeiRows(rows: NewTaipeiRow[]): CompactNewTaipeiData {
  if (!Array.isArray(rows)) throw new Error('新北市站點資料格式錯誤')
  const pools: CompactNewTaipeiData['pools'] = {
    city: [],
    lineid: [],
    linename: [],
    village: [],
    time: [],
    identity: [],
  }
  const indexes = new Map(NEW_TAIPEI_POOLS.map((key) => [key, new Map<string, number>()]))
  const index = (key: (typeof NEW_TAIPEI_POOLS)[number], value: string) => {
    const pool = indexes.get(key)!
    let result = pool.get(value)
    if (result === undefined) {
      result = pools[key].length
      pools[key].push(value)
      pool.set(value, result)
    }
    return result
  }
  const mask = (row: NewTaipeiRow, prefix: string) => {
    let result = 0
    for (let day = 0; day < DAY_NAMES.length; day++) {
      const value = row[prefix + DAY_NAMES[day]]
      if (typeof value !== 'string' || !['', 'Y', 'N'].includes(value.toUpperCase()))
        throw new Error('新北市每週清運欄位不完整')
      if (value.toUpperCase() === 'Y') result |= 1 << day
    }
    return result
  }
  return {
    version: 1,
    fields: NEW_TAIPEI_FIELDS,
    pools,
    rows: rows.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row))
        throw new Error('新北市站點資料包含無效欄位')
      if (REQUIRED.some((key) => typeof row[key] !== 'string') || !/^\d+$/.test(row.rank))
        throw new Error('新北市站點資料缺少必要欄位')
      const rank = Number(row.rank)
      const longitude = Number(Number(row.longitude).toFixed(6))
      const latitude = Number(Number(row.latitude).toFixed(6))
      if (!Number.isSafeInteger(rank) || !Number.isFinite(longitude) || !Number.isFinite(latitude))
        throw new Error('新北市站點資料包含無效欄位')
      // ID 使用原始字串；必要時保留精度與字串格式，才能維持既有提醒及座標完全相同。
      const identity = `${row.rank}|${row.latitude}|${row.longitude}`
      return [
        index('city', row.city),
        index('lineid', row.lineid),
        index('linename', row.linename),
        rank,
        row.name,
        index('village', row.village),
        longitude,
        latitude,
        index('time', row.time),
        mask(row, 'garbage'),
        mask(row, 'recycling'),
        mask(row, 'foodscraps'),
        identity === `${rank}|${latitude}|${longitude}` ? -1 : index('identity', identity),
      ]
    }),
  }
}

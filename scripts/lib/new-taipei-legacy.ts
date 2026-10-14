import {
  NEW_TAIPEI_DISTRICTS,
  normalizeTime,
  type GarbageStop,
  type NewTaipeiRow,
} from '../../src/utils/garbage'

// 上游驗證與等價性測試保留原始解析路徑，避免用新 codec 自己驗證自己。
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export function parseLegacyNewTaipeiStops(rows: unknown): GarbageStop[] {
  if (!Array.isArray(rows)) throw new Error('新北市站點資料格式錯誤')
  return rows.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('新北市站點資料包含無效欄位')
    const row = raw as NewTaipeiRow
    const required = [
      'city',
      'lineid',
      'linename',
      'rank',
      'name',
      'village',
      'latitude',
      'longitude',
      'time',
    ]
    if (required.some((key) => typeof row[key] !== 'string') || !/^\d+$/.test(row.rank))
      throw new Error('新北市站點資料缺少必要欄位')
    for (const prefix of ['garbage', 'recycling', 'foodscraps']) {
      if (
        DAY_NAMES.some(
          (day) =>
            typeof row[prefix + day] !== 'string' ||
            !['', 'Y', 'N'].includes(row[prefix + day]!.toUpperCase()),
        )
      )
        throw new Error('新北市每週清運欄位不完整')
    }
    const arrival = normalizeTime(row.time || '')
    const endMinutes = +arrival.slice(0, 2) * 60 + +arrival.slice(3) + 10
    const departure = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    const days = (prefix: string) =>
      DAY_NAMES.flatMap((day, index) => (row[prefix + day]?.toUpperCase() === 'Y' ? [index] : []))
    if (!NEW_TAIPEI_DISTRICTS.includes(row.city) || !arrival || !row.name || !row.lineid)
      throw new Error('新北市站點資料包含無效欄位')
    const address = `新北市${row.city}${row.name.trim()}`
    return {
      city: '新北市',
      id: `ntpc|${row.lineid}|${row.rank}|${row.latitude}|${row.longitude}`,
      district: row.city,
      village: row.village || '',
      team: '新北市環保局',
      plate: '',
      route: row.linename || row.lineid,
      routeId: row.lineid,
      rank: Number(row.rank),
      trip: '',
      address,
      road: row.name.match(/^.*?(?:路|街|大道)/)?.[0] || row.name,
      arrival,
      departure,
      departureEstimated: true,
      lat: +row.latitude,
      lng: +row.longitude,
      collections: {
        garbage: { arrival, departure, days: days('garbage') },
        recycling: { arrival, departure, days: days('recycling') },
        food: { arrival, departure, days: days('foodscraps') },
      },
    } satisfies GarbageStop
  })
}

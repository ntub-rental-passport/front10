import type { CollectionKind, CollectionSchedule } from './garbage-countdown'

export const TAIPEI_DISTRICTS = [
  '中正區',
  '大同區',
  '中山區',
  '松山區',
  '大安區',
  '萬華區',
  '信義區',
  '士林區',
  '北投區',
  '內湖區',
  '南港區',
  '文山區',
]
export const NEW_TAIPEI_DISTRICTS = [
  '板橋區',
  '三重區',
  '中和區',
  '永和區',
  '新莊區',
  '新店區',
  '樹林區',
  '鶯歌區',
  '三峽區',
  '淡水區',
  '汐止區',
  '瑞芳區',
  '土城區',
  '蘆洲區',
  '五股區',
  '泰山區',
  '林口區',
  '深坑區',
  '石碇區',
  '坪林區',
  '三芝區',
  '石門區',
  '八里區',
  '平溪區',
  '雙溪區',
  '貢寮區',
  '金山區',
  '萬里區',
  '烏來區',
]
export type GarbageCity = '臺北市' | '新北市'
export interface Point {
  lat: number
  lng: number
}
export interface GarbageStop extends Point {
  city: GarbageCity
  routeId?: string
  rank?: number
  collections?: Partial<Record<CollectionKind, CollectionSchedule>>
  id: string
  district: string
  village: string
  team: string
  plate: string
  route: string
  trip: string
  address: string
  road: string
  arrival: string
  departure: string
  departureEstimated?: boolean
}
interface NewTaipeiRow {
  city: string
  lineid: string
  linename: string
  rank: string
  name: string
  village: string
  longitude: string
  latitude: string
  time: string
  memo?: string
  [key: string]: string | undefined
}
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export function parseNewTaipeiStops(rows: unknown): GarbageStop[] {
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
export interface TruckPosition extends Point {
  plate: string
  updatedAt: string
}

/** RFC 4180 fields, including quoted commas, escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = !quoted
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(field.trim())
      field = ''
      if (c !== ',') {
        if (row.some(Boolean)) rows.push(row)
        row = []
        if (c === '\r' && text[i + 1] === '\n') i++
      }
    } else field += c
  }
  if (quoted) throw new Error('站點 CSV 格式不完整')
  if (field || row.length) {
    row.push(field.trim())
    rows.push(row)
  }
  return rows
}
export function normalizeTime(value: string): string {
  if (!value.trim()) return ''
  const digits = value.replace(':', '').padStart(4, '0')
  if (!/^\d{4}$/.test(digits) || +digits.slice(0, 2) > 24 || +digits.slice(2) > 59) return ''
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}
export function parseStops(csv: string): GarbageStop[] {
  const [headers, ...rows] = parseCsv(csv)
  if (
    !headers ||
    !['行政區', '里別', '地點', '經度', '緯度', '抵達時間', '離開時間'].every((h) =>
      headers.includes(h),
    )
  )
    throw new Error('站點資料缺少必要欄位')
  const stops = rows
    .map((row) => {
      const get = (name: string) => row[headers.indexOf(name)] || ''
      const district = get('行政區')
      const address = get('地點')
      const street = address.replace(/^臺北市|^台北市/, '').replace(district, '')
      const stop: GarbageStop = {
        city: '臺北市',
        id: [district, get('里別'), get('路線'), get('車次'), address, get('抵達時間')].join('|'),
        district,
        address,
        village: get('里別'),
        team: get('分隊'),
        plate: get('車號'),
        route: get('路線'),
        trip: get('車次'),
        road: street.match(/^.*?(?:路|街|大道)/)?.[0] || street,
        arrival: normalizeTime(get('抵達時間')),
        departure: normalizeTime(get('離開時間')),
        lat: +get('緯度'),
        lng: +get('經度'),
      }
      return stop
    })
    .filter((s) => TAIPEI_DISTRICTS.includes(s.district) && s.arrival && s.departure)
  return [...new Map(stops.map((s) => [s.id, s])).values()]
}
export function validPoint(p: Point & { city?: GarbageCity }): boolean {
  if (p.city === '新北市')
    return (
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      p.lat >= 24.6 &&
      p.lat <= 25.4 &&
      p.lng >= 121.2 &&
      p.lng <= 122.1
    )
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= 24.9 &&
    p.lat <= 25.3 &&
    p.lng >= 121.4 &&
    p.lng <= 121.7
  )
}
export function distanceMeters(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
export function taipeiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
export function isCollectionDay(date: string): boolean {
  const day = new Date(`${date}T12:00:00+08:00`).getUTCDay()
  return Number.isFinite(day) && day !== 0 && day !== 3
}
export function scheduleStatus(stop: GarbageStop, now: Date): string {
  if (stop.collections) {
    const day = new Date(`${taipeiDate(now)}T12:00:00+08:00`).getUTCDay()
    if (!Object.values(stop.collections).some((s) => s?.days.includes(day))) return '今日無表定收運'
    return now.getTime() < scheduleTime(taipeiDate(now), stop.arrival)
      ? `表定 ${stop.arrival} 抵達`
      : '今日表定時間已過'
  }
  const date = taipeiDate(now)
  const previousDate = taipeiDate(new Date(now.getTime() - 86400000))
  const previousArrival = scheduleTime(previousDate, stop.arrival)
  let previousDeparture = scheduleTime(previousDate, stop.departure)
  if (previousDeparture < previousArrival) previousDeparture += 86400000
  if (
    isCollectionDay(previousDate) &&
    previousDeparture >= now.getTime() &&
    previousDeparture >= scheduleTime(date, '00:00')
  ) {
    return now.getTime() < previousArrival
      ? `表定 ${Math.ceil((previousArrival - now.getTime()) / 60000)} 分後（前日班次）`
      : '表定收運時段（前日班次）'
  }
  if (!isCollectionDay(date)) return '今日例行停收'
  const arrival = scheduleTime(date, stop.arrival)
  let departure = scheduleTime(date, stop.departure)
  if (departure < arrival) departure += 86400000
  if (now.getTime() < arrival) return `表定 ${Math.ceil((arrival - now.getTime()) / 60000)} 分後`
  return now.getTime() <= departure ? '表定收運時段' : '今日表定已結束'
}
export function scheduleTime(date: string, time: string): number {
  return (
    new Date(`${date}T00:00:00+08:00`).getTime() + (+time.slice(0, 2) * 60 + +time.slice(3)) * 60000
  )
}
export function overlaps(stop: GarbageStop, start: string, end: string): boolean {
  const minutes = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3)
  const a = minutes(stop.arrival)
  let b = minutes(stop.departure)
  if (b < a) b += 1440
  const c = start ? minutes(start) : 0
  let d = end ? minutes(end) : 1439
  if (d < c) d += 1440
  return [-1440, 0, 1440].some((offset) => a <= d + offset && b >= c + offset)
}
export function freshTrucks(trucks: TruckPosition[], now: Date): TruckPosition[] {
  return trucks.filter(
    (t) =>
      validPoint(t) &&
      t.plate &&
      now.getTime() - Date.parse(t.updatedAt) <= 120000 &&
      now.getTime() - Date.parse(t.updatedAt) >= -30000,
  )
}

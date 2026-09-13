import { scheduleTime, taipeiDate, type GarbageStop } from './garbage'

export type CollectionKind = 'garbage' | 'recycling' | 'food'
export interface CollectionSchedule {
  arrival: string
  departure: string
  /** JS weekday values, based on the service date in Taipei. */
  days: number[]
}
export interface NextCollection {
  arrivalAt: number
  departureAt: number
  serviceDate: string
  active: boolean
}
export const COLLECTION_LABELS: Record<CollectionKind, string> = {
  garbage: '垃圾',
  recycling: '資源回收',
  food: '廚餘',
}

export function collectionSchedules(
  stops: GarbageStop[],
  kind: CollectionKind,
): CollectionSchedule[] {
  return stops.flatMap((stop) => {
    // An explicit per-kind timetable takes precedence over the shared source.
    // CSV supplies only the general garbage-truck schedule. Never duplicate it
    // into recycling or food-waste timetables without a confirmed source.
    const schedule = stop.collections?.[kind]
    if (schedule) return [schedule]
    if (stop.collections || kind !== 'garbage') return []
    if (/回收車|每週|每周/.test(stop.address || '')) return []
    return [{ arrival: stop.arrival, departure: stop.departure, days: [1, 2, 4, 5, 6] }]
  })
}

export function nextCollection(schedules: CollectionSchedule[], now: Date): NextCollection | null {
  if (!schedules.length) return null
  const midnight = scheduleTime(taipeiDate(now), '00:00')
  const candidates: NextCollection[] = []
  for (let offset = -1; offset <= 7; offset++) {
    const date = taipeiDate(new Date(midnight + offset * 86400000))
    const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay()
    for (const s of schedules) {
      if (!s.days.includes(weekday)) continue
      const arrivalAt = scheduleTime(date, s.arrival)
      let departureAt = scheduleTime(date, s.departure)
      if (departureAt < arrivalAt) departureAt += 86400000
      if (
        !Number.isFinite(arrivalAt) ||
        !Number.isFinite(departureAt) ||
        departureAt + 60000 <= now.getTime()
      )
        continue
      candidates.push({
        arrivalAt,
        departureAt,
        serviceDate: date,
        active: arrivalAt <= now.getTime(),
      })
    }
  }
  return candidates.sort((a, b) => a.arrivalAt - b.arrivalAt)[0] || null
}
export function operatesOn(stop: GarbageStop, date: string): boolean {
  if (!stop.collections)
    return [1, 2, 4, 5, 6].includes(new Date(`${date}T12:00:00+08:00`).getUTCDay())
  const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay()
  return Object.values(stop.collections).some((schedule) => schedule?.days.includes(weekday))
}

export function countdownLabel(next: NextCollection | null, now: Date): string {
  if (!next) return '待提供班表'
  if (next.active) return '表定收運時段'
  const seconds = Math.max(0, Math.ceil((next.arrivalAt - now.getTime()) / 1000))
  if (seconds <= 3600)
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')} 分 ${String(seconds % 60).padStart(2, '0')} 秒`
  const minutes = Math.ceil(seconds / 60)
  const days = Math.floor(minutes / 1440)
  return `${days ? `${days} 天 ` : ''}${Math.floor((minutes % 1440) / 60)} 小時 ${minutes % 60} 分`
}

export function nextTimeLabel(next: NextCollection | null): string {
  if (!next) return '尚無此類獨立收運資料'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(next.arrivalAt)
}

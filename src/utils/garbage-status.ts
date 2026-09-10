import { collectionSchedules } from './garbage-countdown'
import { scheduleTime, type GarbageStop } from './garbage'
export type StatusFilter = 'all' | 'now' | '10' | '30' | '60'
export function stopStatus(stop: GarbageStop, timestamp: number, date?: string) {
  const schedules = (['garbage', 'recycling', 'food'] as const).flatMap((kind) =>
    collectionSchedules([stop], kind),
  )
  const midnight = Math.floor((timestamp + 28800000) / 86400000) * 86400000 - 28800000
  const dayStart = date ? scheduleTime(date, '00:00') : midnight
  const weekday = new Date(dayStart + 43200000).getUTCDay()
  const minutes = (time: string) => (+time.slice(0, 2) * 60 + +time.slice(3)) * 60000
  const intervals = schedules
    .filter((s) => s.days.includes(weekday))
    .map((s) => {
      const start = dayStart + minutes(s.arrival)
      let end = dayStart + minutes(s.departure)
      if (end < start) end += 86400000
      end += 60000 // Departure times have minute precision; include the entire final minute.
      return { start, end }
    })
  let next: { start: number; end: number; serviceDay: number } | undefined
  for (let offset = -1; offset <= 7; offset++) {
    const serviceDay = midnight + offset * 86400000
    const day = new Date(serviceDay + 43200000).getUTCDay()
    for (const s of schedules) {
      if (!s.days.includes(day)) continue
      const start = serviceDay + minutes(s.arrival)
      let end = serviceDay + minutes(s.departure)
      if (end < start) end += 86400000
      end += 60000
      if (end > timestamp && (!next || start < next.start)) next = { start, end, serviceDay }
    }
  }
  const active =
    !!next && next.start <= timestamp && (dayStart === midnight || dayStart === next.serviceDay)
  const arrivingSoon =
    !!next &&
    next.start > timestamp &&
    next.start - timestamp <= 15 * 60000 &&
    (dayStart === midnight || dayStart === next.serviceDay)
  const state = active
    ? 'active'
    : arrivingSoon
      ? 'upcoming'
      : !intervals.length
        ? 'unknown'
        : intervals.every((s) => s.end <= timestamp)
          ? 'ended'
          : 'pending'
  return {
    state,
    active,
    remaining: next && !active ? next.start - timestamp : null,
    color:
      state === 'active'
        ? '#16a568'
        : state === 'ended'
          ? '#50545b'
          : state === 'upcoming'
            ? '#cf9500'
            : '#9499a3',
    label: `${stop.departureEstimated ? '約 ' : ''}${stop.arrival}${stop.departure !== stop.arrival ? '–' + stop.departure : ''}`,
  }
}
export function matchesStatus(stop: GarbageStop, filter: StatusFilter, timestamp: number) {
  if (filter === 'all') return true
  const status = stopStatus(stop, timestamp)
  if (filter === 'now') return status.active
  return (
    status.active ||
    (status.remaining !== null &&
      status.remaining > 0 &&
      status.remaining <= Number(filter) * 60000)
  )
}

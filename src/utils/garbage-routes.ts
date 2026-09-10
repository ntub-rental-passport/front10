import { validPoint, type GarbageStop } from './garbage'

export interface GarbageRoute {
  id: string
  label: string
  stops: GarbageStop[]
}
export function groupRoutes(stops: GarbageStop[]): GarbageRoute[] {
  const groups = new Map<string, GarbageRoute>()
  for (const stop of stops) {
    // Never connect separate trips, teams or vehicles just because the route name matches.
    const id = JSON.stringify([
      stop.city,
      stop.district,
      stop.routeId || stop.route,
      stop.team,
      stop.plate,
      stop.trip,
    ])
    const group = groups.get(id) || {
      id,
      label: `${stop.district} · ${stop.route} · ${stop.trip} · ${stop.plate}`,
      stops: [],
    }
    group.stops.push(stop)
    groups.set(id, group)
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      stops: group.stops.sort((a, b) =>
        a.rank !== undefined && b.rank !== undefined
          ? a.rank - b.rank
          : a.arrival.localeCompare(b.arrival) || a.id.localeCompare(b.id),
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'))
}

/** Illustrative stop order only, NOT a road route or a measured vehicle track. */
export function routeSegments(stops: GarbageStop[]): number[][][] {
  const segments: number[][][] = []
  let segment: number[][] = []
  for (const stop of stops) {
    if (!validPoint(stop)) {
      if (segment.length > 1) segments.push(segment)
      segment = []
    } else segment.push([stop.lng, stop.lat])
  }
  if (segment.length > 1) segments.push(segment)
  return segments
}

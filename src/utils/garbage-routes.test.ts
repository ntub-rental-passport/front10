import { describe, expect, it } from 'vitest'
import { groupRoutes, routeSegments } from './garbage-routes'
import type { GarbageStop } from './garbage'
const stop = {
  id: 'a',
  district: '大安區',
  team: '安和',
  route: '安和-1',
  plate: 'ABC',
  trip: '第1車',
  arrival: '18:00',
  departure: '18:05',
  lat: 25.03,
  lng: 121.53,
} as GarbageStop
describe('route grouping and illustrative geometry', () => {
  it('keeps trips and vehicles separate', () => {
    expect(groupRoutes([stop, { ...stop, trip: '第2車' }, { ...stop, plate: 'DEF' }])).toHaveLength(
      3,
    )
  })
  it('orders 24:xx after evening service', () => {
    const route = groupRoutes([{ ...stop, arrival: '24:01' }, stop])[0]
    expect(route.stops.map((s) => s.arrival)).toEqual(['18:00', '24:01'])
  })
  it('does not draw across invalid coordinate records', () => {
    expect(routeSegments([stop, { ...stop, lat: 0 }, stop])).toEqual([])
    expect(routeSegments([stop, { ...stop, lng: 121.54 }])).toHaveLength(1)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NEW_TAIPEI_DISTRICTS, parseNewTaipeiStops, validPoint } from './garbage'
import { collectionSchedules, nextCollection, operatesOn } from './garbage-countdown'
import { groupRoutes } from './garbage-routes'
import { stopStatus } from './garbage-status'
import { fetchNewTaipeiRows, validateNewTaipeiRows } from '../../scripts/update-new-taipei-garbage'

const rows = JSON.parse(
  readFileSync(new URL('../../public/data/new-taipei-garbage.json', import.meta.url), 'utf8'),
)
const stops = parseNewTaipeiStops(rows)
describe('New Taipei collection data', () => {
  it('marks Fude 18 estimated interval active through 20:36 and ended at 20:37', () => {
    const stop = stops.find(s => s.district === '汐止區' && s.address.endsWith('福德二路18號') && s.arrival === '20:26')!
    expect(stop).toBeDefined()
    expect(stop.departureEstimated).toBe(true)
    expect(stop.departure).toBe('20:36')
    for (const time of ['20:26:00', '20:30:00', '20:36:59']) expect(stopStatus(stop, Date.parse(`2026-09-10T${time}+08:00`)).state).toBe('active')
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
    const [stop] = parseNewTaipeiStops([row])
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
    expect(() => parseNewTaipeiStops([null])).toThrow()
    expect(() => parseNewTaipeiStops([{ ...rows[0], garbagemonday: undefined }])).toThrow()
    expect(() => validateNewTaipeiRows([...rows.slice(1), rows[1]])).toThrow('Duplicate')
    expect(() => validateNewTaipeiRows(rows.slice(0, 10))).toThrow('20%')
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

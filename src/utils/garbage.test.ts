import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  distanceMeters,
  freshTrucks,
  isCollectionDay,
  normalizeTime,
  overlaps,
  parseCsv,
  parseStops,
  scheduleStatus,
  scheduleTime,
  taipeiDate,
  TAIPEI_DISTRICTS,
  validPoint,
} from './garbage'

const csv = readFileSync(new URL('../../public/data/taipei-garbage.csv', import.meta.url), 'utf8')
const stops = parseStops(csv)
const metadata = JSON.parse(
  readFileSync(new URL('../../public/data/taipei-garbage-source.json', import.meta.url), 'utf8'),
)
describe('Taipei official garbage data', () => {
  it('parses quoted commas, newlines and escaped quotes without shifting coordinates', () => {
    expect(parseCsv('\uFEFF地點,經度\r\n"路口,旁\n\"\"入口\"\"",121.5\r\n')).toEqual([
      ['地點', '經度'],
      ['路口,旁\n"入口"', '121.5'],
    ])
  })
  it('loads real data for all twelve districts with stable unique IDs', () => {
    expect(stops.length).toBe(metadata.rows)
    expect([...new Set(stops.map((s) => s.district))].sort()).toEqual([...TAIPEI_DISTRICTS].sort())
    expect(new Set(stops.map((s) => s.id)).size).toBe(stops.length)
    expect(stops.every((s) => Boolean(s.address && s.arrival && s.departure))).toBe(true)
  })
  it('rejects malformed source columns and invalid times', () => {
    expect(() => parseStops('name,time\na,12')).toThrow()
    expect(normalizeTime('')).toBe('')
    expect(normalizeTime('2460')).toBe('')
    expect(normalizeTime('630')).toBe('06:30')
    expect(normalizeTime('2411')).toBe('24:11')
  })
  it('retains nine suspect coordinates for list lookup but excludes them from spatial queries', () => {
    expect(stops.filter((s) => !validPoint(s))).toHaveLength(metadata.invalidCoordinates ?? 9)
  })
})
describe('nearby distance and schedule semantics', () => {
  const sample = { ...stops[0], arrival: '16:30', departure: '16:40' }
  it('uses unrounded Haversine distances for the 500 metre boundary', () => {
    const center = { lat: 25, lng: 121.5 }
    const atDistance = (metres: number) => ({
      lat: 25 + ((metres / 6371000) * 180) / Math.PI,
      lng: 121.5,
    })
    expect(distanceMeters(center, atDistance(499.9))).toBeLessThan(500)
    expect(distanceMeters(center, atDistance(500.1))).toBeGreaterThan(500)
    expect(distanceMeters(center, center)).toBe(0)
  })
  it('handles inclusive and overnight windows', () => {
    expect(overlaps(sample, '16:40', '17:00')).toBe(true)
    expect(overlaps(sample, '17:00', '18:00')).toBe(false)
    expect(overlaps({ ...stops[0], arrival: '23:55', departure: '00:10' }, '00:00', '00:05')).toBe(
      true,
    )
  })
  it('uses Taipei calendar dates independently of browser timezone', () => {
    expect(taipeiDate(new Date('2026-09-08T16:01:00Z'))).toBe('2026-09-09')
    expect(isCollectionDay('2026-09-09')).toBe(false)
    expect(isCollectionDay('2026-09-13')).toBe(false)
    expect(isCollectionDay('2026-09-08')).toBe(true)
    expect(scheduleStatus(sample, new Date('2026-09-08T16:25:00+08:00'))).toBe('表定 5 分後')
    expect(scheduleStatus(sample, new Date('2026-09-09T16:35:00+08:00'))).toBe('今日例行停收')
    const overnight = { ...stops[0], arrival: '24:11', departure: '24:13' }
    expect(new Date(scheduleTime('2026-09-08', overnight.arrival)).toISOString()).toBe(
      '2026-09-08T16:11:00.000Z',
    )
    expect(scheduleStatus(overnight, new Date('2026-09-09T00:05:00+08:00'))).toBe(
      '表定 6 分後（前日班次）',
    )
    expect(scheduleStatus(overnight, new Date('2026-09-09T00:12:00+08:00'))).toBe(
      '表定收運時段（前日班次）',
    )
  })
  it('never presents stale, future or invalid truck coordinates as live', () => {
    const now = new Date('2026-09-08T10:00:00Z')
    const v = { plate: 'ABC-123', lat: 25.05, lng: 121.5, updatedAt: '2026-09-08T09:59:30Z' }
    expect(
      freshTrucks(
        [
          v,
          { ...v, updatedAt: '2026-09-08T09:55:00Z' },
          { ...v, updatedAt: '2026-09-08T11:00:00Z' },
          { ...v, lat: 0 },
        ],
        now,
      ),
    ).toEqual([v])
  })
})

import { describe, expect, it } from 'vitest'
import {
  collectionSchedules,
  countdownLabel,
  nextCollection,
  type CollectionSchedule,
} from './garbage-countdown'
import type { GarbageStop } from './garbage'

const schedule: CollectionSchedule = { arrival: '16:30', departure: '16:40', days: [1, 2, 4, 5, 6] }
const at = (time: string) => new Date(time + '+08:00')
describe('Taipei next collection countdown', () => {
  it('shows seconds within one hour', () => {
    const now = at('2026-09-08T16:25:01')
    expect(countdownLabel(nextCollection([schedule], now), now)).toBe('04 分 59 秒')
  })
  it('skips Wednesday after the last Tuesday collection', () => {
    expect(nextCollection([schedule], at('2026-09-08T16:40:59'))?.active).toBe(true)
    const next = nextCollection([schedule], at('2026-09-08T16:41:00'))!
    expect(next.serviceDate).toBe('2026-09-10')
  })
  it('skips Sunday after the last Saturday collection', () => {
    expect(nextCollection([schedule], at('2026-09-12T23:00:00'))?.serviceDate).toBe('2026-09-14')
  })
  it('keeps an overnight trip attached to its original service day', () => {
    const next = nextCollection(
      [{ ...schedule, arrival: '24:11', departure: '24:13' }],
      at('2026-09-09T00:12:00'),
    )!
    expect(next.serviceDate).toBe('2026-09-08')
    expect(next.active).toBe(true)
  })
  it('supports a departure after midnight written as 00:xx', () => {
    expect(
      nextCollection(
        [{ ...schedule, arrival: '23:55', departure: '00:10' }],
        at('2026-09-09T00:05:00'),
      )?.active,
    ).toBe(true)
  })
  it('uses the next trip at the same location, not tomorrow when another trip remains', () => {
    const next = nextCollection(
      [schedule, { ...schedule, arrival: '20:30', departure: '20:40' }],
      at('2026-09-08T17:00:00'),
    )!
    expect(next.arrivalAt).toBe(at('2026-09-08T20:30:00').getTime())
  })
  it('calculates each category independently without inventing missing timetables', () => {
    const stop = { arrival: '16:30', departure: '16:40' } as GarbageStop
    expect(collectionSchedules([stop], 'garbage')).toHaveLength(1)
    expect(nextCollection(collectionSchedules([stop], 'food'), new Date())).toBeNull()
    const enriched = {
      ...stop,
      collections: { recycling: { ...schedule, arrival: '18:30', days: [4] } },
    }
    expect(collectionSchedules([enriched], 'garbage')).toEqual([])
    expect(
      nextCollection(collectionSchedules([enriched], 'recycling'), at('2026-09-08T17:00:00'))
        ?.arrivalAt,
    ).toBe(at('2026-09-10T18:30:00').getTime())
  })
  it('uses Taipei time even when the supplied clock uses UTC', () => {
    expect(nextCollection([schedule], new Date('2026-09-08T16:01:00Z'))?.serviceDate).toBe(
      '2026-09-10',
    )
  })
  it('does not invent general service days for free-text collection exceptions', () => {
    const stop = {
      address: '復興三路(回收車收運)',
      arrival: '16:30',
      departure: '16:40',
    } as GarbageStop
    expect(collectionSchedules([stop], 'garbage')).toEqual([])
  })
})

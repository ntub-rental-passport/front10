import { describe, expect, it } from 'vitest'
import { filterByRetention } from './admin-audit-retention'

function eventAt(at: string) {
  return { id: at, at }
}

describe('filterByRetention', () => {
  const now = new Date('2026-08-21T12:00:00')

  it('窗期內的紀錄予以保留', () => {
    const events = [eventAt('2026-08-20T12:00:00'), eventAt('2026-08-01T12:00:00')]
    const result = filterByRetention(events, 30, now)
    expect(result).toHaveLength(2)
  })

  it('超過保留天數的紀錄被濾掉', () => {
    const events = [eventAt('2026-08-20T12:00:00'), eventAt('2026-01-01T12:00:00')]
    const result = filterByRetention(events, 30, now)
    expect(result.map((e) => e.at)).toEqual(['2026-08-20T12:00:00'])
  })

  it('恰好落在邊界上的紀錄予以保留', () => {
    const boundary = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const result = filterByRetention([{ at: boundary }], 30, now)
    expect(result).toHaveLength(1)
  })

  it('壞掉的時間字串不會拋出例外，且保守地保留該筆紀錄', () => {
    const events = [eventAt('not-a-date'), eventAt('2026-01-01T12:00:00')]
    expect(() => filterByRetention(events, 30, now)).not.toThrow()
    const result = filterByRetention(events, 30, now)
    expect(result.map((e) => e.at)).toEqual(['not-a-date'])
  })

  it('0 代表不限制，全部保留', () => {
    const events = [eventAt('2020-01-01T12:00:00'), eventAt('2026-08-20T12:00:00')]
    expect(filterByRetention(events, 0, now)).toHaveLength(2)
  })

  it('負數代表不限制，全部保留', () => {
    const events = [eventAt('2020-01-01T12:00:00')]
    expect(filterByRetention(events, -5, now)).toHaveLength(1)
  })

  it('NaN 視為不限制，全部保留', () => {
    const events = [eventAt('2020-01-01T12:00:00')]
    expect(filterByRetention(events, Number.NaN, now)).toHaveLength(1)
  })
})

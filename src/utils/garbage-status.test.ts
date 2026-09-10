import { expect, it } from 'vitest'
import { stopStatus, matchesStatus } from './garbage-status'
import type { GarbageStop } from './garbage'
const stop = {
  arrival: '18:00',
  departure: '18:10',
  address: '測試站',
  collections: { garbage: { arrival: '18:00', departure: '18:10', days: [4] } },
} as GarbageStop
const at = (time: string) => Date.parse(`2026-09-10T${time}:00+08:00`)
it('colors upcoming, active and ended schedules without claiming live data', () => {
  expect(stopStatus(stop, at('17:50')).state).toBe('upcoming')
  expect(stopStatus(stop, at('18:00')).state).toBe('active')
  expect(stopStatus(stop, at('18:10')).state).toBe('active')
  expect(stopStatus(stop, at('18:10') + 59999).state).toBe('active')
  expect(stopStatus(stop, at('18:11')).state).toBe('ended')
})
it('applies exact 10, 30 and 60 minute windows and excludes past runs', () => {
  expect(matchesStatus(stop, '10', at('17:50'))).toBe(true)
  expect(matchesStatus(stop, '10', at('17:49'))).toBe(false)
  expect(matchesStatus(stop, '30', at('17:30'))).toBe(true)
  expect(matchesStatus(stop, '60', at('17:00'))).toBe(true)
  expect(matchesStatus(stop, 'now', at('18:05'))).toBe(true)
  expect(matchesStatus(stop, '60', at('18:11'))).toBe(false)
})
it('does not invent a stop duration for New Taipei', () => {
  const instant = {
    ...stop,
    departure: '18:00',
    collections: { garbage: { arrival: '18:00', departure: '18:00', days: [4] } },
  }
  expect(matchesStatus(instant, 'now', at('18:01'))).toBe(false)
})
it('includes a previous service day overnight run', () => {
  const overnight = {
    ...stop,
    collections: { garbage: { arrival: '24:05', departure: '24:15', days: [4] } },
  }
  expect(matchesStatus(overnight, 'now', Date.parse('2026-09-11T00:10:00+08:00'))).toBe(true)
})

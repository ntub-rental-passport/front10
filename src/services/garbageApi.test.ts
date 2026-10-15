import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { parseNewTaipeiStops } from '../utils/garbage'
import { garbageRequest } from './garbageApi'

vi.mock('@/src/composables/useAuth', () => ({ getAuthSession: () => null }))
afterEach(() => vi.unstubAllGlobals())

it('matches backend station IDs for pooled and reconstructed identities', () => {
  const data = JSON.parse(
    readFileSync(
      new URL('../../backend/tests/fixtures/new-taipei-garbage.json', import.meta.url),
      'utf8',
    ),
  )
  expect(parseNewTaipeiStops(data).map((stop) => stop.id)).toEqual([
    'ntpc|207001|1|25.17950406|121.6945286',
    'ntpc|207001|2|25.1|121',
  ])
})

it('keeps backend string error details', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: '找不到清運站點，請重新選擇。' }), { status: 400 }),
      ),
  )
  await expect(garbageRequest('/reminders')).rejects.toThrow('找不到清運站點，請重新選擇。')
})

it('shows field names and messages for FastAPI 422 validation errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            { loc: ['body', 'date'], msg: '日期格式不正確', type: 'value_error' },
            { loc: ['body', 'minutesBefore'], msg: '必須大於零', type: 'greater_than' },
          ],
        }),
        { status: 422 },
      ),
    ),
  )
  await expect(garbageRequest('/reminders')).rejects.toThrow(
    'date：日期格式不正確；minutesBefore：必須大於零（HTTP 422）',
  )
})

it.each([
  [500, 'Internal Server Error'],
  [503, '{}'],
  [422, '{"detail":[]}'],
  [422, '{"detail":[null,{},"invalid"]}'],
  [400, '{"detail":{"message":"invalid"}}'],
])('includes HTTP %i when error details are unavailable: %s', async (status, body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })))
  await expect(garbageRequest('/reminders')).rejects.toThrow(
    `清運服務暫時無法連線（HTTP ${status}），請稍後再試。`,
  )
})

it('returns successful JSON responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"id":"reminder-id"}')))
  await expect(garbageRequest('/reminders')).resolves.toEqual({ id: 'reminder-id' })
})

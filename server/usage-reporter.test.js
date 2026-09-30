import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUsageReporter } from './usage-reporter.js'

const SECRET = 'test-secret-for-usage-reporter-0123456789'

function setup(responses) {
  const fetchImpl = vi.fn(async () => responses.shift() ?? new Response(null, { status: 204 }))
  const logger = { warn: vi.fn() }
  const reporter = createUsageReporter({ secret: SECRET, baseUrl: 'http://fastapi:8000', fetchImpl, logger })
  return { reporter, fetchImpl, logger }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createUsageReporter', () => {
  it('2 秒內的用量合成一次回報，帶著 OCR 服務的憑證', async () => {
    const { reporter, fetchImpl } = setup([])
    reporter.record(1)
    reporter.record(3)
    await vi.advanceTimersByTimeAsync(2000)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://fastapi:8000/api/internal/ai-usage')
    expect(JSON.parse(init.body)).toEqual({ provider: 'vision', units: 4, calls: 2 })
    expect(jwt.verify(init.headers['X-Service-Token'], SECRET)).toMatchObject({ svc: 'ocr' })
  })

  it('沒有用量就不回報', async () => {
    const { reporter, fetchImpl } = setup([])
    reporter.record(0)
    reporter.record(-2)
    reporter.record(1.5)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('回報失敗時數字留著，30 秒後連同新的用量一起重送', async () => {
    const { reporter, fetchImpl, logger } = setup([new Response(null, { status: 502 })])
    reporter.record(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(logger.warn).toHaveBeenCalledTimes(1)

    reporter.record(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ provider: 'vision', units: 3, calls: 2 })
  })

  it('連不上後端也不會丟出錯誤', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const reporter = createUsageReporter({ secret: SECRET, baseUrl: 'http://fastapi:8000', fetchImpl, logger: { warn: vi.fn() } })
    reporter.record(1)
    await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow()
  })
})

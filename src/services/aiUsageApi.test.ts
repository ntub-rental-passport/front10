import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAiUsage } from './aiUsageApi'

const api = vi.hoisted(() => ({ adminRequest: vi.fn() }))
vi.mock('./adminHttp', () => api)
beforeEach(() => vi.clearAllMocks())

describe('fetchAiUsage', () => {
  it('舊資料缺少功能、失敗與 token 時補上預設值', async () => {
    api.adminRequest.mockResolvedValue({ providers: [], daily: [
      { date: '2026-10-16', provider: 'vision', units: 5, calls: 1 },
      { date: '2026-10-16', provider: 'nvidia', feature: 'law-chat', units: 2, calls: 2,
        failed: 1, prompt_tokens: 10, completion_tokens: 4 },
    ] })
    const result = await fetchAiUsage()
    expect(result?.daily[0]).toEqual({ date: '2026-10-16', provider: 'vision', units: 5, calls: 1,
      feature: '', failed: 0, prompt_tokens: 0, completion_tokens: 0 })
    expect(result?.daily[1]).toMatchObject({ feature: 'law-chat', failed: 1, prompt_tokens: 10, completion_tokens: 4 })
    expect(api.adminRequest).toHaveBeenCalledWith('/admin/ai-usage')
  })

  it('讀取失敗回 null', async () => {
    api.adminRequest.mockRejectedValue(new Error('unavailable'))
    expect(await fetchAiUsage()).toBeNull()
  })
})

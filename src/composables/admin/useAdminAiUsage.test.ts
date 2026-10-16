import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { seedSettings } from '@/src/mocks/admin/settings'
import type { AiUsageDaily } from '@/src/mocks/admin/ai-usage'

const api = vi.hoisted(() => ({ fetchAiUsage: vi.fn() }))

vi.mock('@/src/services/aiUsageApi', () => api)

function day(date: string, units: number): AiUsageDaily {
  return { date, provider: 'vision', units, calls: 1, feature: '', failed: 0, prompt_tokens: 0, completion_tokens: 0 }
}

function response(daily: AiUsageDaily[]) {
  return { providers: [{ id: 'vision', label: 'Google Cloud Vision', unit: 'page' }], daily }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('loadAiUsage', () => {
  it('徽章跟頁面同時要讀，只送一次', async () => {
    api.fetchAiUsage.mockResolvedValue(response([day('2026-09-30', 12)]))
    const module = await import('./useAdminAiUsage')
    const usage = module.useAdminAiUsage() // 第一次用到會自己讀
    await module.loadAiUsage() // 頁面打開時又要讀
    expect(api.fetchAiUsage).toHaveBeenCalledTimes(1)
    expect(usage.loadState.value).toBe('ready')
    expect(usage.records.value).toEqual([day('2026-09-30', 12)])
  })

  it('第一次就讀不到是「讀不到」，不是「沒有用量」', async () => {
    api.fetchAiUsage.mockResolvedValue(null)
    const module = await import('./useAdminAiUsage')
    await module.loadAiUsage()
    expect(module.useAdminAiUsage().loadState.value).toBe('error')
  })

  it('重讀拿到新數字；重讀失敗就留著上次的', async () => {
    api.fetchAiUsage
      .mockResolvedValueOnce(response([day('2026-09-30', 12)]))
      .mockResolvedValueOnce(response([day('2026-09-30', 20)]))
      .mockResolvedValueOnce(null)
    const module = await import('./useAdminAiUsage')
    const usage = module.useAdminAiUsage()
    await module.loadAiUsage()
    await module.loadAiUsage()
    expect(usage.records.value).toEqual([day('2026-09-30', 20)])
    await module.loadAiUsage()
    expect(usage.loadState.value).toBe('ready')
    expect(usage.records.value).toEqual([day('2026-09-30', 20)])
  })
})

describe('NVIDIA 用量與額度', () => {
  it('跨功能加總本月、日均、趨勢與 token，額度使用各自的設定', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 10))
    api.fetchAiUsage.mockResolvedValue(response([
      { ...day('2026-08-10', 2), provider: 'nvidia', feature: 'contract-analysis', calls: 2, failed: 1, prompt_tokens: 100, completion_tokens: 20 },
      { ...day('2026-08-10', 3), provider: 'nvidia', feature: 'law-chat', calls: 3, prompt_tokens: 30, completion_tokens: 10 },
      { ...day('2026-08-09', 2), provider: 'nvidia', feature: 'inspection', calls: 2 },
      day('2026-08-10', 10),
    ]))
    const module = await import('./useAdminAiUsage')
    const settings = ref({ ...seedSettings(), platformVisionPageQuota: 1000, platformNvidiaCallQuota: 20 })
    const usage = module.useAdminAiUsage(settings)
    await module.loadAiUsage()
    const nvidia = usage.usages.value.find((item) => item.provider.id === 'nvidia')!
    expect(nvidia).toMatchObject({ used: 7, quota: 20, remaining: 13, percent: 35, dailyAvg: 1,
      calls: 7, failed: 1, promptTokens: 130, completionTokens: 30 })
    expect(usage.usages.value.find((item) => item.provider.id === 'vision')).toMatchObject({ used: 10, quota: 1000 })
    expect(usage.seriesFor('nvidia').slice(-2)).toEqual([2, 5])
    expect(usage.seriesFor('vision').slice(-2)).toEqual([0, 10])
    settings.value.platformNvidiaCallQuota = 0
    expect(usage.usages.value.find((item) => item.provider.id === 'nvidia')).toMatchObject({ unset: true, level: 'ok', percent: 0 })
  })
})

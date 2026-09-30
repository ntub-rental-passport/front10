import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiUsageDaily } from '@/src/mocks/admin/ai-usage'

const api = vi.hoisted(() => ({ fetchAiUsage: vi.fn() }))

vi.mock('@/src/services/aiUsageApi', () => api)

function day(date: string, units: number): AiUsageDaily {
  return { date, provider: 'vision', units, calls: 1 }
}

function response(daily: AiUsageDaily[]) {
  return { providers: [{ id: 'vision', label: 'Google Cloud Vision', unit: 'page' }], daily }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

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

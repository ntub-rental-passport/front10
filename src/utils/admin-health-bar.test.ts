import { describe, expect, it } from 'vitest'

import { buildHealthBarItems } from './admin-health-bar'
import type { DbPoolSnapshot, RequestSnapshot, ServiceState } from './admin-monitoring'

describe('buildHealthBarItems', () => {
  it('固定回傳三項：資料庫、API 錯誤率、AI 模型（桌機）', () => {
    const items = buildHealthBarItems(null, null)
    expect(items.map((item) => item.id)).toEqual(['db-pool', 'error-rate', 'llm-desktop'])
  })

  describe('資料庫連線池', () => {
    it('讀取失敗（null）顯示無法取得，tone 是 danger，絕不是 ok', () => {
      const [dbPoolItem] = buildHealthBarItems(null, null)
      expect(dbPoolItem?.statusText).toBe('無法取得')
      expect(dbPoolItem?.tone).toBe('danger')
      expect(dbPoolItem?.tone).not.toBe('ok')
    })

    it('後端未設定資料庫時顯示無法取得，tone 是 idle（不是故障，是沒接）', () => {
      const snapshot: DbPoolSnapshot = { configured: false }
      const [dbPoolItem] = buildHealthBarItems(snapshot, null)
      expect(dbPoolItem?.statusText).toBe('無法取得')
      expect(dbPoolItem?.tone).toBe('idle')
    })

    it('讀得到時顯示真實的使用中／總量，tone 依使用率分級', () => {
      const snapshot: DbPoolSnapshot = {
        configured: true,
        size: 10,
        maxOverflow: 5,
        capacity: 15,
        inUse: 3,
        idle: 7,
        overflowInUse: 0,
        utilization: 0.2,
      }
      const [dbPoolItem] = buildHealthBarItems(snapshot, null)
      expect(dbPoolItem?.statusText).toBe('3 / 15')
      expect(dbPoolItem?.tone).toBe('ok')
    })

    it('使用率過高時 tone 升級為 danger，數字仍然是真的（不是無法取得）', () => {
      const snapshot: DbPoolSnapshot = {
        configured: true,
        capacity: 15,
        inUse: 14,
        utilization: 0.93,
      }
      const [dbPoolItem] = buildHealthBarItems(snapshot, null)
      expect(dbPoolItem?.statusText).toBe('14 / 15')
      expect(dbPoolItem?.tone).toBe('danger')
    })
  })

  describe('API 錯誤率', () => {
    it('讀取失敗（null）顯示無法取得，tone 是 danger', () => {
      const [, errorRateItem] = buildHealthBarItems(null, null)
      expect(errorRateItem?.statusText).toBe('無法取得')
      expect(errorRateItem?.tone).toBe('danger')
    })

    it('沒有流量時顯示「—」而不是無法取得——這是讀到的真實結果，不是讀取失敗', () => {
      const snapshot: RequestSnapshot = {
        windowMinutes: 60,
        total: 0,
        clientErrors: 0,
        serverErrors: 0,
        errorRate: 0,
        serverErrorRate: 0,
      }
      const [, errorRateItem] = buildHealthBarItems(null, snapshot)
      expect(errorRateItem?.statusText).toBe('—')
      expect(errorRateItem?.tone).toBe('ok')
    })

    it('有流量時顯示真實的錯誤率百分比', () => {
      const snapshot: RequestSnapshot = {
        windowMinutes: 60,
        total: 100,
        clientErrors: 5,
        serverErrors: 1,
        errorRate: 0.06,
        serverErrorRate: 0.01,
      }
      const [, errorRateItem] = buildHealthBarItems(null, snapshot)
      expect(errorRateItem?.statusText).toBe('1.0%')
      expect(errorRateItem?.tone).toBe('ok')
    })
  })

  describe('AI 模型（桌機）', () => {
    const now = new Date(2026, 8, 27, 12, 0)
    const recent = new Date(now.getTime() - 60_000).toISOString()
    const probe = (overrides: Partial<ServiceState>): ServiceState => ({
      service: 'llm-desktop',
      label: 'AI 模型（桌機）',
      status: 'up',
      since: recent,
      detail: null,
      checkedAt: recent,
      ...overrides,
    })
    const llmOf = (services: ServiceState[] | null) =>
      buildHealthBarItems(null, null, services, now).find((item) => item.id === 'llm-desktop')

    it('讀不到監控數據：無法取得，tone 是 idle，絕不是 ok', () => {
      expect(llmOf(null)).toMatchObject({ statusText: '無法取得', tone: 'idle' })
    })

    it('後端沒設定桌機位址：說「未設定」，不是故障', () => {
      expect(llmOf([])).toMatchObject({ statusText: '未設定', tone: 'idle' })
    })

    it('探測在線才是綠燈', () => {
      expect(llmOf([probe({})])).toMatchObject({ statusText: '在線', tone: 'ok' })
    })

    it('探測連不上：顯示原因，tone 是 danger', () => {
      expect(llmOf([probe({ status: 'down', detail: '連線逾時' })])).toMatchObject({
        statusText: '連線逾時',
        tone: 'danger',
      })
    })
  })
})

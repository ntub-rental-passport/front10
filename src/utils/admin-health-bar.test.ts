import { describe, expect, it } from 'vitest'

import { buildHealthBarItems } from './admin-health-bar'
import type { DbPoolSnapshot, RequestSnapshot } from './admin-monitoring'

describe('buildHealthBarItems', () => {
  it('固定回傳三項：資料庫連線池、API 錯誤率、LLM Provider', () => {
    const items = buildHealthBarItems(null, null)
    expect(items.map((item) => item.id)).toEqual(['db-pool', 'error-rate', 'llm-provider'])
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

  describe('LLM Provider', () => {
    it('目前一律是尚未接上：顯示無法取得，tone 是 idle，絕不是 ok', () => {
      const items = buildHealthBarItems(
        { configured: true, capacity: 10, inUse: 1, utilization: 0.1 },
        { windowMinutes: 60, total: 0, clientErrors: 0, serverErrors: 0, errorRate: 0, serverErrorRate: 0 },
      )
      const llmItem = items.find((item) => item.id === 'llm-provider')
      expect(llmItem?.statusText).toBe('無法取得')
      expect(llmItem?.tone).toBe('idle')
      expect(llmItem?.tone).not.toBe('ok')
    })
  })
})

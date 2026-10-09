import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearContractAnalysis, contractAnalysisKey, readContractAnalysis, writeContractAnalysis } from './contract-analysis-cache'

describe('契約分析結果重用', () => {
  beforeEach(() => {
    const data = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    })
    clearContractAnalysis()
  })
  afterEach(() => { clearContractAnalysis(); vi.unstubAllGlobals() })

  it('同一工作階段與內容可重用，修改欄位、文字或換契約不會誤用舊結果', async () => {
    const body = { ocr_text: '契約', page_texts: ['契約'], field_reviews: { rent: { value: '18000' } } }
    const key = await contractAnalysisKey('review-1', JSON.stringify(body))
    const result = { state: 'ok' as const, ragRisks: [], aiRisks: [{ title: '測試風險' }] }
    writeContractAnalysis(key, result)
    expect(readContractAnalysis(await contractAnalysisKey('review-1', JSON.stringify(body)))).toEqual(result)
    for (const changed of [
      { ...body, ocr_text: '已修改契約' },
      { ...body, page_texts: ['已修改頁面'] },
      { ...body, field_reviews: { rent: { value: '20000' } } },
    ]) expect(readContractAnalysis(await contractAnalysisKey('review-1', JSON.stringify(changed)))).toBeNull()
    expect(readContractAnalysis(await contractAnalysisKey('review-2', JSON.stringify(body)))).toBeNull()
  })

  it('重新載入模組仍讀取本分頁暫存，清除後不再重用', async () => {
    const result = { state: 'ok' as const, ragRisks: [], aiRisks: [] }
    writeContractAnalysis('key', result)
    vi.resetModules()
    const reloaded = await import('./contract-analysis-cache')
    expect(reloaded.readContractAnalysis('key')).toEqual(result)
    reloaded.clearContractAnalysis()
    expect(reloaded.readContractAnalysis('key')).toBeNull()
  })

  it('保留失敗狀態供明確重試，儲存空間不足仍可返回既有結果', () => {
    vi.stubGlobal('sessionStorage', { setItem: () => { throw new Error('quota') }, getItem: () => { throw new Error('disabled') } })
    const failure = { state: 'failed' as const, message: '請重試' }
    writeContractAnalysis('key', failure)
    expect(readContractAnalysis('key')).toEqual(failure)
    writeContractAnalysis('key', { state: 'ok', ragRisks: [], aiRisks: [] })
    expect(readContractAnalysis('key')?.state).toBe('ok')
    clearContractAnalysis()
    expect(readContractAnalysis('key')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { fetchRows, validateRows } from '../../scripts/update-taipei-garbage'
import { TAIPEI_DISTRICTS } from './garbage'
const rows = TAIPEI_DISTRICTS.map((行政區) => ({
  行政區,
  里別: '測試里',
  分隊: '測試',
  局編: '1',
  車號: 'ABC',
  路線: '測試',
  車次: '第1車',
  抵達時間: '1800',
  離開時間: '1805',
  地點: 行政區 + '測試街',
  經度: '121.53',
  緯度: '25.03',
}))
describe('official data refresh guards', () => {
  it('validates all districts and escapes CSV fields', () => {
    expect(validateRows(rows, 12).rows).toBe(12)
    expect(validateRows(rows, 12).invalidCoordinates).toBe(0)
  })
  it('rejects missing pages, districts, duplicates and dangerous count changes', () => {
    expect(() => validateRows(rows.slice(1), 12)).toThrow('districts')
    expect(() => validateRows([...rows, rows[0]], 12)).toThrow('Duplicate')
    expect(() => validateRows(rows, 4000)).toThrow('20%')
  })
  it('rejects malformed times and missing source fields', () => {
    expect(() =>
      validateRows(
        rows.map((r) => ({ ...r, 抵達時間: '9999' })),
        12,
      ),
    ).toThrow()
    expect(() =>
      validateRows(
        rows.map((r) => ({ 行政區: r.行政區 })),
        12,
      ),
    ).toThrow('columns')
  })
  it('reads more than a hardcoded five pages', async () => {
    let calls = 0
    const mock = (async () => {
      calls++
      return new Response(JSON.stringify({ result: { count: 6, results: [{ _id: calls }] } }))
    }) as typeof fetch
    expect(await fetchRows(mock)).toHaveLength(6)
    expect(calls).toBe(6)
  })
  it('rejects empty pages and changes to total count during fetching', async () => {
    await expect(
      fetchRows(
        (async () =>
          new Response(JSON.stringify({ result: { count: 12, results: [] } }))) as typeof fetch,
      ),
    ).rejects.toThrow('page')
    let n = 0
    await expect(
      fetchRows(
        (async () =>
          new Response(
            JSON.stringify({ result: { count: ++n + 1, results: [{}] } }),
          )) as typeof fetch,
      ),
    ).rejects.toThrow('changed')
  })
})

import { describe, expect, it } from 'vitest'
import { resolvePhase } from './phase'

const base = { published: true, startAt: '2026-08-01T00:00:00.000Z', endAt: null as string | null }
const now = new Date('2026-08-15T00:00:00.000Z')

describe('resolvePhase', () => {
  it('未發布一律是草稿，即使日期在區間內', () => {
    expect(resolvePhase({ ...base, published: false }, now)).toBe('draft')
  })

  it('開始時間還沒到是排程中', () => {
    expect(resolvePhase({ ...base, startAt: '2026-08-20T00:00:00.000Z' }, now)).toBe('scheduled')
  })

  it('結束時間已過是已過期', () => {
    expect(
      resolvePhase({ ...base, startAt: '2026-08-01T00:00:00.000Z', endAt: '2026-08-10T00:00:00.000Z' }, now),
    ).toBe('expired')
  })

  it('沒有結束時間的已發布內容持續生效', () => {
    expect(resolvePhase({ ...base, endAt: null }, now)).toBe('active')
  })

  it('落在區間內是生效中', () => {
    expect(
      resolvePhase({ ...base, startAt: '2026-08-10T00:00:00.000Z', endAt: '2026-08-20T00:00:00.000Z' }, now),
    ).toBe('active')
  })

  it('now 正好等於 startAt 視為生效', () => {
    expect(resolvePhase({ ...base, startAt: now.toISOString() }, now)).toBe('active')
  })

  it('now 正好等於 endAt 視為生效', () => {
    expect(resolvePhase({ ...base, endAt: now.toISOString() }, now)).toBe('active')
  })

  it('不限公告：任何符合 Schedulable 形狀的物件都適用（例如輪播）', () => {
    const banner = { published: true, startAt: '2026-08-01T00:00:00.000Z', endAt: null, imageUrl: 'x', title: 'y' }
    expect(resolvePhase(banner, now)).toBe('active')
  })
})

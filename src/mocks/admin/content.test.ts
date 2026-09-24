import { describe, expect, it } from 'vitest'
import { migrateBannerSchedule, type Banner } from './content'

function make(overrides: Partial<Banner> = {}): Banner {
  return {
    id: 'ban-x',
    title: 't',
    imageUrl: 'https://example.com/a.png',
    linkUrl: '/app/subsidy',
    order: 0,
    published: true,
    startAt: '2026-07-01T00:00:00.000Z',
    endAt: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('migrateBannerSchedule', () => {
  it('缺少 startAt 的舊資料補成 updatedAt', () => {
    const legacy = [
      { ...make(), updatedAt: '2026-05-01T00:00:00.000Z', startAt: undefined as unknown as string },
    ]
    const migrated = migrateBannerSchedule(legacy)
    expect(migrated[0].startAt).toBe('2026-05-01T00:00:00.000Z')
  })

  it('缺少 startAt 的舊資料 endAt 補 null（長期）', () => {
    const legacy = [{ ...make(), startAt: undefined as unknown as string, endAt: undefined as unknown as string | null }]
    expect(migrateBannerSchedule(legacy)[0].endAt).toBeNull()
  })

  it('已經有 startAt 的資料維持原值，不會被 updatedAt 蓋掉', () => {
    const current = [make({ startAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' })]
    expect(migrateBannerSchedule(current)[0].startAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('已經有 endAt 的資料維持原值', () => {
    const current = [make({ startAt: '2026-01-01T00:00:00.000Z', endAt: '2026-02-01T00:00:00.000Z' })]
    expect(migrateBannerSchedule(current)[0].endAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('不會動到其他欄位', () => {
    const legacy = [
      { ...make({ id: 'ban-9', title: '特價活動' }), startAt: undefined as unknown as string },
    ]
    const migrated = migrateBannerSchedule(legacy)
    expect(migrated[0].id).toBe('ban-9')
    expect(migrated[0].title).toBe('特價活動')
  })

  it('補完之後行為跟只看 published 時一模一樣：published 的舊資料補完仍是現在生效中', async () => {
    const { resolvePhase } = await import('@/src/utils/phase')
    const legacy = [{ ...make({ published: true }), startAt: undefined as unknown as string }]
    const migrated = migrateBannerSchedule(legacy)
    expect(resolvePhase(migrated[0], new Date())).toBe('active')
  })
})

import { describe, expect, it } from 'vitest'
import { BUILTIN_BANNER_IMAGES } from '@/src/utils/banner-url'
import {
  migrateBannerImages,
  migrateBannerSchedule,
  migrateHandoverRelaunch,
  seedBanners,
  type Banner,
} from './content'

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

describe('seedBanners', () => {
  it('種子資料只用網站內建的圖片（正式站的安全設定擋掉外部圖床）', () => {
    const builtin = BUILTIN_BANNER_IMAGES.map((image) => image.url) as string[]
    for (const banner of seedBanners()) {
      expect(builtin, banner.id).toContain(banner.imageUrl)
    }
  })
})

describe('migrateBannerImages', () => {
  it('瀏覽器裡還是舊種子的 Unsplash 網址，換成內建圖片', () => {
    const legacy = [
      make({
        id: 'ban-2',
        imageUrl: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200&h=400&fit=crop&crop=center',
      }),
    ]
    expect(migrateBannerImages(legacy)[0].imageUrl).toBe('/banners/contract.webp')
  })

  it('更早的 placehold.co 佔位圖也換成內建圖片', () => {
    const legacy = [make({ id: 'ban-1', imageUrl: 'https://placehold.co/1200x400?text=Banner' })]
    expect(migrateBannerImages(legacy)[0].imageUrl).toBe('/banners/subsidy.webp')
  })

  it('管理員自己換過的網址不動', () => {
    const custom = [make({ id: 'ban-1', imageUrl: 'https://example.com/mine.png' })]
    expect(migrateBannerImages(custom)[0].imageUrl).toBe('https://example.com/mine.png')
  })
})

describe('migrateHandoverRelaunch', () => {
  it('舊種子的「點交存證（下架中）」改成上架', () => {
    const legacy = [make({ id: 'ban-3', title: '點交存證（下架中）', published: false })]
    const [migrated] = migrateHandoverRelaunch(legacy)
    expect(migrated.title).toBe('點交存證')
    expect(migrated.published).toBe(true)
  })

  it('管理員改過標題的不動', () => {
    const edited = [make({ id: 'ban-3', title: '點交存證教學', published: false })]
    expect(migrateHandoverRelaunch(edited)[0]).toEqual(edited[0])
  })

  it('重新上架後管理員又把它下架，下次載入不會被打開', () => {
    const unpublished = [make({ id: 'ban-3', title: '點交存證', published: false })]
    expect(migrateHandoverRelaunch(unpublished)[0].published).toBe(false)
  })
})

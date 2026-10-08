import { describe, expect, it } from 'vitest'
import type { BannerImage } from '@/src/services/bannerImageApi'
import { buildBannerLibrary, isLibraryFull } from './banner-library'
import { BUILTIN_BANNER_IMAGES } from './banner-url'

function uploadedImage(name: string, usedBy: BannerImage['usedBy'] = []): BannerImage {
  return {
    name,
    url: `/api/content/banner-images/${name}`,
    size: 123456,
    uploadedAt: 1791437579,
    usedBy,
    deletable: usedBy.length === 0,
  }
}

describe('buildBannerLibrary', () => {
  it('內建圖依常數順序在前，上傳圖保留 API 順序', () => {
    const uploads = [uploadedImage('new.webp'), uploadedImage('old.webp')]
    const entries = buildBannerLibrary(uploads, [])
    expect(entries.map(({ url }) => url)).toEqual([
      ...BUILTIN_BANNER_IMAGES.map(({ url }) => url),
      ...uploads.map(({ url }) => url),
    ])
    expect(entries.map(({ key }) => key)).toEqual([
      ...BUILTIN_BANNER_IMAGES.map(({ url }) => url),
      'new.webp',
      'old.webp',
    ])
    expect(entries.map(({ label }) => label)).toEqual([
      ...BUILTIN_BANNER_IMAGES.map(({ label }) => label),
      'new.webp',
      'old.webp',
    ])
  })

  it('內建圖只計算網址完全相同的本地輪播，且永遠不能刪除', () => {
    const url = BUILTIN_BANNER_IMAGES[0].url
    const entries = buildBannerLibrary([], [
      { id: 'ban-1', title: 'A', imageUrl: url },
      { id: 'ban-2', title: 'B', imageUrl: url },
      { id: 'ban-3', title: 'C', imageUrl: `https://example.com${url}` },
    ])
    expect(entries[0]?.usedBy).toEqual([{ id: 'ban-1', title: 'A' }, { id: 'ban-2', title: 'B' }])
    expect(entries[1]?.usedBy).toEqual([])
    for (const entry of entries) {
      expect(entry.builtin).toBe(true)
      expect(entry.deletable).toBe(false)
      expect(entry.blockedReason).toBe('內建圖片不能刪除')
    }
  })

  it('上傳圖使用 API 的引用清單，不以本地輪播或 deletable 欄位覆蓋', () => {
    const used = uploadedImage('used.webp', [{ id: 'remote', title: '遠端輪播' }])
    const unused = uploadedImage('unused.webp')
    used.deletable = true
    unused.deletable = false
    const entries = buildBannerLibrary([used, unused], [
      { id: 'local', title: '本地輪播', imageUrl: unused.url },
    ]).filter(({ builtin }) => !builtin)
    expect(entries[0]?.usedBy).toEqual(used.usedBy)
    expect(entries[0]?.deletable).toBe(false)
    expect(entries[0]?.blockedReason).toBe('還有 1 則輪播在用：「遠端輪播」')
    expect(entries[1]?.usedBy).toEqual([])
    expect(entries[1]?.deletable).toBe(true)
    expect(entries[1]?.blockedReason).toBeUndefined()
  })

  it.each([
    [2, '還有 2 則輪播在用：「A」、「B」'],
    [3, '還有 3 則輪播在用：「A」、「B」、「C」'],
    [5, '還有 5 則輪播在用：「A」、「B」、「C」等 5 則'],
  ])('引用 %i 則時最多顯示三個標題', (count, reason) => {
    const usedBy = ['A', 'B', 'C', 'D', 'E'].slice(0, count).map((title) => ({ id: title, title }))
    const entry = buildBannerLibrary([uploadedImage('used.webp', usedBy)], []).at(-1)
    expect(entry?.blockedReason).toBe(reason)
  })
})

describe('isLibraryFull', () => {
  it.each([[0, 30, false], [29, 30, false], [30, 30, true], [31, 30, true], [2, 2, true]])(
    '%i / %i 的滿額狀態是 %s',
    (count, limit, full) => expect(isLibraryFull(count, limit)).toBe(full),
  )
})

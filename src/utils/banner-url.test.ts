import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BUILTIN_BANNER_IMAGES, isValidImageUrl } from './banner-url'

describe('isValidImageUrl', () => {
  it('接受 https 網址', () => {
    expect(isValidImageUrl('https://placehold.co/1200x400')).toBe(true)
  })

  it('接受 http 網址', () => {
    expect(isValidImageUrl('http://example.com/a.png')).toBe(true)
  })

  it('拒絕空字串', () => {
    expect(isValidImageUrl('')).toBe(false)
  })

  it('拒絕只有空白', () => {
    expect(isValidImageUrl('   ')).toBe(false)
  })

  it('拒絕缺少協定的字串', () => {
    expect(isValidImageUrl('example.com/a.png')).toBe(false)
  })

  it('拒絕不是網址的亂打文字', () => {
    expect(isValidImageUrl('not a url')).toBe(false)
  })

  it('拒絕非 http(s) 協定（例如 javascript:）', () => {
    expect(isValidImageUrl('javascript:alert(1)')).toBe(false)
  })

  it('前後空白不影響判斷', () => {
    expect(isValidImageUrl('  https://example.com/a.png  ')).toBe(true)
  })

  it('接受站內路徑（public/ 底下的內建圖片）', () => {
    expect(isValidImageUrl('/banners/subsidy.webp')).toBe(true)
  })

  it('拒絕 // 開頭、省略協定的外部網址', () => {
    expect(isValidImageUrl('//example.com/a.png')).toBe(false)
  })

  it('拒絕 /\\ 開頭、瀏覽器會當成外部網站的寫法', () => {
    expect(isValidImageUrl('/\\example.com/a.png')).toBe(false)
  })
})

describe('BUILTIN_BANNER_IMAGES', () => {
  it('每張內建圖片在 public/ 裡都有檔案，檔名打錯會在這裡抓到', () => {
    for (const image of BUILTIN_BANNER_IMAGES) {
      const file = fileURLToPath(new URL(`../../public${image.url}`, import.meta.url))
      expect(existsSync(file), image.url).toBe(true)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { isValidImageUrl } from './banner-url'

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
})

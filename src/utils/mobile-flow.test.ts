import { describe, expect, it } from 'vitest'
import { hasInAppHistory } from './mobile-flow'

describe('手機流程的站內返回紀錄', () => {
  it.each(['/app', '/app/contract/scanner?source=upload', '/app/contract/editor#rent', '/login'])(
    '%s 可使用 router.back', (path) => {
      expect(hasInAppHistory(path)).toBe(true)
    },
  )

  it.each([null, undefined, '', 1, {}, 'https://example.com/app', '//example.com/app'])(
    '%s 不可視為站內返回紀錄', (back) => {
      expect(hasInAppHistory(back)).toBe(false)
    },
  )
})

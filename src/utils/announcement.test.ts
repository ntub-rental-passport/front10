import { describe, expect, it } from 'vitest'
import { isAnnouncementActive } from './announcement'
import type { Announcement } from '@/src/mocks/admin/content'

function make(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a',
    title: 't',
    body: 'b',
    level: 'info',
    published: true,
    startAt: '2026-07-01T00:00:00.000Z',
    endAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const now = new Date('2026-07-15T00:00:00.000Z')

describe('isAnnouncementActive', () => {
  it('已發布且在區間內為生效', () => {
    expect(isAnnouncementActive(make(), now)).toBe(true)
  })

  it('未發布一律不生效', () => {
    expect(isAnnouncementActive(make({ published: false }), now)).toBe(false)
  })

  it('尚未到 startAt 不生效', () => {
    expect(isAnnouncementActive(make({ startAt: '2026-07-20T00:00:00.000Z' }), now)).toBe(false)
  })

  it('已超過 endAt 不生效', () => {
    expect(isAnnouncementActive(make({ endAt: '2026-07-10T00:00:00.000Z' }), now)).toBe(false)
  })

  it('endAt 為 null 表示永久有效', () => {
    expect(isAnnouncementActive(make({ endAt: null }), now)).toBe(true)
  })

  it('now 正好等於 startAt 視為生效', () => {
    expect(isAnnouncementActive(make({ startAt: '2026-07-15T00:00:00.000Z' }), now)).toBe(true)
  })

  it('now 正好等於 endAt 視為生效', () => {
    expect(isAnnouncementActive(make({ endAt: '2026-07-15T00:00:00.000Z' }), now)).toBe(true)
  })
})

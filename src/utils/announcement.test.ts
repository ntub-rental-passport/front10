import { describe, expect, it } from 'vitest'
import {
  announcementDismissKey,
  isAnnouncementActive,
  isAnnouncementDismissed,
  isAnnouncementVisibleToTenant,
  isDashboardAnnouncementLevel,
  migrateAnnouncements,
} from './announcement'
import type { Announcement } from '@/src/mocks/admin/content'

function make(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a',
    title: 't',
    body: 'b',
    level: 'info',
    audience: 'all',
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

describe('isAnnouncementVisibleToTenant', () => {
  it('audience 為 all 對租客可見', () => {
    expect(isAnnouncementVisibleToTenant(make({ audience: 'all' }))).toBe(true)
  })

  it('audience 為 tenant 對租客可見', () => {
    expect(isAnnouncementVisibleToTenant(make({ audience: 'tenant' }))).toBe(true)
  })

  it('audience 為 landlord 對租客不可見', () => {
    expect(isAnnouncementVisibleToTenant(make({ audience: 'landlord' }))).toBe(false)
  })
})

describe('migrateAnnouncements', () => {
  it('缺少 audience 的舊資料補上 all', () => {
    const legacy = [make({ audience: undefined as unknown as Announcement['audience'] })]
    expect(migrateAnnouncements(legacy)[0].audience).toBe('all')
  })

  it('已經有 audience 的資料維持原值', () => {
    const current = [make({ audience: 'landlord' })]
    expect(migrateAnnouncements(current)[0].audience).toBe('landlord')
  })

  it('不會動到其他欄位', () => {
    const legacy = [make({ id: 'an-x', audience: undefined as unknown as Announcement['audience'] })]
    expect(migrateAnnouncements(legacy)[0].id).toBe('an-x')
  })
})

describe('isDashboardAnnouncementLevel', () => {
  it('urgent 顯示於首頁', () => {
    expect(isDashboardAnnouncementLevel('urgent')).toBe(true)
  })

  it('warning 顯示於首頁', () => {
    expect(isDashboardAnnouncementLevel('warning')).toBe(true)
  })

  it('info 不顯示於首頁（仍會出現在通知中心）', () => {
    expect(isDashboardAnnouncementLevel('info')).toBe(false)
  })
})

describe('announcementDismissKey / isAnnouncementDismissed', () => {
  it('key 由 id 與 updatedAt 組成', () => {
    const a = make({ id: 'an-9', updatedAt: '2026-07-01T00:00:00.000Z' })
    expect(announcementDismissKey(a)).toBe('an-9:2026-07-01T00:00:00.000Z')
  })

  it('關閉後不再顯示', () => {
    const a = make({ id: 'an-9' })
    const dismissedKeys = [announcementDismissKey(a)]
    expect(isAnnouncementDismissed(dismissedKeys, a)).toBe(true)
  })

  it('管理員更新公告後（updatedAt 改變）已關閉的公告重新出現', () => {
    const original = make({ id: 'an-9', updatedAt: '2026-07-01T00:00:00.000Z' })
    const dismissedKeys = [announcementDismissKey(original)]
    const updated = make({ id: 'an-9', updatedAt: '2026-07-02T00:00:00.000Z' })
    expect(isAnnouncementDismissed(dismissedKeys, updated)).toBe(false)
  })

  it('不同使用者的關閉紀錄互不影響', () => {
    const a = make({ id: 'an-9' })
    const userAKeys = [announcementDismissKey(a)]
    const userBKeys: string[] = []
    expect(isAnnouncementDismissed(userAKeys, a)).toBe(true)
    expect(isAnnouncementDismissed(userBKeys, a)).toBe(false)
  })
})

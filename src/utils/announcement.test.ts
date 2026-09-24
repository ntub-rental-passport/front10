import { describe, expect, it } from 'vitest'
import {
  announcementDismissKey,
  announcementPlacement,
  announcementPlacementSummary,
  formatAnnouncementShortDate,
  isAnnouncementActive,
  isAnnouncementDismissed,
  isAnnouncementVisibleToTenant,
  isDashboardAnnouncementLevel,
  migrateAnnouncements,
  resolveAnnouncementPhase,
  type AnnouncementPlacement,
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

describe('resolveAnnouncementPhase', () => {
  const base = {
    id: 'an-1',
    title: '公告',
    body: '內文',
    level: 'info' as const,
    audience: 'all' as const,
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
  const now = new Date('2026-08-15T00:00:00.000Z')

  it('未發布一律是草稿，即使日期在區間內', () => {
    const phase = resolveAnnouncementPhase(
      { ...base, published: false, startAt: '2026-08-10T00:00:00.000Z', endAt: null },
      now,
    )
    expect(phase).toBe('draft')
  })

  it('開始時間還沒到是排程中', () => {
    const phase = resolveAnnouncementPhase(
      { ...base, published: true, startAt: '2026-08-20T00:00:00.000Z', endAt: null },
      now,
    )
    expect(phase).toBe('scheduled')
  })

  it('結束時間已過是已過期', () => {
    const phase = resolveAnnouncementPhase(
      {
        ...base,
        published: true,
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-08-10T00:00:00.000Z',
      },
      now,
    )
    expect(phase).toBe('expired')
  })

  it('沒有結束時間的已發布公告持續生效', () => {
    const phase = resolveAnnouncementPhase(
      { ...base, published: true, startAt: '2026-08-01T00:00:00.000Z', endAt: null },
      now,
    )
    expect(phase).toBe('active')
  })

  it('落在區間內是生效中', () => {
    const phase = resolveAnnouncementPhase(
      {
        ...base,
        published: true,
        startAt: '2026-08-10T00:00:00.000Z',
        endAt: '2026-08-20T00:00:00.000Z',
      },
      now,
    )
    expect(phase).toBe('active')
  })
})

describe('announcementPlacement', () => {
  const now = new Date('2026-09-24T00:00:00.000Z')

  describe('audience 為 landlord：優先於狀態，任何狀態都判定成沒有人讀取', () => {
    it('已發布、日期在區間內仍是 landlord-unsupported，不是 active', () => {
      const a = make({
        audience: 'landlord',
        level: 'warning',
        published: true,
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: '2026-09-30T00:00:00.000Z',
      })
      expect(announcementPlacement(a, now)).toEqual({ kind: 'landlord-unsupported' })
    })

    it('草稿狀態的房東公告是 landlord-unsupported，不是 unpublished', () => {
      const a = make({ audience: 'landlord', published: false })
      expect(announcementPlacement(a, now)).toEqual({ kind: 'landlord-unsupported' })
    })

    it('排程中的房東公告是 landlord-unsupported，不是 scheduled', () => {
      const a = make({
        audience: 'landlord',
        published: true,
        startAt: '2026-10-01T00:00:00.000Z',
        endAt: null,
      })
      expect(announcementPlacement(a, now)).toEqual({ kind: 'landlord-unsupported' })
    })

    it('已過期的房東公告是 landlord-unsupported，不是 expired', () => {
      const a = make({
        audience: 'landlord',
        published: true,
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-09-01T00:00:00.000Z',
      })
      expect(announcementPlacement(a, now)).toEqual({ kind: 'landlord-unsupported' })
    })
  })

  describe('audience 為 all／tenant：由狀態與等級決定出現在哪', () => {
    it('草稿的 warning 不會出現', () => {
      const a = make({ audience: 'all', level: 'warning', published: false })
      expect(announcementPlacement(a, now)).toEqual({ kind: 'unpublished' })
    })

    it('草稿狀態跟等級無關，info／urgent 一樣是 unpublished', () => {
      expect(
        announcementPlacement(make({ audience: 'tenant', level: 'info', published: false }), now).kind,
      ).toBe('unpublished')
      expect(
        announcementPlacement(make({ audience: 'all', level: 'urgent', published: false }), now).kind,
      ).toBe('unpublished')
    })

    it('已過期的 urgent 不會出現（bug 修好前，展開列預覽就是把這個組合講成「會出現在儀表板」）', () => {
      const a = make({
        audience: 'all',
        level: 'urgent',
        published: true,
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-08-10T00:00:00.000Z',
      })
      expect(announcementPlacement(a, now)).toEqual({ kind: 'expired' })
    })

    it('已過期狀態跟等級無關，info／warning 一樣是 expired', () => {
      const base = {
        audience: 'tenant' as const,
        published: true,
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-08-10T00:00:00.000Z',
      }
      expect(announcementPlacement(make({ ...base, level: 'info' }), now).kind).toBe('expired')
      expect(announcementPlacement(make({ ...base, level: 'warning' }), now).kind).toBe('expired')
    })

    it('排程中的 warning 會帶開始時間，且會出現在儀表板＋通知中心', () => {
      const a = make({
        audience: 'all',
        level: 'warning',
        published: true,
        startAt: '2026-09-30T00:00:00.000Z',
        endAt: null,
      })
      expect(announcementPlacement(a, now)).toEqual({
        kind: 'scheduled',
        startAt: '2026-09-30T00:00:00.000Z',
        locations: ['dashboard-banner', 'notification-center'],
      })
    })

    it('排程中的 urgent 也會出現在儀表板＋通知中心', () => {
      const a = make({
        audience: 'tenant',
        level: 'urgent',
        published: true,
        startAt: '2026-10-05T00:00:00.000Z',
        endAt: null,
      })
      expect(announcementPlacement(a, now)).toEqual({
        kind: 'scheduled',
        startAt: '2026-10-05T00:00:00.000Z',
        locations: ['dashboard-banner', 'notification-center'],
      })
    })

    it('排程中的 info 只會出現在通知中心', () => {
      const a = make({
        audience: 'all',
        level: 'info',
        published: true,
        startAt: '2026-10-01T00:00:00.000Z',
        endAt: null,
      })
      expect(announcementPlacement(a, now)).toEqual({
        kind: 'scheduled',
        startAt: '2026-10-01T00:00:00.000Z',
        locations: ['notification-center'],
      })
    })

    it('生效中的 info 只在通知中心', () => {
      const a = make({
        audience: 'all',
        level: 'info',
        published: true,
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: null,
      })
      expect(announcementPlacement(a, now)).toEqual({
        kind: 'live',
        locations: ['notification-center'],
      })
    })

    it('生效中的 warning 兩個地方都有', () => {
      const a = make({
        audience: 'tenant',
        level: 'warning',
        published: true,
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: null,
      })
      expect(announcementPlacement(a, now)).toEqual({
        kind: 'live',
        locations: ['dashboard-banner', 'notification-center'],
      })
    })

    it('生效中的 urgent 兩個地方都有', () => {
      const a = make({
        audience: 'all',
        level: 'urgent',
        published: true,
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: '2026-09-30T00:00:00.000Z',
      })
      expect(announcementPlacement(a, now)).toEqual({
        kind: 'live',
        locations: ['dashboard-banner', 'notification-center'],
      })
    })

    it('audience 為 tenant 與 all 判斷結果一致（只有 landlord 特殊）', () => {
      const base = {
        level: 'warning' as const,
        published: true,
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: null,
      }
      expect(announcementPlacement(make({ ...base, audience: 'all' }), now)).toEqual(
        announcementPlacement(make({ ...base, audience: 'tenant' }), now),
      )
    })
  })
})

describe('announcementPlacementSummary', () => {
  it('landlord-unsupported：講清楚原因是房東端尚未讀取公告', () => {
    const placement: AnnouncementPlacement = { kind: 'landlord-unsupported' }
    expect(announcementPlacementSummary(placement)).toBe('不會出現在任何地方 —— 房東端尚未讀取公告')
  })

  it('unpublished', () => {
    expect(announcementPlacementSummary({ kind: 'unpublished' })).toBe('未發布 —— 不會出現')
  })

  it('expired', () => {
    expect(announcementPlacementSummary({ kind: 'expired' })).toBe('已過期 —— 目前不會出現')
  })

  it('scheduled，儀表板＋通知中心：帶「M/D 起」前綴', () => {
    const placement: AnnouncementPlacement = {
      kind: 'scheduled',
      startAt: '2026-09-30T00:00:00.000Z',
      locations: ['dashboard-banner', 'notification-center'],
    }
    expect(announcementPlacementSummary(placement)).toBe('9/30 起：儀表板橫幅＋通知中心')
  })

  it('scheduled，只有通知中心', () => {
    const placement: AnnouncementPlacement = {
      kind: 'scheduled',
      startAt: '2026-10-05T00:00:00.000Z',
      locations: ['notification-center'],
    }
    expect(announcementPlacementSummary(placement)).toBe('10/5 起：只在通知中心')
  })

  it('live，儀表板＋通知中心', () => {
    const placement: AnnouncementPlacement = {
      kind: 'live',
      locations: ['dashboard-banner', 'notification-center'],
    }
    expect(announcementPlacementSummary(placement)).toBe('儀表板橫幅＋通知中心')
  })

  it('live，只在通知中心', () => {
    const placement: AnnouncementPlacement = { kind: 'live', locations: ['notification-center'] }
    expect(announcementPlacementSummary(placement)).toBe('只在通知中心')
  })
})

describe('formatAnnouncementShortDate', () => {
  it('不補零、不帶年份的 M/D', () => {
    expect(formatAnnouncementShortDate('2026-09-30T00:00:00.000Z')).toBe('9/30')
    expect(formatAnnouncementShortDate('2026-01-05T00:00:00.000Z')).toBe('1/5')
  })
})

import type { Announcement, AnnouncementLevel } from '@/src/mocks/admin/content'

export function isAnnouncementActive(a: Announcement, now: Date): boolean {
  if (!a.published) return false
  const current = now.getTime()
  if (current < new Date(a.startAt).getTime()) return false
  if (a.endAt !== null && current > new Date(a.endAt).getTime()) return false
  return true
}

/** 租客端（首頁、通知中心）只該看到跟自己身分有關的公告，房東專屬的公告不該混進來。 */
export function isAnnouncementVisibleToTenant(a: Announcement): boolean {
  return a.audience === 'all' || a.audience === 'tenant'
}

/** 舊資料沒有 audience 欄位，一律視為原本的行為：對所有人顯示。 */
export function migrateAnnouncements(list: Announcement[]): Announcement[] {
  return list.map((item) => (item.audience ? item : { ...item, audience: 'all' }))
}

/**
 * 首頁只放得下最緊急的訊息——一般公告仍在通知中心看得到，
 * 不需要在租客一登入就霸佔最上方的版面。
 */
export function isDashboardAnnouncementLevel(level: AnnouncementLevel): boolean {
  return level === 'urgent' || level === 'warning'
}

/**
 * 關閉狀態的 key 用「id + updatedAt」而非單純 id：
 * 管理員改了公告內容後 updatedAt 會變，先前關閉過的舊版本不該繼續蓋住新內容，
 * 這樣使用者才會重新看到已更新的公告。
 */
export function announcementDismissKey(a: Pick<Announcement, 'id' | 'updatedAt'>): string {
  return `${a.id}:${a.updatedAt}`
}

export function isAnnouncementDismissed(
  dismissedKeys: string[],
  a: Pick<Announcement, 'id' | 'updatedAt'>,
): boolean {
  return dismissedKeys.includes(announcementDismissKey(a))
}

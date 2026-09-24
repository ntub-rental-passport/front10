import type { Announcement, AnnouncementLevel } from '@/src/mocks/admin/content'
import { resolvePhase, type Phase } from './phase'

export function isAnnouncementActive(a: Announcement, now: Date): boolean {
  if (!a.published) return false
  const current = now.getTime()
  if (current < new Date(a.startAt).getTime()) return false
  if (a.endAt !== null && current > new Date(a.endAt).getTime()) return false
  return true
}

/**
 * 後台列表原本只顯示日期區間，看不出「現在生效中／已過期／還沒開始」，
 * seed 資料因此把「（已過期）」寫進標題來補救——那是介面沒把話說完的徵兆。
 *
 * 這組「草稿／排程／生效／過期」狀態機後來被輪播也需要，核心邏輯已經抽到
 * ./phase（Phase / resolvePhase）。這裡留著 AnnouncementPhase 這個型別名稱
 * 與 resolveAnnouncementPhase 這個函式名稱，純粹是因為既有的 import（
 * StatusBadge、AnnouncementsTab…）已經在用這兩個名字，沒有理由為了內部
 * 換了實作就逼所有呼叫端跟著改名。
 */
export type AnnouncementPhase = Phase

export function resolveAnnouncementPhase(a: Announcement, now: Date): AnnouncementPhase {
  return resolvePhase(a, now)
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

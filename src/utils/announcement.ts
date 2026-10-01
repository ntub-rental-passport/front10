import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementLevel,
} from '@/src/mocks/admin/content'
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

/**
 * 這則內容該不該出現在某一端。公告與輪播共用同一組對象（全部／租客／房東），
 * 所以判斷也共用一份：`all` 兩邊都看得到，其餘只給指定的那一端。
 */
export function matchesAudience(
  audience: AnnouncementAudience,
  side: 'tenant' | 'landlord',
): boolean {
  return audience === 'all' || audience === side
}

/** 租客端（首頁、通知中心）只該看到跟自己身分有關的公告，房東專屬的公告不該混進來。 */
export function isAnnouncementVisibleToTenant(a: Announcement): boolean {
  return matchesAudience(a.audience, 'tenant')
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

/** 一則公告實際可能出現的地方。租客首頁、通知中心與房東通知都會讀公告——見 announcementPlacement 的說明。 */
export type AnnouncementLocation = 'dashboard-banner' | 'notification-center' | 'landlord-bell'

/**
 * 這則公告「實際」會出現在哪裡——唯一的判斷來源。後台列表、預覽面板都該呼叫
 * 這裡，不要各自重寫一套：舊版展開列的預覽只看 isDashboardAnnouncementLevel，
 * 完全沒看狀態（草稿／已過期）也沒看受眾（房東），已過期的緊急公告因此被
 * 講成「會出現在儀表板」——那則公告根本沒在任何地方出現。
 */
export type AnnouncementPlacement =
  | { kind: 'unpublished' }
  | { kind: 'expired' }
  | { kind: 'scheduled'; startAt: string; locations: AnnouncementLocation[] }
  | { kind: 'live'; locations: AnnouncementLocation[] }

type PlaceableAnnouncement = Pick<
  Announcement,
  'audience' | 'published' | 'startAt' | 'endAt' | 'level'
>

/**
 * 2026-10-01 房東鈴鐺完成後，房東公告也有實際入口；所有受眾先依發布日期判斷。
 * 生效或排程公告依受眾決定位置：租客通知中心、房東通知；租客端的 warning／urgent
 * 另外顯示儀表板橫幅，避免一般公告佔滿首頁。
 */
export function announcementPlacement(a: PlaceableAnnouncement, now: Date): AnnouncementPlacement {
  const phase = resolvePhase(a, now)
  if (phase === 'draft') return { kind: 'unpublished' }
  if (phase === 'expired') return { kind: 'expired' }

  const locations: AnnouncementLocation[] = []
  if (matchesAudience(a.audience, 'tenant')) {
    if (isDashboardAnnouncementLevel(a.level)) locations.push('dashboard-banner')
    locations.push('notification-center')
  }
  if (matchesAudience(a.audience, 'landlord')) locations.push('landlord-bell')

  return phase === 'scheduled'
    ? { kind: 'scheduled', startAt: a.startAt, locations }
    : { kind: 'live', locations }
}

/** 「9/30」這種不補零、不帶年份的短日期。公告的排程提示與列表時間欄共用同一份格式。 */
export function formatAnnouncementShortDate(iso: string): string {
  const date = new Date(iso)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const LOCATION_LABELS: Record<AnnouncementLocation, string> = {
  'dashboard-banner': '儀表板橫幅',
  'notification-center': '通知中心',
  'landlord-bell': '房東通知',
}

function locationsSummary(locations: AnnouncementLocation[]): string {
  if (locations.length === 0) return '不會出現'
  if (locations.length === 1) {
    const only = locations[0]
    return only === 'dashboard-banner' ? LOCATION_LABELS[only] : `只在${LOCATION_LABELS[only]}`
  }
  return locations.map((loc) => LOCATION_LABELS[loc]).join('＋')
}

/**
 * 把 announcementPlacement() 的結果轉成中文短句，給列表與詳情面板共用——
 * 兩處講的必須是同一句話，不然又會重演「畫面各講各話」的問題。
 */
export function announcementPlacementSummary(placement: AnnouncementPlacement): string {
  switch (placement.kind) {
    case 'unpublished':
      return '未發布 —— 不會出現'
    case 'expired':
      return '已過期 —— 目前不會出現'
    case 'scheduled':
      return `${formatAnnouncementShortDate(placement.startAt)} 起：${locationsSummary(placement.locations)}`
    case 'live':
      return locationsSummary(placement.locations)
  }
}

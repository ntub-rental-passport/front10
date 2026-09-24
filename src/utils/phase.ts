/**
 * 「發布開關 + 起訖時間」決定要不要對外顯示，這組狀態機不是公告獨有的——
 * 輪播後來也長出一模一樣的需求（見 BannersTab／BannerCarousel）。抽成這裡
 * 讓兩邊共用同一份判斷邏輯，不要各自維護一份、遲早長歪（例如其中一邊漏改
 * 邊界條件）。`resolveAnnouncementPhase` 現在只是委派給這裡。
 */
export type Phase = 'draft' | 'scheduled' | 'active' | 'expired'

/** 任何「有發布開關與起訖時間」的內容都適用，不限公告或輪播。 */
export interface Schedulable {
  published: boolean
  startAt: string
  endAt: string | null
}

export function resolvePhase(item: Schedulable, now: Date): Phase {
  if (!item.published) return 'draft'
  const current = now.getTime()
  if (current < new Date(item.startAt).getTime()) return 'scheduled'
  if (item.endAt !== null && current > new Date(item.endAt).getTime()) return 'expired'
  return 'active'
}

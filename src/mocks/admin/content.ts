/**
 * 公告與首頁輪播的型別。資料本身存在後端（backend/admin/content_service.py），
 * 原本放在這裡的示範資料也搬過去當初始資料了。
 */
export type AnnouncementLevel = 'info' | 'warning' | 'urgent'

// 全部 / 只給租客 / 只給房東。目前平台上除了系統類公告，多數內容其實只跟其中一種身分有關，
// 讓後台可以指定受眾，租客端與房東端才不會看到一堆與自己無關的公告。
export type AnnouncementAudience = 'all' | 'tenant' | 'landlord'

export interface Announcement {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  published: boolean
  startAt: string
  endAt: string | null
  updatedAt: string
}

export interface Banner {
  id: string
  title: string
  imageUrl: string
  linkUrl: string
  /** 跟公告共用同一組對象：全部／只給租客／只給房東 */
  audience: AnnouncementAudience
  order: number
  published: boolean
  /** 跟公告對齊：published 只是總開關，實際生不生效還要看這組起訖時間。 */
  startAt: string
  endAt: string | null
  updatedAt: string
}

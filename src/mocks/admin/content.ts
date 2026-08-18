import { daysAgo, daysAhead } from './helpers'

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
  order: number
  published: boolean
  updatedAt: string
}

export function seedAnnouncements(): Announcement[] {
  return [
    {
      id: 'an-1',
      title: '系統維護預告',
      body: '本平台將於本週日凌晨 2:00–4:00 進行維護，屆時暫停服務。',
      level: 'warning',
      audience: 'all',
      published: true,
      startAt: daysAgo(1),
      endAt: daysAhead(5),
      updatedAt: daysAgo(1),
    },
    {
      id: 'an-2',
      title: '租金補貼開放申請',
      body: '300 億元中央擴大租金補貼受理中，請至租補專區試算並提出申請。',
      level: 'info',
      audience: 'tenant',
      published: true,
      startAt: daysAgo(3),
      endAt: null,
      updatedAt: daysAgo(3),
    },
    {
      id: 'an-3',
      title: '颱風假服務調整',
      body: '颱風期間客服回覆較慢，敬請見諒。',
      level: 'urgent',
      audience: 'all',
      published: true,
      startAt: daysAgo(30),
      endAt: daysAgo(20),
      updatedAt: daysAgo(30),
    },
    {
      id: 'an-4',
      title: '新功能預告',
      body: '點交存證影像比對即將上線，敬請期待。',
      level: 'info',
      audience: 'tenant',
      published: false,
      startAt: daysAgo(2),
      endAt: null,
      updatedAt: daysAgo(2),
    },
  ]
}

export function seedBanners(): Banner[] {
  return [
    { id: 'ban-1', title: '租補試算上線', imageUrl: 'https://placehold.co/1200x400/5660D6/FFFFFF?text=Subsidy', linkUrl: '/app/subsidy', order: 0, published: true, updatedAt: daysAgo(6) },
    { id: 'ban-2', title: '契約分析教學', imageUrl: 'https://placehold.co/1200x400/0E9488/FFFFFF?text=Contract', linkUrl: '/app/contract', order: 1, published: true, updatedAt: daysAgo(6) },
    { id: 'ban-3', title: '點交存證（下架中）', imageUrl: 'https://placehold.co/1200x400/D97706/FFFFFF?text=Handover', linkUrl: '/app/handover', order: 2, published: false, updatedAt: daysAgo(6) },
  ]
}

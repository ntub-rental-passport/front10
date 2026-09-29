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
  /** 跟公告對齊：published 只是總開關，實際生不生效還要看這組起訖時間。 */
  startAt: string
  endAt: string | null
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

const bannerImageMap: Record<string, string> = {
  'ban-1': '/banners/subsidy.webp',
  'ban-2': '/banners/contract.webp',
  'ban-3': '/banners/handover.webp',
}

// 2026-09-29 以前的種子圖片。直接連 Unsplash，但正式站的 CSP 不允許這個網域，
// 輪播在正式站上其實一直顯示不出來。
const legacySeedImageUrls = new Set([
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&h=400&fit=crop&crop=center',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200&h=400&fit=crop&crop=center',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&h=400&fit=crop&crop=center',
])

/**
 * 瀏覽器裡存的還是舊種子圖片（更早的 placehold.co 佔位圖，或上面的 Unsplash 網址）
 * 就換成現在的內建圖；管理員自己換過的網址不動。
 */
export function migrateBannerImages(list: Banner[]): Banner[] {
  return list.map((item) => {
    const expected = bannerImageMap[item.id]
    const isLegacy = item.imageUrl.includes('placehold.co') || legacySeedImageUrls.has(item.imageUrl)
    if (expected && isLegacy) {
      return { ...item, imageUrl: expected }
    }
    return item
  })
}

/**
 * 點交存證原本是下架狀態（標題寫「點交存證（下架中）」），2026-09-29 重新上架。
 * 只改標題還是舊種子的那一筆；管理員改過標題、或重新上架後又自己下架的都不動，
 * 所以每次載入都跑也不會把管理員的設定蓋掉。
 */
export function migrateHandoverRelaunch(list: Banner[]): Banner[] {
  return list.map((item) =>
    item.id === 'ban-3' && item.title === '點交存證（下架中）'
      ? { ...item, title: '點交存證', published: true }
      : item,
  )
}

/**
 * 舊資料沒有 startAt／endAt（輪播原本只有 published 一個開關）。
 * 跟 migrateAnnouncements（src/utils/announcement.ts）同一個模式：
 * startAt 補成 updatedAt——沿用它原本「從什麼時候開始存在」的意思，
 * endAt 補 null（長期），這樣 resolvePhase() 補完後判斷出的 active／draft
 * 結果會跟舊版本「只看 published」完全一樣，不會有舊輪播無故消失或冒出來。
 */
export function migrateBannerSchedule(list: Banner[]): Banner[] {
  return list.map((item) =>
    item.startAt ? item : { ...item, startAt: item.updatedAt, endAt: null },
  )
}

export function seedBanners(): Banner[] {
  return [
    { id: 'ban-1', title: '租補試算上線', imageUrl: '/banners/subsidy.webp', linkUrl: '/app/subsidy', order: 0, published: true, startAt: daysAgo(6), endAt: null, updatedAt: daysAgo(6) },
    { id: 'ban-2', title: '契約分析教學', imageUrl: '/banners/contract.webp', linkUrl: '/app/contract', order: 1, published: true, startAt: daysAgo(6), endAt: null, updatedAt: daysAgo(6) },
    { id: 'ban-3', title: '點交存證', imageUrl: '/banners/handover.webp', linkUrl: '/app/handover', order: 2, published: true, startAt: daysAgo(6), endAt: null, updatedAt: daysAgo(6) },
  ]
}

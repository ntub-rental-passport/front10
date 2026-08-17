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

export type FaqCategory = '租屋流程' | '契約分析' | '租金補貼' | '帳號問題'

export interface FaqEntry {
  id: string
  question: string
  answer: string
  category: FaqCategory
  order: number
  published: boolean
  updatedAt: string
}

export type LegalDocSlug = 'terms' | 'privacy'

export interface LegalDoc {
  id: string
  slug: LegalDocSlug
  title: string
  body: string
  version: number
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
      title: '颱風假服務調整（已過期）',
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
      title: '新功能預告（未發布）',
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

export function seedFaqs(): FaqEntry[] {
  return [
    { id: 'faq-1', question: '如何上傳租約進行分析？', answer: '於「契約分析」頁點選上傳，支援 PNG、JPG、JPEG、WEBP、BMP 圖檔。', category: '契約分析', order: 0, published: true, updatedAt: daysAgo(10) },
    { id: 'faq-2', question: '押金最多可以收幾個月？', answer: '依租賃專法，押金不得逾二個月租金總額。', category: '租屋流程', order: 1, published: true, updatedAt: daysAgo(10) },
    { id: 'faq-3', question: '租金補貼要準備什麼文件？', answer: '身分證明、租賃契約、存摺影本等，詳見租補專區的應備文件清單。', category: '租金補貼', order: 0, published: true, updatedAt: daysAgo(8) },
    { id: 'faq-4', question: '忘記密碼怎麼辦？', answer: '請於登入頁點選「忘記密碼」，系統會寄送重設連結至註冊信箱。', category: '帳號問題', order: 0, published: false, updatedAt: daysAgo(5) },
  ]
}

export function seedLegalDocs(): LegalDoc[] {
  return [
    { id: 'legal-terms', slug: 'terms', title: '服務條款', body: '歡迎使用 RentMate 租隊友。使用本服務即表示您同意以下條款……', version: 2, updatedAt: daysAgo(40) },
    { id: 'legal-privacy', slug: 'privacy', title: '隱私政策', body: '我們重視您的個人資料保護。本政策說明我們如何蒐集與使用您的資料……', version: 3, updatedAt: daysAgo(25) },
  ]
}

export function seedBanners(): Banner[] {
  return [
    { id: 'ban-1', title: '租補試算上線', imageUrl: 'https://placehold.co/1200x400/5660D6/FFFFFF?text=Subsidy', linkUrl: '/app/subsidy', order: 0, published: true, updatedAt: daysAgo(6) },
    { id: 'ban-2', title: '契約分析教學', imageUrl: 'https://placehold.co/1200x400/0E9488/FFFFFF?text=Contract', linkUrl: '/app/contract', order: 1, published: true, updatedAt: daysAgo(6) },
    { id: 'ban-3', title: '點交存證（下架中）', imageUrl: 'https://placehold.co/1200x400/D97706/FFFFFF?text=Handover', linkUrl: '/app/handover', order: 2, published: false, updatedAt: daysAgo(6) },
  ]
}

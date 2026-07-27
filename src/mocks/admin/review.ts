import { daysAgo } from './helpers'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ListingSubmission {
  id: string
  title: string
  address: string
  landlordEmail: string
  submittedAt: string
  status: ReviewStatus
  rejectReason: string | null
}

export interface PiiFlag {
  text: string
  kind: '姓名' | '電話' | '地址' | '證號'
}

export interface RatingSubmission {
  id: string
  listingTitle: string
  authorNickname: string
  content: string
  piiFlags: PiiFlag[]
  submittedAt: string
  status: ReviewStatus
  rejectReason: string | null
}

export function seedListings(): ListingSubmission[] {
  return [
    { id: 'ls-1', title: '大安區溫馨兩房', address: '台北市大安區和平東路二段 96 號', landlordEmail: 'chen.landlord@example.com', submittedAt: daysAgo(1, 14), status: 'pending', rejectReason: null },
    { id: 'ls-2', title: '中山北路採光套房', address: '台北市中山區中山北路三段 22 號', landlordEmail: 'lin.house@example.com', submittedAt: daysAgo(2, 9), status: 'pending', rejectReason: null },
    { id: 'ls-3', title: '文山區靜巷雅房', address: '台北市文山區木柵路一段 8 巷', landlordEmail: 'chen.landlord@example.com', submittedAt: daysAgo(3, 16), status: 'pending', rejectReason: null },
    { id: 'ls-4', title: '信義區電梯三房', address: '台北市信義區松德路 168 號', landlordEmail: 'lin.house@example.com', submittedAt: daysAgo(10), status: 'approved', rejectReason: null },
    { id: 'ls-5', title: '北投溫泉套房', address: '台北市北投區光明路 240 號', landlordEmail: 'chen.landlord@example.com', submittedAt: daysAgo(12), status: 'rejected', rejectReason: '照片與實際格局不符，請重新上傳。' },
  ]
}

export function seedRatings(): RatingSubmission[] {
  return [
    {
      id: 'rt-1',
      listingTitle: '信義區電梯三房',
      authorNickname: '小艾',
      content: '房東王小明人很好，修繕都很快處理，隔音也不錯。',
      piiFlags: [{ text: '王小明', kind: '姓名' }],
      submittedAt: daysAgo(1, 11),
      status: 'pending',
      rejectReason: null,
    },
    {
      id: 'rt-2',
      listingTitle: '大安區溫馨兩房',
      authorNickname: '阿賓',
      content: '有問題可以打 0912-345-678 找房東，回覆很快，整體滿意。',
      piiFlags: [{ text: '0912-345-678', kind: '電話' }],
      submittedAt: daysAgo(2, 15),
      status: 'pending',
      rejectReason: null,
    },
    {
      id: 'rt-3',
      listingTitle: '中山北路採光套房',
      authorNickname: '伊蓮',
      content: '採光真的很好，樓下就有超商，通勤方便。',
      piiFlags: [],
      submittedAt: daysAgo(3, 10),
      status: 'pending',
      rejectReason: null,
    },
    {
      id: 'rt-4',
      listingTitle: '北投溫泉套房',
      authorNickname: '小德',
      content: '冬天泡湯很方便，就是房間偏小。',
      piiFlags: [],
      submittedAt: daysAgo(8),
      status: 'approved',
      rejectReason: null,
    },
  ]
}

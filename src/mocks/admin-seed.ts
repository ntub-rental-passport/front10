export type AdminUserRole = 'user' | 'landlord' | 'admin'
export type AdminUserStatus = 'active' | 'suspended'

export interface AdminUser {
  id: string
  email: string
  nickname: string | null
  role: AdminUserRole
  status: AdminUserStatus
  emailVerified: boolean
  registeredAt: string
}

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

export type KnowledgeCategory = '租賃專法' | '民法' | '定型化契約' | '補助法規'

export interface KnowledgeEntry {
  id: string
  title: string
  category: KnowledgeCategory
  content: string
  version: number
  updatedAt: string
  enabled: boolean
}

export type AiOutputType = 'contract-analysis' | 'negotiation-script'

export interface AiOutputRecord {
  id: string
  type: AiOutputType
  userEmail: string
  rating: number | null
  regenerations: number
  createdAt: string
  reviewed: boolean
  reviewNote: string | null
}

export type PlanId = 'free' | 'plus' | 'pro'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  priceLabel: string
  aiQuota: number
  storageMb: number
}

export interface Subscription {
  id: string
  userEmail: string
  planId: PlanId
  expiresAt: string
  aiUsed: number
  storageUsedMb: number
  active: boolean
}

export type AuditActionType =
  | '登入'
  | '使用者管理'
  | '審核'
  | '知識庫'
  | 'AI品質'
  | '訂閱'
  | '系統'
  | '資料存取'

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: AuditActionType
  target: string
  detail: string
}

function daysAgo(days: number, hour = 10): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function daysAhead(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 0, 0)
  return date.toISOString()
}

export function seedAdminUsers(): AdminUser[] {
  return [
    { id: 'u-admin-1', email: 'admin@rentmate.tw', nickname: '系統管理員', role: 'admin', status: 'active', emailVerified: true, registeredAt: daysAgo(180) },
    { id: 'u-landlord-1', email: 'chen.landlord@example.com', nickname: '陳房東', role: 'landlord', status: 'active', emailVerified: true, registeredAt: daysAgo(120) },
    { id: 'u-landlord-2', email: 'lin.house@example.com', nickname: '林太太', role: 'landlord', status: 'active', emailVerified: true, registeredAt: daysAgo(75) },
    { id: 'u-tenant-1', email: 'amy.wang@example.com', nickname: '小艾', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(90) },
    { id: 'u-tenant-2', email: 'ben.liu@example.com', nickname: '阿賓', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(60) },
    { id: 'u-tenant-3', email: 'cindy.chang@example.com', nickname: null, role: 'user', status: 'active', emailVerified: false, registeredAt: daysAgo(14) },
    { id: 'u-tenant-4', email: 'derek.wu@example.com', nickname: '小德', role: 'user', status: 'suspended', emailVerified: true, registeredAt: daysAgo(200) },
    { id: 'u-tenant-5', email: 'elaine.ho@example.com', nickname: '伊蓮', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(30) },
  ]
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

export function seedKnowledge(): KnowledgeEntry[] {
  return [
    { id: 'kb-1', title: '租賃住宅市場發展及管理條例第 8 條－押金上限', category: '租賃專法', content: '押金不得逾二個月之租金總額。超收部分承租人得主張抵付租金。', version: 3, updatedAt: daysAgo(20), enabled: true },
    { id: 'kb-2', title: '民法第 429 條－出租人修繕義務', category: '民法', content: '租賃物之修繕，除契約另有訂定或另有習慣外，由出租人負擔。', version: 2, updatedAt: daysAgo(35), enabled: true },
    { id: 'kb-3', title: '定型化契約應記載事項－電費計價上限', category: '定型化契約', content: '每度電費不得超過台電夏季用電量最高級距價格。', version: 4, updatedAt: daysAgo(15), enabled: true },
    { id: 'kb-4', title: '定型化契約不得記載事項－拋棄審閱期', category: '定型化契約', content: '不得約定拋棄契約審閱期間；承租人應有至少三日之審閱期。', version: 1, updatedAt: daysAgo(50), enabled: true },
    { id: 'kb-5', title: '300 億元中央擴大租金補貼專案', category: '補助法規', content: '申請資格、每月補貼金額級距與應備文件說明（舊版，待更新）。', version: 1, updatedAt: daysAgo(120), enabled: false },
  ]
}

export function seedAiOutputs(): AiOutputRecord[] {
  return [
    { id: 'ai-1', type: 'contract-analysis', userEmail: 'amy.wang@example.com', rating: 5, regenerations: 0, createdAt: daysAgo(1, 9), reviewed: false, reviewNote: null },
    { id: 'ai-2', type: 'contract-analysis', userEmail: 'ben.liu@example.com', rating: 2, regenerations: 2, createdAt: daysAgo(1, 16), reviewed: false, reviewNote: null },
    { id: 'ai-3', type: 'negotiation-script', userEmail: 'amy.wang@example.com', rating: 4, regenerations: 1, createdAt: daysAgo(2, 10), reviewed: false, reviewNote: null },
    { id: 'ai-4', type: 'contract-analysis', userEmail: 'elaine.ho@example.com', rating: null, regenerations: 0, createdAt: daysAgo(2, 14), reviewed: false, reviewNote: null },
    { id: 'ai-5', type: 'negotiation-script', userEmail: 'cindy.chang@example.com', rating: 1, regenerations: 3, createdAt: daysAgo(3, 11), reviewed: false, reviewNote: null },
    { id: 'ai-6', type: 'contract-analysis', userEmail: 'derek.wu@example.com', rating: 2, regenerations: 1, createdAt: daysAgo(6), reviewed: true, reviewNote: '條款頁碼辨識錯誤，已回報模型調整提示詞。' },
    { id: 'ai-7', type: 'contract-analysis', userEmail: 'ben.liu@example.com', rating: 5, regenerations: 0, createdAt: daysAgo(7), reviewed: false, reviewNote: null },
    { id: 'ai-8', type: 'negotiation-script', userEmail: 'elaine.ho@example.com', rating: 4, regenerations: 0, createdAt: daysAgo(9), reviewed: false, reviewNote: null },
  ]
}

export function seedPlans(): SubscriptionPlan[] {
  return [
    { id: 'free', name: '免費方案', priceLabel: 'NT$0', aiQuota: 3, storageMb: 200 },
    { id: 'plus', name: '進階方案', priceLabel: 'NT$99／月', aiQuota: 20, storageMb: 2048 },
    { id: 'pro', name: '專業方案', priceLabel: 'NT$299／月', aiQuota: 100, storageMb: 10240 },
  ]
}

export function seedSubscriptions(): Subscription[] {
  return [
    { id: 'sub-1', userEmail: 'amy.wang@example.com', planId: 'plus', expiresAt: daysAhead(25), aiUsed: 12, storageUsedMb: 860, active: true },
    { id: 'sub-2', userEmail: 'ben.liu@example.com', planId: 'free', expiresAt: daysAhead(365), aiUsed: 3, storageUsedMb: 150, active: true },
    { id: 'sub-3', userEmail: 'chen.landlord@example.com', planId: 'pro', expiresAt: daysAhead(5), aiUsed: 64, storageUsedMb: 6300, active: true },
    { id: 'sub-4', userEmail: 'elaine.ho@example.com', planId: 'plus', expiresAt: daysAhead(11), aiUsed: 19, storageUsedMb: 1900, active: true },
    { id: 'sub-5', userEmail: 'lin.house@example.com', planId: 'plus', expiresAt: daysAhead(80), aiUsed: 5, storageUsedMb: 400, active: true },
    { id: 'sub-6', userEmail: 'derek.wu@example.com', planId: 'free', expiresAt: daysAgo(10), aiUsed: 3, storageUsedMb: 90, active: false },
  ]
}

export function seedAuditEvents(): AuditEvent[] {
  return [
    { id: 'ev-1', at: daysAgo(0, 8), actor: 'admin@rentmate.tw', action: '登入', target: 'admin@rentmate.tw', detail: '管理員登入後台' },
    { id: 'ev-2', at: daysAgo(1, 17), actor: 'system', action: '系統', target: '點交照片批次', detail: 'TTL 到期，自動刪除 3 筆退租滿一年的點交照片' },
    { id: 'ev-3', at: daysAgo(1, 15), actor: 'admin@rentmate.tw', action: '審核', target: '北投溫泉套房', detail: '退回物件：照片與實際格局不符' },
    { id: 'ev-4', at: daysAgo(1, 10), actor: 'amy.wang@example.com', action: '資料存取', target: '契約分析報告 #A102', detail: '使用者下載自己的契約分析 PDF' },
    { id: 'ev-5', at: daysAgo(2, 14), actor: 'admin@rentmate.tw', action: '知識庫', target: '定型化契約應記載事項－電費計價上限', detail: '更新條目（v4）' },
    { id: 'ev-6', at: daysAgo(2, 9), actor: 'system', action: '訂閱', target: 'chen.landlord@example.com', detail: '訂閱將於 7 日內到期，已寄送提醒' },
    { id: 'ev-7', at: daysAgo(3, 13), actor: 'admin@rentmate.tw', action: '使用者管理', target: 'derek.wu@example.com', detail: '停用帳號：多次發布不當內容' },
    { id: 'ev-8', at: daysAgo(4, 11), actor: 'ben.liu@example.com', action: '登入', target: 'ben.liu@example.com', detail: '使用者登入' },
  ]
}

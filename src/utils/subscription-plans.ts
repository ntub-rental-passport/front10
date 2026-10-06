// Source: RentMate 營運計畫書，2026/10/02，第 3–5 頁（含稅規劃）。
export type PlanRole = 'tenant' | 'landlord'
export type PlanKey = 'free' | 'plus' | 'pro'
export type BillingCycle = 'monthly' | 'yearly'
export interface SubscriptionPlan {
  key: PlanKey
  name: string
  monthly: number
  annual: number
  description: string
  scale: string
  highlights: string[]
}
export interface PlanFeature {
  group: string
  label: string
  values: [string, string, string]
  planned?: boolean
}

export interface PlanQuota {
  label: string
  unit: string
  limit: number
}

export interface LandlordPlanLimits {
  properties: PlanQuota
  rooms: PlanQuota
  managers: PlanQuota
}

export interface TenantPlanLimits {
  analysis: PlanQuota & { period: 'verified-once' | 'monthly' }
  storage: PlanQuota
  sharedSpaces: PlanQuota
  sharedMembers: PlanQuota
}

export interface PlanLimitsByRole {
  landlord: LandlordPlanLimits
  tenant: TenantPlanLimits
}

function landlordLimits(properties: number, rooms: number, managers: number): LandlordPlanLimits {
  return {
    properties: { label: '管理物件', unit: '個', limit: properties },
    rooms: { label: '管理房間', unit: '間', limit: rooms },
    managers: { label: '管理者席次（含擁有者）', unit: '席', limit: managers },
  }
}

function tenantLimits(
  analysis: number,
  period: TenantPlanLimits['analysis']['period'],
  storage: number,
  members: number,
): TenantPlanLimits {
  return {
    analysis: { label: 'AI 契約分析', unit: '次', limit: analysis, period },
    storage: { label: '附件總容量', unit: 'MB', limit: storage },
    sharedSpaces: { label: '共享空間', unit: '個', limit: 1 },
    sharedMembers: { label: '室友共享人數', unit: '人', limit: members },
  }
}

// 容量沿用既有畫面的 1 GB = 1024 MB，避免前後台換算不一致。
export const planLimits: { [R in PlanRole]: Record<PlanKey, PlanLimitsByRole[R]> } = {
  landlord: {
    free: landlordLimits(1, 5, 1),
    plus: landlordLimits(5, 30, 1),
    pro: landlordLimits(20, 100, 3),
  },
  tenant: {
    free: tenantLimits(1, 'verified-once', 200, 3),
    plus: tenantLimits(2, 'monthly', 1024, 4),
    pro: tenantLimits(5, 'monthly', 5120, 6),
  },
}

export const tenantCheckPack = {
  name: '39 元單次契約檢查包',
  price: 39,
  analyses: 1,
  includesReportExport: true,
  recurring: false,
} as const

export const subscriptionPlans: Record<PlanRole, SubscriptionPlan[]> = {
  landlord: [
    {
      key: 'free',
      name: 'Free 基礎管理',
      monthly: 0,
      annual: 0,
      description: '開始集中管理，掌握第一個出租物件。',
      scale: '1 個物件 / 5 間房 / 1 席',
      highlights: [
        '房屋、房間與租客管理',
        '租約資料與基本收支紀錄',
        '租金與租約到期頁面提示',
        '報修基本受理與照片紀錄',
      ],
    },
    {
      key: 'plus',
      name: 'Plus 進階管理',
      monthly: 199,
      annual: 1990,
      description: '減少重複作業，從容管理更多房間。',
      scale: '5 個物件 / 30 間房 / 1 席',
      highlights: [
        '包含 Free 的基本管理功能',
        '租客 CSV 匯入',
        '報修狀態追蹤與篩選',
        '月度收支彙整及匯出（規劃中）',
      ],
    },
    {
      key: 'pro',
      name: 'Pro 團隊管理',
      monthly: 399,
      annual: 3990,
      description: '多人協作與多物件管理，讓分工更清楚。',
      scale: '20 個物件 / 100 間房 / 3 席',
      highlights: [
        '包含 Plus 的管理功能',
        '管理／帳務／檢視角色（規劃中）',
        '跨物件進階報表（規劃中）',
        '優先客服處理',
      ],
    },
  ],
  tenant: [
    {
      key: 'free',
      name: 'Free 租屋入門',
      monthly: 0,
      annual: 0,
      description: '把租屋生活記錄好，基本工具免費使用。',
      scale: '驗證帳號贈送 1 次 AI 契約分析',
      highlights: [
        '租約與費用基本紀錄',
        '設備清單、點交照片與報修',
        '租補、垃圾車與停水停電資訊',
        '200 MB 附件容量（規劃中）',
      ],
    },
    {
      key: 'plus',
      name: 'Plus 安心租住',
      monthly: 49,
      annual: 490,
      description: '多一份分析與整理，租住生活更安心。',
      scale: '每月 2 次 AI 契約分析',
      highlights: [
        '包含 Free 的租屋生活功能',
        '單份分析報告匯出（規劃中）',
        '月度費用彙整／CSV（規劃中）',
        '1 GB 附件容量（規劃中）',
      ],
    },
    {
      key: 'pro',
      name: 'Pro 合租進階',
      monthly: 99,
      annual: 990,
      description: '串起合租資訊，一起整理共同生活。',
      scale: '每月 5 次 AI 契約分析',
      highlights: [
        '包含 Plus 的整理功能',
        '多份報告、跨租約費用彙整（規劃中）',
        '6 人共享與共同費用彙整（規劃中）',
        '5 GB 附件容量（規劃中）',
      ],
    },
  ],
}

export const planFeatures: Record<PlanRole, PlanFeature[]> = {
  landlord: [
    { group: '管理規模', label: '管理物件', values: ['1 個', '5 個', '20 個'] },
    { group: '管理規模', label: '管理房間', values: ['5 間', '30 間', '100 間'] },
    { group: '管理規模', label: '管理者席次（含擁有者）', values: ['1 席', '1 席', '3 席'] },
    { group: '日常管理', label: '房屋、房間與租客管理', values: ['包含', '包含', '包含'] },
    { group: '日常管理', label: '租約資料管理', values: ['包含', '包含', '包含'] },
    { group: '日常管理', label: '租金與費用紀錄', values: ['基本紀錄', '基本紀錄', '基本紀錄'] },
    {
      group: '日常管理',
      label: '租金與租約到期提醒',
      values: ['頁面提示', '自動及批次提醒', '自動及批次提醒'],
      planned: true,
    },
    {
      group: '日常管理',
      label: '報修與照片紀錄',
      values: ['基本受理與紀錄', '狀態追蹤及篩選', '團隊分工追蹤'],
      planned: true,
    },
    { group: '效率與協作', label: '租客 CSV 匯入', values: ['不包含', '包含', '包含'] },
    {
      group: '效率與協作',
      label: '收支報表',
      values: ['基本明細', '月度彙整及匯出', '跨物件進階報表'],
      planned: true,
    },
    {
      group: '效率與協作',
      label: '多人管理與權限',
      values: ['不包含', '不包含', '管理／帳務／檢視'],
      planned: true,
    },
    {
      group: '服務支援',
      label: '客服方式',
      values: ['說明及問題回報', '一般線上客服', '優先處理'],
    },
  ],
  tenant: [
    {
      group: 'AI 與契約',
      label: 'AI 契約分析',
      values: ['驗證帳號贈送 1 次', '每月 2 次', '每月 5 次'],
    },
    { group: 'AI 與契約', label: '已完成分析查閱', values: ['包含', '包含', '包含'] },
    {
      group: 'AI 與契約',
      label: '分析報告匯出',
      values: ['基本畫面查閱', '單份報告', '單份及多份彙整'],
      planned: true,
    },
    { group: '租屋生活', label: '租約、費用基本紀錄', values: ['包含', '包含', '包含'] },
    {
      group: '租屋生活',
      label: '費用進階整理',
      values: ['基本明細', '月度彙整／CSV', '跨租約、跨期間彙整'],
      planned: true,
    },
    { group: '租屋生活', label: '設備清單與點交照片', values: ['包含', '包含', '包含'] },
    {
      group: '租屋生活',
      label: '點交報告整理',
      values: ['查閱及原始資料下載', '單次點交報告', '入住、退租整合報告'],
      planned: true,
    },
    { group: '租屋生活', label: '基本到期提醒與報修', values: ['包含', '包含', '包含'] },
    { group: '租屋生活', label: '租補自評及官方資訊', values: ['包含', '包含', '包含'] },
    { group: '租屋生活', label: '垃圾車、停水停電資訊', values: ['包含', '包含', '包含'] },
    { group: '合租與容量', label: '記事與基本分工', values: ['包含', '包含', '包含'] },
    {
      group: '合租與容量',
      label: '室友共享上限',
      values: ['1 空間／共 3 人', '1 空間／共 4 人', '1 空間／共 6 人'],
      planned: true,
    },
    {
      group: '合租與容量',
      label: '室友共同費用彙整',
      values: ['不包含', '不包含', '包含彙整與匯出'],
      planned: true,
    },
    { group: '合租與容量', label: '附件總容量', values: ['200 MB', '1 GB', '5 GB'], planned: true },
    {
      group: '服務支援',
      label: '客服方式',
      values: ['說明及問題回報', '一般線上客服', '優先處理'],
    },
  ],
}

export function annualSavings(plan: SubscriptionPlan): number {
  return plan.monthly * 12 - plan.annual
}
export function billingAmount(plan: SubscriptionPlan, cycle: BillingCycle): number {
  return cycle === 'yearly' ? plan.annual : plan.monthly
}
export function monthlyEquivalent(plan: SubscriptionPlan): string {
  return (plan.annual / 12).toFixed(2)
}
export function quotaPercent(used: number | null, limit: number): number | null {
  return used === null ? null : Math.min(100, Math.max(0, (used / limit) * 100))
}

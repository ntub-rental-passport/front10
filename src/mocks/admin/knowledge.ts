import { daysAgo } from './helpers'

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

export function seedKnowledge(): KnowledgeEntry[] {
  return [
    { id: 'kb-1', title: '租賃住宅市場發展及管理條例第 8 條－押金上限', category: '租賃專法', content: '押金不得逾二個月之租金總額。超收部分承租人得主張抵付租金。', version: 3, updatedAt: daysAgo(20), enabled: true },
    { id: 'kb-2', title: '民法第 429 條－出租人修繕義務', category: '民法', content: '租賃物之修繕，除契約另有訂定或另有習慣外，由出租人負擔。', version: 2, updatedAt: daysAgo(35), enabled: true },
    { id: 'kb-3', title: '定型化契約應記載事項－電費計價上限', category: '定型化契約', content: '每度電費不得超過台電夏季用電量最高級距價格。', version: 4, updatedAt: daysAgo(15), enabled: true },
    { id: 'kb-4', title: '定型化契約不得記載事項－拋棄審閱期', category: '定型化契約', content: '不得約定拋棄契約審閱期間；承租人應有至少三日之審閱期。', version: 1, updatedAt: daysAgo(50), enabled: true },
    { id: 'kb-5', title: '300 億元中央擴大租金補貼專案', category: '補助法規', content: '申請資格、每月補貼金額級距與應備文件說明（舊版，待更新）。', version: 1, updatedAt: daysAgo(120), enabled: false },
  ]
}

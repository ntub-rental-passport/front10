import { daysAgo } from './helpers'

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

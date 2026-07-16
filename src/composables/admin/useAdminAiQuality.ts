import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { seedAiOutputs, type AiOutputRecord, type AiOutputType } from '@/src/mocks/admin-seed'

const records = createAdminCollection<AiOutputRecord[]>('ai-outputs', seedAiOutputs)

export const aiTypeLabels: Record<AiOutputType, string> = {
  'contract-analysis': '契約風險分析',
  'negotiation-script': 'AI 談判腳本',
}

export function needsReview(record: AiOutputRecord): boolean {
  return record.rating !== null && record.rating <= 2 && !record.reviewed
}

export function useAdminAiQuality() {
  const { logAction } = useAdminAudit()

  const stats = computed(() => {
    const rated = records.value.filter((record) => record.rating !== null)
    const total = records.value.length
    const avg =
      rated.length > 0
        ? rated.reduce((sum, record) => sum + (record.rating ?? 0), 0) / rated.length
        : 0
    const regenerated = records.value.filter((record) => record.regenerations > 0).length
    const low = rated.filter((record) => (record.rating ?? 0) <= 2).length

    return {
      avgRating: avg.toFixed(1),
      regenRate: total > 0 ? `${Math.round((regenerated / total) * 100)}%` : '0%',
      lowRate: rated.length > 0 ? `${Math.round((low / rated.length) * 100)}%` : '0%',
    }
  })

  const needsReviewCount = computed(() => records.value.filter(needsReview).length)

  function markReviewed(id: string, note: string): void {
    const record = records.value.find((item) => item.id === id)
    if (!record) return
    record.reviewed = true
    record.reviewNote = note.trim() || null
    logAction('AI品質', `${aiTypeLabels[record.type]}（${record.userEmail}）`, '完成人工複核')
  }

  return { records, stats, needsReview, needsReviewCount, markReviewed }
}

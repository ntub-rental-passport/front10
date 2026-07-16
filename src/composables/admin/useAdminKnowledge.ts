import { createAdminCollection, newId } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedKnowledge,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from '@/src/mocks/admin-seed'

const entries = createAdminCollection<KnowledgeEntry[]>('knowledge', seedKnowledge)

export const knowledgeCategories: KnowledgeCategory[] = [
  '租賃專法',
  '民法',
  '定型化契約',
  '補助法規',
]

export function useAdminKnowledge() {
  const { logAction } = useAdminAudit()

  function saveEntry(input: {
    id?: string
    title: string
    category: KnowledgeCategory
    content: string
  }): void {
    if (input.id) {
      const entry = entries.value.find((item) => item.id === input.id)
      if (!entry) return
      entry.title = input.title
      entry.category = input.category
      entry.content = input.content
      entry.version += 1
      entry.updatedAt = new Date().toISOString()
      logAction('知識庫', entry.title, `更新條目（v${entry.version}）`)
      return
    }

    entries.value.unshift({
      id: newId('kb'),
      title: input.title,
      category: input.category,
      content: input.content,
      version: 1,
      updatedAt: new Date().toISOString(),
      enabled: true,
    })
    logAction('知識庫', input.title, '新增條目')
  }

  function toggleEnabled(id: string): void {
    const entry = entries.value.find((item) => item.id === id)
    if (!entry) return
    entry.enabled = !entry.enabled
    logAction('知識庫', entry.title, entry.enabled ? '啟用條目' : '停用條目')
  }

  return { entries, saveEntry, toggleEnabled }
}

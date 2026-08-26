import { computed, ref } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import {
  seedSubsidyApplications,
  seedSubsidyBatches,
  type SubsidyApplication,
  type SubsidyBatch,
} from '@/src/mocks/admin-seed'
import { ADMIN_DATASET_VERSION } from '@/src/utils/admin-collection-migrate'
import { userDisplayName } from '@/src/utils/admin-user-directory'
import {
  canTransitionSubsidy,
  documentsComplete,
  missingDocumentsLabel,
  nextBatchCode,
  subsidyStats,
  subsidyStatusLabels,
  type SubsidyDocKey,
  type SubsidyStatus,
} from '@/src/utils/admin-subsidy'

export const adminSubsidyCollection = createAdminCollection<SubsidyApplication[]>(
  `subsidy-applications-${ADMIN_DATASET_VERSION}`,
  seedSubsidyApplications,
)
export const adminSubsidyBatchCollection = createAdminCollection<SubsidyBatch[]>(
  `subsidy-batches-${ADMIN_DATASET_VERSION}`,
  seedSubsidyBatches,
)

const applications = adminSubsidyCollection
const batches = adminSubsidyBatchCollection

/** 列表頁的狀態頁籤。第一層四種各自成籤，已送件另外一籤。 */
export type SubsidyTab = 'all' | 'pending' | 'need-docs' | 'ready' | 'submitted' | 'rejected'

export const subsidyTabs: { value: SubsidyTab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待審核' },
  { value: 'need-docs', label: '待補件' },
  { value: 'ready', label: '待送件' },
  { value: 'submitted', label: '已送件' },
  { value: 'rejected', label: '已退件' },
]

export interface SubsidyApplicationView extends SubsidyApplication {
  applicantName: string
  applicantEmail: string
  batchCode: string | null
  documentsReady: boolean
  missingLabel: string
}

export function useAdminSubsidy() {
  const { logAction } = useAdminAudit()
  const error = ref('')

  const tab = ref<SubsidyTab>('all')
  const keyword = ref('')
  /**
   * 批次篩選。'all' 不限、'draft' 是尚未成批的待送件、其餘是批次 id。
   *
   * 「待送件」本身就是下一批的草稿 —— 不需要為它另外建一個批次實體，
   * 只是先前畫面沒把它呈現成批次，才讓人覺得審核完還要多一道手續。
   */
  const batchFilter = ref<string>('all')

  function nameOf(userId: string): { name: string; email: string } {
    const user = adminUsersCollection.value.find((item) => item.id === userId)
    return user ? { name: userDisplayName(user), email: user.email } : { name: userId, email: '' }
  }

  const applicationViews = computed<SubsidyApplicationView[]>(() =>
    applications.value.map((application) => {
      const who = nameOf(application.userId)
      return {
        ...application,
        applicantName: who.name,
        applicantEmail: who.email,
        batchCode: batches.value.find((batch) => batch.id === application.batchId)?.code ?? null,
        documentsReady: documentsComplete(application.documents),
        missingLabel: missingDocumentsLabel(application.documents),
      }
    }),
  )

  const filteredApplications = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return applicationViews.value
      .filter((item) => tab.value === 'all' || item.status === tab.value)
      .filter((item) => {
        if (batchFilter.value === 'all') return true
        if (batchFilter.value === 'draft') return item.status === 'ready'
        return item.batchId === batchFilter.value
      })
      .filter((item) => {
        if (!kw) return true
        return (
          item.id.toLowerCase().includes(kw) ||
          item.address.toLowerCase().includes(kw) ||
          item.applicantName.toLowerCase().includes(kw) ||
          item.applicantEmail.toLowerCase().includes(kw)
        )
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
  })

  const stats = computed(() => subsidyStats(applications.value.map((item) => item.status)))

  /** 待送件且文件齊全的案件，才是可以納入批次的對象 */
  const submittable = computed(() =>
    applicationViews.value.filter((item) => item.status === 'ready' && item.documentsReady),
  )

  function find(id: string): SubsidyApplication | undefined {
    return applications.value.find((item) => item.id === id)
  }

  function transition(id: string, next: SubsidyStatus, detail: string): boolean {
    const application = find(id)
    if (!application) {
      error.value = '找不到申請案件'
      return false
    }
    if (!canTransitionSubsidy(application.status, next)) {
      error.value = `無法從「${subsidyStatusLabels[application.status]}」變更為「${subsidyStatusLabels[next]}」`
      return false
    }

    const previous = application.status
    application.status = next
    application.reviewedAt = new Date().toISOString()
    logAction(
      '租金補貼',
      application.id,
      `狀態由「${subsidyStatusLabels[previous]}」變更為「${subsidyStatusLabels[next]}」${detail ? `：${detail}` : ''}`,
    )
    error.value = ''
    return true
  }

  /** 標記缺件：勾選哪幾份沒過，附上給申請人的說明 */
  function markMissingDocuments(id: string, keys: SubsidyDocKey[], note: string): boolean {
    const application = find(id)
    if (!application) {
      error.value = '找不到申請案件'
      return false
    }
    if (keys.length === 0) {
      error.value = '請至少勾選一份缺件的文件'
      return false
    }

    for (const doc of application.documents) {
      doc.status = keys.includes(doc.key) ? 'missing' : 'approved'
      doc.hint = keys.includes(doc.key) ? note || '請重新上傳' : null
    }
    application.reviewNote = note

    return transition(id, 'need-docs', `缺件：${missingDocumentsLabel(application.documents)}`)
  }

  /** 判定資格不符，理由必填 —— 退件是終態，沒有理由申請人無從申訴 */
  function reject(id: string, reason: string): boolean {
    if (!reason.trim()) {
      error.value = '請填寫退件理由'
      return false
    }
    const application = find(id)
    if (!application) {
      error.value = '找不到申請案件'
      return false
    }
    application.reviewNote = reason.trim()
    return transition(id, 'rejected', reason.trim())
  }

  /** 審核通過，文件不齊時擋下來 */
  function approve(id: string): boolean {
    const application = find(id)
    if (!application) {
      error.value = '找不到申請案件'
      return false
    }
    if (!documentsComplete(application.documents)) {
      error.value = `文件尚未齊備（缺 ${missingDocumentsLabel(application.documents)}）`
      return false
    }

    for (const doc of application.documents) doc.hint = null
    application.reviewNote = ''
    return transition(id, 'ready', '文件齊備，待送件')
  }

  /** 建立送件批次：把勾選的案件一次送出並鎖定 */
  function createBatch(ids: string[], note: string): SubsidyBatch | null {
    const targets = ids
      .map((id) => find(id))
      .filter((item): item is SubsidyApplication => item !== undefined)
      .filter((item) => item.status === 'ready' && documentsComplete(item.documents))

    if (targets.length === 0) {
      error.value = '沒有可送件的案件（需為待送件且文件齊備）'
      return null
    }

    const now = new Date()
    const batch: SubsidyBatch = {
      id: `sb-${now.getTime()}`,
      code: nextBatchCode(
        batches.value.map((item) => item.code),
        now,
      ),
      createdAt: now.toISOString(),
      applicationIds: targets.map((item) => item.id),
      note: note.trim() || `本批 ${targets.length} 件，已送出至地方政府受理窗口`,
    }

    for (const application of targets) {
      application.status = 'submitted'
      application.batchId = batch.id
      application.reviewedAt = batch.createdAt
      application.governmentSteps = [
        { title: '申請送出', status: 'active', date: batch.createdAt, note: null },
        { title: '資格初審', status: 'pending', date: null, note: null },
        { title: '文件審查', status: 'pending', date: null, note: null },
        { title: '複審核定', status: 'pending', date: null, note: null },
        { title: '核定通知', status: 'pending', date: null, note: null },
        { title: '補貼撥款', status: 'pending', date: null, note: null },
      ]
    }

    batches.value.push(batch)
    logAction('租金補貼', batch.code, `建立送件批次，共 ${targets.length} 件`)
    error.value = ''
    return batch
  }

  return {
    applications,
    batches,
    applicationViews,
    filteredApplications,
    submittable,
    stats,
    tab,
    keyword,
    batchFilter,
    markMissingDocuments,
    reject,
    approve,
    createBatch,
    error,
  }
}

import { createRandom, daysAgo, intBetween, pick, weightedPick } from './helpers'
import { seedRentals, type Rental } from './rentals'
import { seedAdminUsers, type AdminUser } from './users'
import {
  SUBSIDY_DOC_KEYS,
  type SubsidyDocument,
  type SubsidyStatus,
} from '@/src/utils/admin-subsidy'

/** 政府端的進度步驟，送件之後才有內容，管理員只能看 */
export interface GovernmentStep {
  title: string
  status: 'done' | 'active' | 'pending' | 'failed'
  date: string | null
  note: string | null
}

export interface SubsidyApplication {
  id: string
  userId: string
  address: string
  monthlyRent: number
  submittedAt: string
  status: SubsidyStatus
  documents: SubsidyDocument[]
  /** 管理員的審核註記：缺件說明或退件理由 */
  reviewNote: string
  reviewedAt: string | null
  /** 已納入送件批次時的批次 id */
  batchId: string | null
  governmentSteps: GovernmentStep[]
}

export interface SubsidyBatch {
  id: string
  code: string
  createdAt: string
  applicationIds: string[]
  note: string
}

const GOVERNMENT_STEP_TITLES = [
  '申請送出',
  '資格初審',
  '文件審查',
  '複審核定',
  '核定通知',
  '補貼撥款',
]

const MISSING_HINTS: Record<string, string> = {
  id: '證件照片模糊，請重新拍攝',
  lease: '契約缺少出租人簽章頁',
  household: '戶籍謄本需三個月內',
  income: '請上傳最新版本的在職證明',
  bankbook: '存摺封面帳號被遮住',
}

const REJECT_REASONS = [
  '家庭年所得超過本年度標準',
  '同一戶籍已有其他人請領租金補貼',
  '租賃契約承租人與申請人不符',
  '申請人名下已有自有住宅',
]

/**
 * 政府端進度：依送件至今的天數推進。
 *
 * 送件越久走得越遠，最後一步「補貼撥款」只有超過八週的案件才會到。
 */
function governmentStepsFor(random: () => number, daysSinceSubmit: number): GovernmentStep[] {
  const reached = Math.min(GOVERNMENT_STEP_TITLES.length, 1 + Math.floor(daysSinceSubmit / 12))

  return GOVERNMENT_STEP_TITLES.map((title, index) => {
    if (index < reached - 1) {
      return {
        title,
        status: 'done' as const,
        date: daysAgo(Math.max(0, daysSinceSubmit - index * 12)),
        note: null,
      }
    }
    if (index === reached - 1) {
      return {
        title,
        status: 'active' as const,
        date: daysAgo(Math.max(0, daysSinceSubmit - index * 12)),
        note: title === '補貼撥款' ? `核定每月補貼 NT$${intBetween(random, 24, 50) * 100}` : null,
      }
    }
    return { title, status: 'pending' as const, date: null, note: null }
  })
}

function documentsFor(random: () => number, status: SubsidyStatus): SubsidyDocument[] {
  // 待補件一定有缺，其餘狀態的文件都是齊的
  const missingCount = status === 'need-docs' ? intBetween(random, 1, 2) : 0
  const missingKeys = new Set<string>()
  while (missingKeys.size < missingCount) {
    missingKeys.add(pick(random, SUBSIDY_DOC_KEYS))
  }

  return SUBSIDY_DOC_KEYS.map((key) => ({
    key,
    status: missingKeys.has(key) ? ('missing' as const) : ('approved' as const),
    hint: missingKeys.has(key) ? MISSING_HINTS[key] : null,
  }))
}

/** 已送件的案件分批掛上，越舊的批次案件越多 */
const BATCH_PLAN = [
  { daysAgo: 46, size: 5 },
  { daysAgo: 32, size: 6 },
  { daysAgo: 18, size: 4 },
  { daysAgo: 6, size: 3 },
]

export interface SubsidySeed {
  applications: SubsidyApplication[]
  batches: SubsidyBatch[]
}

export function seedSubsidy(
  users: AdminUser[] = seedAdminUsers(),
  rentals: Rental[] = seedRentals(users),
): SubsidySeed {
  const random = createRandom(560318)
  const applications: SubsidyApplication[] = []
  const batches: SubsidyBatch[] = []

  // 約七成的租約有申請補貼。
  // 比例訂得高，是為了讓扣掉已送件的歷史案件之後，第一層（管理員真正要審的那些）
  // 還留得下十幾件；比例太低會變成整頁都是唯讀的已送件。
  const applicants = rentals.filter(() => random() < 0.7)

  // 先產生已送件的案件並掛進批次，剩下的才分配到第一層的各種狀態
  let cursor = 0
  BATCH_PLAN.forEach((plan, batchIndex) => {
    const slice = applicants.slice(cursor, cursor + plan.size)
    cursor += plan.size
    if (slice.length === 0) return

    const stamp = new Date(Date.now() - plan.daysAgo * 86400000)
    const code = `SB-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}-01`
    const batchId = `sb-${batchIndex + 1}`

    const ids: string[] = []
    for (const rental of slice) {
      const id = `sa-${applications.length + 1}`
      ids.push(id)
      applications.push({
        id,
        userId: rental.tenantUserId,
        address: rental.address,
        monthlyRent: rental.monthlyRent,
        submittedAt: daysAgo(plan.daysAgo + intBetween(random, 2, 10)),
        status: 'submitted',
        documents: documentsFor(random, 'submitted'),
        reviewNote: '',
        reviewedAt: daysAgo(plan.daysAgo + 1),
        batchId,
        governmentSteps: governmentStepsFor(random, plan.daysAgo),
      })
    }

    batches.push({
      id: batchId,
      code,
      createdAt: daysAgo(plan.daysAgo),
      applicationIds: ids,
      note: `本批 ${ids.length} 件，已送出至地方政府受理窗口`,
    })
  })

  // 剩下的分配到第一層
  for (const rental of applicants.slice(cursor)) {
    // 只在第一層的四個狀態之間分配；已送件是上面批次那段的事
    const status = weightedPick<Exclude<SubsidyStatus, 'submitted'>>(random, {
      pending: 38,
      'need-docs': 27,
      ready: 23,
      rejected: 12,
    })
    const submittedDaysAgo = intBetween(random, 1, 25)

    applications.push({
      id: `sa-${applications.length + 1}`,
      userId: rental.tenantUserId,
      address: rental.address,
      monthlyRent: rental.monthlyRent,
      submittedAt: daysAgo(submittedDaysAgo),
      status,
      documents: documentsFor(random, status),
      reviewNote:
        status === 'rejected'
          ? pick(random, REJECT_REASONS)
          : status === 'need-docs'
            ? '請於七日內補齊，逾期將關閉本次申請'
            : '',
      reviewedAt: status === 'pending' ? null : daysAgo(Math.max(0, submittedDaysAgo - 2)),
      batchId: null,
      governmentSteps: [],
    })
  }

  return { applications, batches }
}

export function seedSubsidyApplications(): SubsidyApplication[] {
  return seedSubsidy().applications
}

export function seedSubsidyBatches(): SubsidyBatch[] {
  return seedSubsidy().batches
}

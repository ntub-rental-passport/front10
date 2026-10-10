import type { EvidencePhase, HandoverDiff, HandoverEvidence, HandoverItem } from '@/src/composables/useHandover'

export const diffLabels: Record<HandoverDiff['type'], { text: string; cls: string }> = {
  uncertain: { text: '無法判定', cls: 'bg-gray-100 text-gray-800' },
  unchanged: {
    text: '狀態相同',
    cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  },
  new_damage: {
    text: '新增瑕疵',
    cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  },
  missing: { text: '物品消失', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
  degraded: {
    text: '使用痕跡',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  },
}

export interface CheckoutPairConclusion {
  status: 'pending_photo' | 'pending_comparison' | 'error' | 'compared'
  text: string
  summary?: string
}

export function checkoutPairConclusion(
  item: HandoverItem,
  pair: NonNullable<HandoverItem['pairs']>[number],
): CheckoutPairConclusion {
  // 項目結論只代表最嚴重的一組；套用到其他組會把尚未比對誤印成已確認，影響押金舉證。
  if (pair.checkoutId === null) return { status: 'pending_photo', text: '尚未拍攝退租存證' }
  const comparison = item.evidences.find((e) => e.id === pair.checkoutId)?.comparison
  if (!comparison) return { status: 'pending_comparison', text: '尚未比對' }
  // 即使失敗回應仍帶有 type，也不能當成有效結論或計入已完成比對。
  if (comparison.error) {
    return { status: 'error', text: `比對失敗：${comparison.error}`, summary: comparison.summary }
  }
  if (!comparison.type) return { status: 'pending_comparison', text: '尚未比對' }
  return { status: 'compared', text: diffLabels[comparison.type].text, summary: comparison.summary }
}

export interface GroupedHandoverItems {
  room: string
  items: HandoverItem[]
}

/** 入住存證的照片張數（不含已移至歷程的）。至少一張就算這個項目已存證。 */
export function baselinePhotoCount(item: HandoverItem): number {
  return item.evidences.filter((e) => e.phase === 'baseline').length
}

export function createMockEvidenceUrl(seed: string): string {
  return `https://picsum.photos/seed/${seed}/400/300`
}

export function hasEvidenceInPhase(item: HandoverItem, phase: EvidencePhase): boolean {
  return item.evidences.some((evidence) => evidence.phase === phase)
}

export function firstEvidenceOfPhase(
  item: HandoverItem,
  phase: EvidencePhase,
): HandoverEvidence | null {
  return item.evidences.find((evidence) => evidence.phase === phase) ?? null
}

export function countItemsWithEvidence(items: HandoverItem[], phase: EvidencePhase): number {
  return items.filter((item) => hasEvidenceInPhase(item, phase)).length
}

export function groupItemsByRoom(items: HandoverItem[]): GroupedHandoverItems[] {
  const groups = new Map<string, HandoverItem[]>()

  items.forEach((item) => {
    const roomItems = groups.get(item.room) ?? []
    roomItems.push(item)
    groups.set(item.room, roomItems)
  })

  return Array.from(groups.entries())
    .sort(([, leftItems], [, rightItems]) =>
      leftItems[0].createdAt.localeCompare(rightItems[0].createdAt),
    )
    .map(([room, roomItems]) => ({ room, items: roomItems }))
}

export function formatHandoverTimestamp(iso: string): string {
  const date = new Date(iso)

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}

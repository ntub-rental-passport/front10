import type {
  EvidencePhase,
  HandoverEvidence,
  HandoverItem,
} from '@/src/composables/useHandover'

export interface GroupedHandoverItems {
  room: string
  items: HandoverItem[]
}

export function createMockEvidenceUrl(seed: string): string {
  return `https://picsum.photos/seed/${seed}/400/300`
}

export function hasEvidenceInPhase(item: HandoverItem, phase: EvidencePhase): boolean {
  return item.evidences.some((evidence) => evidence.phase === phase)
}

export function firstEvidenceOfPhase(
  item: HandoverItem,
  phase: EvidencePhase
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
      leftItems[0].createdAt.localeCompare(rightItems[0].createdAt)
    )
    .map(([room, roomItems]) => ({ room, items: roomItems }))
}

export function formatHandoverTimestamp(iso: string): string {
  const date = new Date(iso)

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`
}

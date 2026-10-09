import type { HandoverDiff, HandoverItem } from '@/src/composables/useHandover'
import { groupItemsByRoom, hasEvidenceInPhase, type GroupedHandoverItems } from './handover'

const CONCLUSION_LABELS: Record<HandoverDiff['type'], string> = {
  unchanged: '無差異',
  new_damage: '新增損壞',
  missing: '物品遺失',
  degraded: '狀況變差',
  uncertain: '無法判定',
}

export function checkoutConclusion(item: HandoverItem): string {
  // 無法區分「物品不見了拍不到」與「還沒拍」，只陳述存證現況，避免暗示使用者疏漏。
  if (!hasEvidenceInPhase(item, 'checkout')) return '本項無退租存證'
  if (!item.diff) return '尚未比對'
  return CONCLUSION_LABELS[item.diff.type]
}

export function formatConfidence(confidence: number | undefined | null): string {
  return confidence == null ? '' : `${Math.round(confidence * 100)}%`
}

/** 刻意納入租屋處全部項目，避免使用者忘記重置畫面篩選而漏掉存證。 */
export function baselineExportGroups(items: HandoverItem[]): GroupedHandoverItems[] {
  return groupItemsByRoom(items).map((group) => ({
    room: group.room,
    items: [...group.items].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  }))
}

/** 沒有退租照也可能是物品已遺失，仍須獨立一頁保留這個狀態。 */
export function checkoutExportItems(items: HandoverItem[]): HandoverItem[] {
  return baselineExportGroups(items).flatMap((group) =>
    group.items.filter((item) => hasEvidenceInPhase(item, 'baseline')),
  )
}

export interface BaselinePage {
  pageNumber: number
  /** 房間可能跨頁，續頁仍要重印房間名稱，避免照片失去所屬房間的脈絡。 */
  sections: Array<{ room: string; continued: boolean; items: HandoverItem[] }>
}

export interface BaselinePageLayout {
  /** 頁眉底部到頁碼上緣的可用高度。 */
  availableHeight: number
  itemHeight: number
  /** 房間標題須包含表頭與段落間距，避免實際繪製比預估更高。 */
  roomHeadingHeight: number
  /** 簽名等結尾內容只佔末頁，其他頁面不應因此少放項目。 */
  lastPageReserve?: number
}

export function paginateBaselineGroups(
  groups: GroupedHandoverItems[],
  layout: BaselinePageLayout,
): BaselinePage[] {
  const { availableHeight, itemHeight, roomHeadingHeight, lastPageReserve = 0 } = layout
  if (
    !Number.isFinite(availableHeight) || availableHeight <= 0 ||
    !Number.isFinite(itemHeight) || itemHeight <= 0 ||
    !Number.isFinite(roomHeadingHeight) || roomHeadingHeight < 0 ||
    !Number.isFinite(lastPageReserve) || lastPageReserve < 0
  ) {
    throw new Error('分頁高度設定無效。')
  }

  const pages: BaselinePage[] = []
  let page: BaselinePage | undefined
  let usedHeight = 0
  for (const group of groups) {
    let section: BaselinePage['sections'][number] | undefined
    for (const [index, item] of group.items.entries()) {
      const requiredHeight = itemHeight + (section ? 0 : roomHeadingHeight)
      // 空白頁仍接住超高項目；若一直要求它先放得下才加入，就會無限換頁。
      if (!page || (page.sections.length > 0 && usedHeight + requiredHeight > availableHeight)) {
        page = { pageNumber: pages.length + 1, sections: [] }
        pages.push(page)
        usedHeight = 0
        section = undefined
      }
      if (!section) {
        section = { room: group.room, continued: index > 0, items: [] }
        page.sections.push(section)
        usedHeight += roomHeadingHeight
      }
      section.items.push(item)
      usedHeight += itemHeight
    }
  }

  if (page && lastPageReserve > 0 && usedHeight + lastPageReserve > availableHeight) {
    // 只把最後一項移到新末頁，前面的頁面維持原容量；至多加一頁，避免保留區造成反覆重排。
    const finalPage: BaselinePage = { pageNumber: pages.length + 1, sections: [] }
    if (roomHeadingHeight + itemHeight + lastPageReserve <= availableHeight) {
      const section = page.sections[page.sections.length - 1]
      const lastItem = section.items.pop()!
      finalPage.sections.push({
        room: section.room,
        continued: section.continued || section.items.length > 0,
        items: [lastItem],
      })
      if (!section.items.length) page.sections.pop()
    }
    // 若連一項加保留區都放不下，保留區獨立成頁，超高項目仍保留在原頁。
    pages.push(finalPage)
  }
  return pages
}

export function handoverPdfFileName(
  kind: 'checklist' | 'baseline' | 'checkout',
  alias: string,
): string {
  const labels = {
    checklist: '點交條列清單',
    baseline: '入住點交證據包',
    checkout: '退租點交證據包',
  }
  const safeAlias = alias.replace(/[\\/:*?"<>|]/g, '').trim() || '租屋處'
  return `RentMate-${labels[kind]}-${safeAlias}.pdf`
}

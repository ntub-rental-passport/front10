import { ref } from 'vue'

/**
 * 後台表格「點一列看內容」的展開狀態。
 *
 * 這裡刻意做成 composable 而不是 AdminExpandableRow 元件：一個可展開的列在
 * 語意上要吐出兩個相鄰的 <TableRow>（本體 + 展開內容），包成單一元件就得在
 * 內部塞 Fragment 並把每個欄位都變成 slot，呼叫端反而更難讀。展開的標記留在
 * 各張表格裡，只有狀態集中管理。
 *
 * 用意：想知道一則公告寫了什麼，不該逼使用者按「編輯」進入可改的狀態。
 */
export function useExpandedRows() {
  const expandedIds = ref<string[]>([])

  function isExpanded(id: string): boolean {
    return expandedIds.value.includes(id)
  }

  function toggle(id: string): void {
    expandedIds.value = isExpanded(id)
      ? expandedIds.value.filter((item) => item !== id)
      : [...expandedIds.value, id]
  }

  return { isExpanded, toggle }
}

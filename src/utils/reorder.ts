/**
 * 把清單裡的某一項搬到指定位置，並把 order 重新編號成連續的 0..n-1。
 *
 * 原本只有相鄰交換（up／down），拖曳需要「一次跨越多個位置」。重新編號而不是
 * 只改被搬動那一項的 order，是因為交換式的舊資料可能留下不連續的 order 值，
 * 每次搬動都順手正規化，後續的插入位置計算才不會被空隙影響。
 */
export function reorderByIndex<T extends { id: string; order: number }>(
  list: T[],
  id: string,
  targetIndex: number,
): void {
  const sorted = [...list].sort((a, b) => a.order - b.order)
  const from = sorted.findIndex((item) => item.id === id)
  if (from === -1) return

  const to = Math.max(0, Math.min(targetIndex, sorted.length - 1))
  if (from === to) return

  const [moved] = sorted.splice(from, 1)
  sorted.splice(to, 0, moved)

  sorted.forEach((item, index) => {
    item.order = index
  })
}

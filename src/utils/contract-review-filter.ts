export type ContractReviewFilter = 'all' | 'pending' | 'good' | 'medium' | 'low' | 'reviewed'

interface ReviewFilterField {
  value: string
  confidence: 'high' | 'medium' | 'low'
  reviewState: 'unreviewed' | 'verified' | 'edited'
  editing?: boolean
  editStartValue?: string
}

export function filterContractReviewFields<T extends ReviewFilterField>(
  fields: T[],
  filter: ContractReviewFilter,
  keepEditing = false,
): T[] {
  const result = fields.filter((field) => {
    // 手機編輯完成前維持原篩選歸屬，避免清空或補填時欄位消失。
    const value = keepEditing && field.editing ? field.editStartValue ?? field.value : field.value
    const populated = Boolean(value.trim() && value !== '尚未辨識')
    switch (filter) {
      case 'pending':
        return populated && field.reviewState === 'unreviewed'
      case 'good':
        return populated && field.confidence === 'high' && field.reviewState === 'unreviewed'
      case 'medium':
        return populated && field.confidence !== 'high' && field.reviewState === 'unreviewed'
      case 'low':
        return !populated
      case 'reviewed':
        return field.reviewState !== 'unreviewed'
      default:
        return true
    }
  })
  return filter === 'pending'
    ? result.sort((left, right) => Number(left.confidence === 'high') - Number(right.confidence === 'high'))
    : result
}

export function filterMobileContractReviewFields<T extends ReviewFilterField & { groupId: string }>(
  fields: T[],
  filter: ContractReviewFilter,
  activeGroupId: string,
  groups: ReadonlyArray<{ id: string; order: number }>,
): T[] {
  if (!['pending', 'low', 'reviewed'].includes(filter)) {
    return filterContractReviewFields(
      fields.filter((field) => field.groupId === activeGroupId),
      filter,
      true,
    )
  }

  // 狀態篩選跨分類；待確認沿用信心排序，其餘依分類及原欄位順序顯示。
  const groupOrder = new Map(groups.map((group) => [group.id, group.order]))
  const orderedFields = [...fields].sort((left, right) =>
    (groupOrder.get(left.groupId) ?? Infinity) - (groupOrder.get(right.groupId) ?? Infinity),
  )
  return filterContractReviewFields(orderedFields, filter, true)
}

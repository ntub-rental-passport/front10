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
    // 手機直接在卡片輸入，編輯完成前維持原篩選歸屬，避免清空值時卡片消失。
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

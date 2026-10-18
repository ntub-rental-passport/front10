import { describe, expect, it } from 'vitest'
import { filterContractReviewFields, filterMobileContractReviewFields } from './contract-review-filter'

const fields = [
  { id: 'high', value: '甲', confidence: 'high', reviewState: 'unreviewed' },
  { id: 'missing', value: '尚未辨識', confidence: 'low', reviewState: 'unreviewed' },
  { id: 'medium', value: '乙', confidence: 'medium', reviewState: 'unreviewed' },
  { id: 'verified', value: '丙', confidence: 'medium', reviewState: 'verified' },
  { id: 'low', value: '丁', confidence: 'low', reviewState: 'unreviewed' },
  { id: 'blank', value: '  ', confidence: 'high', reviewState: 'unreviewed' },
  { id: 'edited', value: '戊', confidence: 'high', reviewState: 'edited' },
  { id: 'high-2', value: '己', confidence: 'high', reviewState: 'unreviewed' },
] satisfies Array<Parameters<typeof filterContractReviewFields>[0][number] & { id: string }>

describe('契約欄位篩選', () => {
  it('待確認只包含已有值且未校對的欄位，建議確認排在高信心前且維持同級順序', () => {
    const original = [...fields]
    expect(filterContractReviewFields(fields, 'pending').map(field => field.id))
      .toEqual(['medium', 'low', 'high', 'high-2'])
    expect(fields).toEqual(original)
  })

  it.each([
    ['all', fields.map(field => field.id)],
    ['good', ['high', 'high-2']],
    ['medium', ['medium', 'low']],
    ['low', ['missing', 'blank']],
    ['reviewed', ['verified', 'edited']],
  ] as const)('保留既有 %s 篩選的內容及順序', (filter, expected) => {
    expect(filterContractReviewFields(fields, filter).map(field => field.id)).toEqual(expected)
  })

  it('手機編輯時清空原值仍保留卡片，確認後才更新篩選', () => {
    const field = { ...fields[0]!, value: '', editStartValue: '甲', editing: true }
    expect(filterContractReviewFields([field], 'pending', true)).toEqual([field])
    expect(filterContractReviewFields([field], 'pending')).toEqual([])
    field.editing = false
    expect(filterContractReviewFields([field], 'pending', true)).toEqual([])
  })

  it('手機缺少資料卡片補寫時保留到確認完成', () => {
    const field = { ...fields[1]!, value: '已補上', editStartValue: '', editing: true }
    expect(filterContractReviewFields([field], 'low', true)).toEqual([field])
    field.editing = false
    expect(filterContractReviewFields([field], 'low', true)).toEqual([])
  })

  it('空清單與無待確認欄位皆回傳空陣列', () => {
    expect(filterContractReviewFields([], 'pending')).toEqual([])
    expect(filterContractReviewFields(fields.slice(3, 4), 'pending')).toEqual([])
  })
})

describe('手機跨分類待確認篩選', () => {
  const groups = [{ id: 'term', order: 4 }, { id: 'review', order: 1 }]
  const mobileFields = [
    { ...fields[0]!, id: 'term-high', groupId: 'term' },
    { ...fields[2]!, id: 'term-medium', groupId: 'term' },
    { ...fields[4]!, id: 'review-low', groupId: 'review' },
    { ...fields[2]!, id: 'review-medium', groupId: 'review' },
    { ...fields[0]!, id: 'review-high', groupId: 'review' },
    { ...fields[1]!, groupId: 'review' },
    { ...fields[3]!, groupId: 'term' },
  ]

  it('不受作用中分類影響，低／中信心優先，再依分類編號排序且不改動原陣列', () => {
    const original = [...mobileFields]
    for (const activeGroup of ['review', 'term', 'empty']) {
      expect(filterMobileContractReviewFields(mobileFields, 'pending', activeGroup, groups)
        .map(field => field.id)).toEqual([
        'review-low', 'review-medium', 'term-medium', 'review-high', 'term-high',
      ])
    }
    expect(mobileFields).toEqual(original)
  })

  it('其他篩選只顯示作用中分類，保留原欄位順序', () => {
    expect(filterMobileContractReviewFields(mobileFields, 'all', 'term', groups)
      .map(field => field.id)).toEqual(['term-high', 'term-medium', 'verified'])
    expect(filterMobileContractReviewFields(mobileFields, 'reviewed', 'term', groups)
      .map(field => field.id)).toEqual(['verified'])
    expect(filterMobileContractReviewFields(mobileFields, 'all', 'empty', groups)).toEqual([])
  })

  it('跨分類編輯清空原值仍保留待確認卡片，完成後才移除', () => {
    const field = { ...mobileFields[0]!, value: '', editing: true, editStartValue: '甲' }
    expect(filterMobileContractReviewFields([field], 'pending', 'review', groups)).toEqual([field])
    field.editing = false
    expect(filterMobileContractReviewFields([field], 'pending', 'review', groups)).toEqual([])
  })

  it('沒有待確認欄位或空陣列時回傳空陣列', () => {
    expect(filterMobileContractReviewFields(mobileFields.slice(5), 'pending', 'review', groups)).toEqual([])
    expect(filterMobileContractReviewFields([], 'pending', 'review', groups)).toEqual([])
  })
})

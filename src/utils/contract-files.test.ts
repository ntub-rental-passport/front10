import { describe, expect, it } from 'vitest'
import { appendContractFiles, moveItem, sortContractFiles } from './contract-files'

describe('moveItem', () => {
  it('可跨多頁往前或往後搬移，保留其他頁的相對順序', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('不修改原陣列及項目', () => {
    const first = Object.freeze({ name: '第1頁.jpg' })
    const second = Object.freeze({ name: '第2頁.jpg' })
    const list = Object.freeze([first, second])
    const moved = moveItem(list, 0, 1)
    expect(list).toEqual([first, second])
    expect(moved).toEqual([second, first])
    expect(moved[1]).toBe(first)
  })

  it.each([
    [0, 0],
    [-1, 0],
    [0, -1],
    [2, 0],
    [0, 2],
    [0.5, 1],
    [0, NaN],
  ])('原位或無效位置 %s → %s 不改變順序', (from, to) =>
    expect(moveItem(['a', 'b'], from, to)).toEqual(['a', 'b']),
  )

  it('支援空清單與單頁', () => {
    expect(moveItem([], 0, 1)).toEqual([])
    expect(moveItem(['a'], 0, 0)).toEqual(['a'])
  })
})

describe('追加契約頁面', () => {
  const files = (names: string[]) => names.map((name) => ({ name }))

  it('未手動排序時，整份清單仍依檔名的數字順序排列', () => {
    expect(appendContractFiles(files(['頁2.jpg', '頁10.jpg']), files(['頁1.jpg']), false)).toEqual(
      files(['頁1.jpg', '頁2.jpg', '頁10.jpg']),
    )
  })

  it('手動排序後保留現有順序，只將新增檔案排序並追加', () => {
    const original = files(['頁1.jpg', '頁2.jpg', '頁3.jpg'])
    const reordered = moveItem(original, 2, 0)
    const added = files(['頁10.jpg', '頁4.jpg'])
    const result = appendContractFiles(reordered, added, true)
    expect(result).toEqual(files(['頁3.jpg', '頁1.jpg', '頁2.jpg', '頁4.jpg', '頁10.jpg']))
    expect(reordered).toEqual(files(['頁3.jpg', '頁1.jpg', '頁2.jpg']))
    expect(added).toEqual(files(['頁10.jpg', '頁4.jpg']))
    expect(appendContractFiles(result, files(['頁0.jpg']), true)).toEqual(
      files(['頁3.jpg', '頁1.jpg', '頁2.jpg', '頁4.jpg', '頁10.jpg', '頁0.jpg']),
    )
  })

  it('重新選取全部檔案時，仍使用原有檔名排序', () => {
    expect(sortContractFiles(files(['頁10.jpg', '頁2.jpg', '頁1.jpg']))).toEqual(
      files(['頁1.jpg', '頁2.jpg', '頁10.jpg']),
    )
  })
})

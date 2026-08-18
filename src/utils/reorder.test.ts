import { describe, expect, it } from 'vitest'
import { reorderByIndex } from './reorder'

interface Row {
  id: string
  order: number
}

function rows(): Row[] {
  return [
    { id: 'a', order: 0 },
    { id: 'b', order: 1 },
    { id: 'c', order: 2 },
    { id: 'd', order: 3 },
  ]
}

function idsInOrder(list: Row[]): string[] {
  return [...list].sort((x, y) => x.order - y.order).map((item) => item.id)
}

describe('reorderByIndex', () => {
  it('往後搬動', () => {
    const list = rows()
    reorderByIndex(list, 'a', 2)
    expect(idsInOrder(list)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('往前搬動', () => {
    const list = rows()
    reorderByIndex(list, 'd', 0)
    expect(idsInOrder(list)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('搬到原位不動', () => {
    const list = rows()
    reorderByIndex(list, 'b', 1)
    expect(idsInOrder(list)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('order 重新編號成連續值', () => {
    const list = rows()
    reorderByIndex(list, 'a', 3)
    expect([...list].sort((x, y) => x.order - y.order).map((i) => i.order)).toEqual([0, 1, 2, 3])
  })

  it('把交換式舊資料留下的不連續 order 正規化', () => {
    const list: Row[] = [
      { id: 'a', order: 0 },
      { id: 'b', order: 5 },
      { id: 'c', order: 9 },
    ]
    reorderByIndex(list, 'c', 0)
    expect(idsInOrder(list)).toEqual(['c', 'a', 'b'])
    expect([...list].sort((x, y) => x.order - y.order).map((i) => i.order)).toEqual([0, 1, 2])
  })

  it('超出範圍的目標位置會被夾到邊界', () => {
    const list = rows()
    reorderByIndex(list, 'a', 99)
    expect(idsInOrder(list)).toEqual(['b', 'c', 'd', 'a'])

    const list2 = rows()
    reorderByIndex(list2, 'd', -5)
    expect(idsInOrder(list2)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('找不到 id 就什麼都不做', () => {
    const list = rows()
    reorderByIndex(list, 'zzz', 0)
    expect(idsInOrder(list)).toEqual(['a', 'b', 'c', 'd'])
  })
})

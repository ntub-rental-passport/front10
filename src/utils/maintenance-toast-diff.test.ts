import { describe, expect, it } from 'vitest'

import { appendCapped, diffOutageKeys } from './maintenance-toast-diff'

describe('沒有任何變化時', () => {
  it('added 與 removed 都是空陣列', () => {
    expect(diffOutageKeys(['garbage'], ['garbage'])).toEqual({ added: [], removed: [] })
  })

  it('兩邊都是空陣列時也回傳空陣列', () => {
    expect(diffOutageKeys([], [])).toEqual({ added: [], removed: [] })
  })
})

describe('新增關閉的功能', () => {
  it('抓得到新出現的 key，放進 added', () => {
    expect(diffOutageKeys([], ['garbage'])).toEqual({ added: ['garbage'], removed: [] })
  })

  it('原本就關閉的功能不會重複出現在 added', () => {
    expect(diffOutageKeys(['garbage'], ['garbage', 'outage'])).toEqual({
      added: ['outage'],
      removed: [],
    })
  })
})

describe('恢復的功能', () => {
  it('抓得到消失的 key，放進 removed', () => {
    expect(diffOutageKeys(['garbage'], [])).toEqual({ added: [], removed: ['garbage'] })
  })

  it('還在關閉中的功能不會出現在 removed', () => {
    expect(diffOutageKeys(['garbage', 'outage'], ['garbage'])).toEqual({
      added: [],
      removed: ['outage'],
    })
  })
})

describe('同時有新增與恢復', () => {
  it('一個關一個開，兩邊各自正確歸類，不會互相污染', () => {
    expect(diffOutageKeys(['garbage'], ['outage'])).toEqual({
      added: ['outage'],
      removed: ['garbage'],
    })
  })
})

describe('順序穩定性', () => {
  it('added 保留 next 的原始順序', () => {
    expect(diffOutageKeys([], ['outage', 'garbage'])).toEqual({
      added: ['outage', 'garbage'],
      removed: [],
    })
  })

  it('removed 保留 previous 的原始順序', () => {
    expect(diffOutageKeys(['outage', 'garbage'], [])).toEqual({
      added: [],
      removed: ['outage', 'garbage'],
    })
  })
})

describe('appendCapped', () => {
  it('沒超過上限時全部留著，沒有東西被丟掉', () => {
    expect(appendCapped(['a', 'b'], 'c', 3)).toEqual({ kept: ['a', 'b', 'c'], dropped: [] })
  })

  it('剛好到達上限不算溢位', () => {
    expect(appendCapped(['a', 'b'], 'c', 3).dropped).toEqual([])
  })

  it('溢位時丟掉最舊的，留下最新的幾則', () => {
    expect(appendCapped(['a', 'b', 'c'], 'd', 3)).toEqual({
      kept: ['b', 'c', 'd'],
      dropped: ['a'],
    })
  })

  it('連續加入時上限不會被越堆越高', () => {
    let list: string[] = []
    for (const item of ['a', 'b', 'c', 'd', 'e', 'f']) {
      list = appendCapped(list, item, 3).kept
    }
    expect(list).toEqual(['d', 'e', 'f'])
  })

  it('一次超出多則時全部多的都會被丟掉', () => {
    expect(appendCapped(['a', 'b', 'c', 'd'], 'e', 2)).toEqual({
      kept: ['d', 'e'],
      dropped: ['a', 'b', 'c'],
    })
  })

  it('上限為 0 或負數時不留任何一則', () => {
    expect(appendCapped(['a'], 'b', 0)).toEqual({ kept: [], dropped: ['a', 'b'] })
  })
})

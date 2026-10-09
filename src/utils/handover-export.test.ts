import { describe, expect, it } from 'vitest'
import type { EvidencePhase, HandoverDiff, HandoverEvidence, HandoverItem } from '@/src/composables/useHandover'
import {
  baselineExportGroups,
  checkoutConclusion,
  checkoutExportItems,
  formatConfidence,
  handoverPdfFileName,
  paginateBaselineGroups,
} from './handover-export'

function evidence(phase: EvidencePhase): HandoverEvidence {
  return {
    id: phase,
    phase,
    url: 'data:image/jpeg;base64,photo',
    capturedAt: '2026-10-01T10:00:00Z',
  }
}

function item(id: string, overrides: Partial<HandoverItem> = {}): HandoverItem {
  return {
    id,
    propertyId: 'property-1',
    room: '客廳',
    name: `物品 ${id}`,
    category: 'furniture',
    evidences: [],
    createdAt: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

function diff(type: HandoverDiff['type']): HandoverDiff {
  return { type, confidence: 0.873, summary: '比對說明', computedAt: '2026-10-02T10:00:00Z' }
}

describe('checkoutConclusion', () => {
  it.each([
    ['unchanged', '無差異'],
    ['new_damage', '新增損壞'],
    ['missing', '物品遺失'],
    ['degraded', '狀況變差'],
    ['uncertain', '無法判定'],
  ] as const)('將 %s 印為 %s', (type, conclusion) => {
    expect(checkoutConclusion(item('1', {
      evidences: [evidence('baseline'), evidence('checkout')],
      diff: diff(type),
    }))).toBe(conclusion)
  })

  it('有搬入照但沒有退租照時，僅陳述本項無退租存證', () => {
    expect(checkoutConclusion(item('1', {
      evidences: [evidence('baseline')],
    }))).toBe('本項無退租存證')
  })

  it('有退租照但尚未比對時，不印成無差異', () => {
    expect(checkoutConclusion(item('1', {
      evidences: [evidence('baseline'), evidence('checkout')],
    }))).toBe('尚未比對')
  })

  it('兩種 diff undefined 的情境必須得到不同文字', () => {
    const beforeCheckout = item('1', { evidences: [evidence('baseline')] })
    const beforeComparison = item('2', { evidences: [evidence('baseline'), evidence('checkout')] })
    expect(beforeCheckout.diff).toBeUndefined()
    expect(beforeComparison.diff).toBeUndefined()
    expect(checkoutConclusion(beforeCheckout)).not.toBe(checkoutConclusion(beforeComparison))
  })

  it('沒有任何照片時同樣不猜測物品是否遺失', () => {
    expect(checkoutConclusion(item('1'))).toBe('本項無退租存證')
  })

  it('即使留有舊比對結果，沒有退租照仍以存證現況為準', () => {
    expect(checkoutConclusion(item('1', {
      evidences: [evidence('baseline')],
      diff: diff('missing'),
    }))).toBe('本項無退租存證')
  })
})

describe('formatConfidence', () => {
  it.each([
    [0.873, '87%'],
    [0.876, '88%'],
    [0, '0%'],
    [1, '100%'],
    [undefined, ''],
    [null, ''],
  ])('將 %s 格式化為 %s', (confidence, expected) => {
    expect(formatConfidence(confidence)).toBe(expected)
  })
})

describe('baselineExportGroups', () => {
  it('空清單回傳空分組', () => {
    expect(baselineExportGroups([])).toEqual([])
  })

  it('保留全部項目，沿用房間分組順序，組內依建立時間排序且不改動輸入', () => {
    const bedroom = item('bedroom', { room: '臥室', createdAt: '2026-10-03T10:00:00Z' })
    const later = item('later', { createdAt: '2026-10-02T10:00:00Z' })
    const earlier = item('earlier', { evidences: [evidence('baseline')] })
    const tied = item('tied')
    const items = [bedroom, later, earlier, tied]

    expect(baselineExportGroups(items)).toEqual([
      { room: '客廳', items: [earlier, tied, later] },
      { room: '臥室', items: [bedroom] },
    ])
    expect(items).toEqual([bedroom, later, earlier, tied])
  })

  it('房間首項時間相同時保留原有房間順序', () => {
    const bedroom = item('1', { room: '臥室' })
    const living = item('2')
    expect(baselineExportGroups([bedroom, living]).map((group) => group.room)).toEqual(['臥室', '客廳'])
  })
})

describe('checkoutExportItems', () => {
  it('納入有搬入照但沒拍退租照的項目，排除沒有搬入照的項目', () => {
    const baselineOnly = item('baseline', { evidences: [evidence('baseline')] })
    const both = item('both', { evidences: [evidence('baseline'), evidence('checkout')] })
    const checkoutOnly = item('checkout', { evidences: [evidence('checkout')] })
    expect(checkoutExportItems([baselineOnly, both, checkoutOnly, item('none')])).toEqual([baselineOnly, both])
  })

  it('依房間分組順序及組內建立時間輸出，不改動輸入', () => {
    const bedroom = item('bedroom', { room: '臥室', evidences: [evidence('baseline')], createdAt: '2026-10-03T10:00:00Z' })
    const later = item('later', { evidences: [evidence('baseline')], createdAt: '2026-10-02T10:00:00Z' })
    const earlier = item('earlier', { evidences: [evidence('baseline')] })
    const items = [bedroom, later, earlier]
    expect(checkoutExportItems(items)).toEqual([earlier, later, bedroom])
    expect(items).toEqual([bedroom, later, earlier])
  })

  it('空清單回傳空陣列', () => {
    expect(checkoutExportItems([])).toEqual([])
  })
})

describe('paginateBaselineGroups', () => {
  const items = Array.from({ length: 7 }, (_, index) => item(String(index + 1)))
  const layout = { availableHeight: 200, itemHeight: 50, roomHeadingHeight: 50 }

  it('空清單與空房間不產生頁面', () => {
    expect(paginateBaselineGroups([], layout)).toEqual([])
    expect(paginateBaselineGroups([{ room: '客廳', items: [] }], layout)).toEqual([])
    expect(paginateBaselineGroups([], { ...layout, lastPageReserve: 50 })).toEqual([])
  })

  it('剛好填滿一頁時不多出空白頁', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 3) }], layout)).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 3) }] },
    ])
  })

  it('剛好多一項時放到續頁', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 4) }], layout)).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 3) }] },
      { pageNumber: 2, sections: [{ room: '客廳', continued: true, items: items.slice(3, 4) }] },
    ])
  })

  it('單一房間跨多頁時，每一張後續頁都標為 continued', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items }], layout)).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 3) }] },
      { pageNumber: 2, sections: [{ room: '客廳', continued: true, items: items.slice(3, 6) }] },
      { pageNumber: 3, sections: [{ room: '客廳', continued: true, items: items.slice(6) }] },
    ])
  })

  it('多房間共用一頁，只有跨頁的房間標示續頁', () => {
    const groups = [
      { room: '客廳', items: items.slice(0, 2) },
      { room: '臥室', items: items.slice(2, 5) },
      { room: '廚房', items: items.slice(5) },
    ]
    const original = structuredClone(groups)
    expect(paginateBaselineGroups(groups, { ...layout, availableHeight: 250 })).toEqual([
      { pageNumber: 1, sections: [
        { room: '客廳', continued: false, items: items.slice(0, 2) },
        { room: '臥室', continued: false, items: items.slice(2, 3) },
      ] },
      { pageNumber: 2, sections: [
        { room: '臥室', continued: true, items: items.slice(3, 5) },
        { room: '廚房', continued: false, items: items.slice(5, 6) },
      ] },
      { pageNumber: 3, sections: [{ room: '廚房', continued: true, items: items.slice(6) }] },
    ])
    expect(groups).toEqual(original)
  })

  it('新房間剛好從新頁開始時不是續頁', () => {
    expect(paginateBaselineGroups([
      { room: '客廳', items: items.slice(0, 3) },
      { room: '臥室', items: items.slice(3, 4) },
    ], layout)[1]).toEqual({
      pageNumber: 2,
      sections: [{ room: '臥室', continued: false, items: items.slice(3, 4) }],
    })
  })

  it.each([0, -1, -0.5, NaN, Infinity])('拒絕無效的可用高度 %s', (availableHeight) => {
    expect(() => paginateBaselineGroups([], { ...layout, availableHeight })).toThrow('分頁高度設定無效')
  })

  it.each([
    { itemHeight: 0 },
    { itemHeight: -1 },
    { itemHeight: Infinity },
    { roomHeadingHeight: -1 },
    { roomHeadingHeight: NaN },
    { lastPageReserve: -1 },
    { lastPageReserve: Infinity },
  ])('拒絕無效的版面設定 %j', (overrides) => {
    expect(() => paginateBaselineGroups([], { ...layout, ...overrides })).toThrow('分頁高度設定無效')
  })

  it('允許小數高度與零高度標題', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 3) }], {
      availableHeight: 1.5,
      itemHeight: 0.5,
      roomHeadingHeight: 0,
    })).toHaveLength(1)
  })

  it('同一房間按實際高度可放 26 項，第 27 項才換頁並計入續頁標題', () => {
    const roomItems = Array.from({ length: 27 }, (_, index) => item(String(index + 1)))
    expect(paginateBaselineGroups([{ room: '客廳', items: roomItems }], {
      availableHeight: 1328,
      itemHeight: 48,
      roomHeadingHeight: 32 + 36 + 8,
    })).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: roomItems.slice(0, 26) }] },
      { pageNumber: 2, sections: [{ room: '客廳', continued: true, items: roomItems.slice(26) }] },
    ])
  })

  it('多房間各自計入標題高度，即使項目列還放得下也必須換頁', () => {
    expect(paginateBaselineGroups([
      { room: '客廳', items: items.slice(0, 1) },
      { room: '臥室', items: items.slice(1, 2) },
      { room: '廚房', items: items.slice(2, 3) },
    ], layout)).toEqual([
      { pageNumber: 1, sections: [
        { room: '客廳', continued: false, items: items.slice(0, 1) },
        { room: '臥室', continued: false, items: items.slice(1, 2) },
      ] },
      { pageNumber: 2, sections: [{ room: '廚房', continued: false, items: items.slice(2, 3) }] },
    ])
  })

  it('末頁保留區剛好放得下時，不多開一頁', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 2) }], {
      ...layout,
      lastPageReserve: 50,
    })).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 2) }] },
    ])
  })

  it('末頁放不下保留區時只調整尾端，前面的頁面仍可填滿', () => {
    const groups = [{ room: '客廳', items: items.slice(0, 6) }]
    const original = structuredClone(groups)
    expect(paginateBaselineGroups(groups, { ...layout, lastPageReserve: 50 })).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 3) }] },
      { pageNumber: 2, sections: [{ room: '客廳', continued: true, items: items.slice(3, 5) }] },
      { pageNumber: 3, sections: [{ room: '客廳', continued: true, items: items.slice(5, 6) }] },
    ])
    expect(groups).toEqual(original)
  })

  it('末頁保留區讓整個新房間移到新頁時，不標示續頁', () => {
    expect(paginateBaselineGroups([
      { room: '客廳', items: items.slice(0, 1) },
      { room: '臥室', items: items.slice(1, 2) },
    ], { ...layout, lastPageReserve: 50 })).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 1) }] },
      { pageNumber: 2, sections: [{ room: '臥室', continued: false, items: items.slice(1, 2) }] },
    ])
  })

  it('保留區無法與任何項目共頁時獨立成頁，不反覆重排', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 1) }], {
      ...layout,
      lastPageReserve: 150,
    })).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 1) }] },
      { pageNumber: 2, sections: [] },
    ])
  })

  it('單一項目超過可用高度時仍各佔一頁，不丟錯或無限換頁', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 2) }], {
      availableHeight: 100,
      itemHeight: 150,
      roomHeadingHeight: 20,
    })).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 1) }] },
      { pageNumber: 2, sections: [{ room: '客廳', continued: true, items: items.slice(1, 2) }] },
    ])
  })

  it('項目加標題才超高時，也各佔一頁', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 2) }], {
      availableHeight: 100,
      itemHeight: 80,
      roomHeadingHeight: 30,
    }).map((page) => page.sections.flatMap((section) => section.items))).toEqual([
      items.slice(0, 1),
      items.slice(1, 2),
    ])
  })

  it('超高項目仍能與末頁保留區完成有限次分頁', () => {
    expect(paginateBaselineGroups([{ room: '客廳', items: items.slice(0, 1) }], {
      availableHeight: 100,
      itemHeight: 150,
      roomHeadingHeight: 20,
      lastPageReserve: 40,
    })).toEqual([
      { pageNumber: 1, sections: [{ room: '客廳', continued: false, items: items.slice(0, 1) }] },
      { pageNumber: 2, sections: [] },
    ])
  })

  it('條列清單的 3 個房間、共 30 項含簽名區只需 2 頁', () => {
    const groups = ['客廳', '臥室', '廚房'].map((room) => ({
      room,
      items: Array.from({ length: 10 }, (_, index) => item(`${room}-${index}`, { room })),
    }))
    const checklistLayout = {
      availableHeight: 1754 - 76 - 350,
      itemHeight: 48,
      roomHeadingHeight: 32 + 36 + 8,
      lastPageReserve: 30 + 3 * 40 + 2 * 16,
    }
    const pages = paginateBaselineGroups(groups, checklistLayout)
    expect(pages).toHaveLength(2)
    expect(pages.map((page) => page.sections.reduce((count, section) => count + section.items.length, 0))).toEqual([22, 8])
    expect(pages.flatMap((page) => page.sections.flatMap((section) => section.items))).toEqual(groups.flatMap((group) => group.items))
    for (const page of pages) {
      const contentHeight = page.sections.reduce((height, section) => height + checklistLayout.roomHeadingHeight + section.items.length * checklistLayout.itemHeight, 0)
      const reserve = page.pageNumber === pages.length ? checklistLayout.lastPageReserve : 0
      expect(contentHeight + reserve).toBeLessThanOrEqual(checklistLayout.availableHeight)
    }
  })
})

describe('handoverPdfFileName', () => {
  it('移除別名中的非法字元並去掉前後空白', () => {
    expect(handoverPdfFileName('baseline', '  台北\\/:*?"<>|小屋  ')).toBe('RentMate-入住點交證據包-台北小屋.pdf')
  })

  it.each(['', '   ', '\\/:*?"<>|'])('別名 %s 清理後為空時使用租屋處', (alias) => {
    expect(handoverPdfFileName('baseline', alias)).toBe('RentMate-入住點交證據包-租屋處.pdf')
  })

  it.each([
    ['checklist', '點交條列清單'],
    ['baseline', '入住點交證據包'],
    ['checkout', '退租點交證據包'],
  ] as const)('%s 有可辨識的檔名', (kind, label) => {
    expect(handoverPdfFileName(kind, '小屋')).toBe(`RentMate-${label}-小屋.pdf`)
  })
})

import { describe, expect, it } from 'vitest'

import {
  DRAFT_KEY,
  clearDraft,
  isEmptyDraft,
  readDraft,
  writeDraft,
  type ComposeDraft,
} from './notif-draft'

/** vitest 跑在 node 環境，沒有 localStorage —— 自己做一個假的 */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  } as Storage
}

/** 無痕視窗 / 停用 cookie：每一個操作都會丟例外 */
function throwingStorage(): Storage {
  const boom = () => {
    throw new DOMException('denied')
  }
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 } as unknown as Storage
}

function draft(over: Partial<ComposeDraft> = {}): Partial<ComposeDraft> {
  return { title: '系統維護預告', body: '今晚維護', ...over }
}

describe('isEmptyDraft', () => {
  it('只有預設值不算草稿 —— 否則每次打開編輯器再離開都會存一份', () => {
    expect(isEmptyDraft({ category: '系統', channels: ['inapp'], when: 'now', recipientKind: 'all' })).toBe(true)
  })

  it('null 與 undefined 都算空的', () => {
    expect(isEmptyDraft(null)).toBe(true)
    expect(isEmptyDraft(undefined)).toBe(true)
  })

  it('打了任何一個字就不算空的', () => {
    expect(isEmptyDraft({ title: '嗨' })).toBe(false)
    expect(isEmptyDraft({ body: '嗨' })).toBe(false)
    expect(isEmptyDraft({ templateId: 'nt-1' })).toBe(false)
    expect(isEmptyDraft({ actionUrl: '/app/repairs' })).toBe(false)
  })

  it('挑了收件人也算有內容', () => {
    expect(isEmptyDraft({ recipientEmails: ['a@example.com'] })).toBe(false)
  })

  it('填了變數也算有內容', () => {
    expect(isEmptyDraft({ vars: { 姓名: '王小明' } })).toBe(false)
    expect(isEmptyDraft({ vars: { 姓名: '   ' } })).toBe(true)
  })

  it('只有空白不算打了字', () => {
    expect(isEmptyDraft({ title: '   ', body: '  ' })).toBe(true)
  })
})

describe('讀寫草稿', () => {
  it('存了就讀得回來', () => {
    const storage = fakeStorage()
    writeDraft(draft(), storage)
    expect(readDraft(storage)?.title).toBe('系統維護預告')
  })

  it('存的時候補上時間，畫面才講得出「什麼時候存的」', () => {
    const storage = fakeStorage()
    writeDraft(draft(), storage)
    expect(readDraft(storage)?.savedAt).not.toBe('')
  })

  it('空草稿不但不存，還會把舊的清掉 —— 管理員清空內容就是不想留', () => {
    const storage = fakeStorage()
    writeDraft(draft(), storage)
    writeDraft({ title: '', body: '' }, storage)
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
    expect(readDraft(storage)).toBeNull()
  })

  it('clearDraft 清得掉', () => {
    const storage = fakeStorage()
    writeDraft(draft(), storage)
    clearDraft(storage)
    expect(readDraft(storage)).toBeNull()
  })
})

describe('壞掉的資料不能把整頁炸掉', () => {
  it('不是 JSON 就當作沒有草稿', () => {
    expect(readDraft(fakeStorage({ [DRAFT_KEY]: '{壞掉的' }))).toBeNull()
  })

  it('是 JSON 但不是物件也當作沒有', () => {
    expect(readDraft(fakeStorage({ [DRAFT_KEY]: '"字串"' }))).toBeNull()
    expect(readDraft(fakeStorage({ [DRAFT_KEY]: 'null' }))).toBeNull()
  })

  it('缺欄位的舊草稿補成空值，不要讓 undefined 流進 v-model', () => {
    const restored = readDraft(fakeStorage({ [DRAFT_KEY]: JSON.stringify({ title: '只有標題' }) }))
    expect(restored).not.toBeNull()
    expect(restored?.body).toBe('')
    expect(restored?.channels).toEqual([])
    expect(restored?.vars).toEqual({})
    expect(restored?.when).toBe('now')
  })

  it('channels 被寫成奇怪的型別時退回空陣列', () => {
    const restored = readDraft(
      fakeStorage({ [DRAFT_KEY]: JSON.stringify({ title: 'x', channels: 'inapp' }) }),
    )
    expect(restored?.channels).toEqual([])
  })

  it('無痕視窗丟例外時安靜地當作沒有草稿', () => {
    const storage = throwingStorage()
    expect(readDraft(storage)).toBeNull()
    expect(() => writeDraft(draft(), storage)).not.toThrow()
    expect(() => clearDraft(storage)).not.toThrow()
  })

  it('沒有 storage 可用時也不會爆', () => {
    expect(readDraft(undefined)).toBeNull()
    expect(() => writeDraft(draft(), undefined)).not.toThrow()
  })
})

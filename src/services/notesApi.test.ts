import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ session: { accessToken: 'signed-token' } as { accessToken: string } | null }))
vi.mock('@/src/composables/useAuth', () => ({ getAuthSession: () => auth.session }))
import { createPersonalNote, deletePersonalNote, listPersonalNotes } from './notesApi'

beforeEach(() => { auth.session = { accessToken: 'signed-token' } })
afterEach(() => vi.unstubAllGlobals())

it('uses the API proxy with a signed token, never a caller-supplied email', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', fetcher)
  await listPersonalNotes()
  expect(fetcher).toHaveBeenCalledWith('/api/notes', expect.objectContaining({
    credentials: 'include', headers: { Authorization: 'Bearer signed-token' },
  }))
})

it('rejects unauthenticated requests before accessing the API', async () => {
  auth.session = null
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  await expect(listPersonalNotes()).rejects.toThrow('請先登入')
  expect(fetcher).not.toHaveBeenCalled()
})

it('accepts 204 deletes and escapes record identifiers', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(deletePersonalNote('1/2')).resolves.toBeUndefined()
  expect(fetcher.mock.calls[0]![0]).toBe('/api/notes/1%2F2')
})

it('surfaces API failures instead of reporting a successful save', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"無權限"}', { status: 403 })))
  await expect(createPersonalNote({ title: 'test', content: '', date: '2026-09-14', time: '', tag: '提醒' })).rejects.toThrow('無權限')
})

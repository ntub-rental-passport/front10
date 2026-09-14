import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mounted: [] as (() => Promise<void>)[],
  route: { query: {} as Record<string, string> },
  replace: vi.fn(),
  listPersonalNotes: vi.fn(), createPersonalNote: vi.fn(), updatePersonalNote: vi.fn(), deletePersonalNote: vi.fn(),
  listHouseholds: vi.fn(), createHousehold: vi.fn(), joinHousehold: vi.fn(), notesRequest: vi.fn(),
}))
vi.mock('vue', async (original) => ({ ...await original<typeof import('vue')>(), onMounted: (fn: () => Promise<void>) => mocks.mounted.push(fn) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: mocks.replace }), useRoute: () => mocks.route }))
vi.mock('@/src/services/notesApi', () => ({ ...mocks, groupPath: (id: string) => `/households/${id}` }))

import { useNotesState } from './useNotesState'

const note = { id: '1', title: '記事', content: '', date: '2026-09-14', time: '', tag: '提醒', done: false }
const group = { id: 'g1', name: '室友', inviteCode: 'invite-code', isOwner: true }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.mounted.length = 0
  mocks.route.query = {}
  mocks.listPersonalNotes.mockResolvedValue([{ ...note }])
  mocks.listHouseholds.mockResolvedValue([])
  mocks.notesRequest.mockResolvedValue([])
})

describe('notes account persistence', () => {
  it('loads API records without displaying another account or seeded local records', async () => {
    const state = useNotesState('personal')
    expect(state.personalNotes.value).toEqual([])
    await mocks.mounted[0]!()
    expect(state.personalNotes.value).toEqual([note])
    expect(state.isLoading.value).toBe(false)
  })

  it('retains the form and displays an error if saving fails', async () => {
    const state = useNotesState('personal')
    state.personalForm.value.title = '不能丟掉的草稿'
    state.showPersonalDialog.value = true
    mocks.createPersonalNote.mockRejectedValue(new Error('服務暫時中斷'))
    await state.savePersonalNote()
    expect(state.personalNotes.value).toEqual([])
    expect(state.personalForm.value.title).toBe('不能丟掉的草稿')
    expect(state.showPersonalDialog.value).toBe(true)
    expect(state.syncError.value).toBe('服務暫時中斷')
  })

  it('does not mark complete or delete locally when the server rejects the change', async () => {
    const state = useNotesState('personal')
    await state.reloadNotes()
    mocks.updatePersonalNote.mockRejectedValue(new Error('禁止'))
    await state.togglePersonalDone('1')
    expect(state.personalNotes.value[0]!.done).toBe(false)
    mocks.deletePersonalNote.mockRejectedValue(new Error('禁止'))
    await state.removePersonalNote('1')
    expect(state.personalNotes.value).toHaveLength(1)
  })

  it('prevents duplicate saves while a request is pending', async () => {
    const state = useNotesState('personal')
    state.personalForm.value.title = '記事'
    let finish!: (value: typeof note) => void
    mocks.createPersonalNote.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const pending = state.savePersonalNote()
    await state.savePersonalNote()
    expect(mocks.createPersonalNote).toHaveBeenCalledTimes(1)
    finish(note)
    await pending
    expect(state.personalNotes.value).toHaveLength(1)
  })

  it('joins only after accepting the invite and then loads shared data', async () => {
    mocks.route.query = { invite: 'new-code' }
    mocks.joinHousehold.mockResolvedValue(group)
    const state = useNotesState('roommate')
    await state.reloadNotes()
    expect(mocks.joinHousehold).not.toHaveBeenCalled()
    await state.acceptInvite()
    expect(mocks.joinHousehold).toHaveBeenCalledWith('new-code')
    expect(state.householdId.value).toBe('g1')
    expect(mocks.notesRequest).toHaveBeenCalledWith('/households/g1/tasks')
    expect(mocks.replace).toHaveBeenCalledWith({ query: {} })
  })

  it('creates a group before the first task, retaining server-assigned IDs', async () => {
    mocks.createHousehold.mockResolvedValue(group)
    mocks.notesRequest.mockImplementation(async (path: string, method?: string) => method === 'POST'
      ? { ...note, id: 'server-task', tag: '清潔', assigneeId: '', creatorId: 'server-member' } : [])
    const state = useNotesState('roommate')
    state.roommateTaskForm.value.title = '清潔'
    await state.saveRoommateTask()
    expect(mocks.createHousehold).toHaveBeenCalledOnce()
    expect(state.roommateTasks.value[0]!.id).toBe('server-task')
    expect(state.inviteLink.value).toContain('invite-code')
  })

  it('does not misrepresent failure as a successful empty load', async () => {
    mocks.listPersonalNotes.mockRejectedValue(new Error('資料庫無法連線'))
    const state = useNotesState('personal')
    await state.reloadNotes()
    expect(state.syncError.value).toBe('資料庫無法連線')
    expect(state.isLoading.value).toBe(false)
  })
})

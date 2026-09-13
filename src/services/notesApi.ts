import { getAuthSession } from '@/src/composables/useAuth'

export interface PersonalNotePayload {
  title: string
  content: string
  date: string
  time: string
  tag: string
}

export interface PersonalNoteApi extends PersonalNotePayload {
  id: string
  done: boolean
  createdAt: string
  updatedAt: string
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function notesRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getAuthSession()
  if (!session?.isAuthenticated) throw new Error('請先登入後再使用備忘錄')

  const response = await fetch(`${API_BASE_URL}/notes${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Email': session.email,
      ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail || '備忘錄同步失敗')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export function listPersonalNotes(): Promise<PersonalNoteApi[]> {
  return notesRequest<PersonalNoteApi[]>('')
}

export function createPersonalNote(payload: PersonalNotePayload): Promise<PersonalNoteApi> {
  return notesRequest<PersonalNoteApi>('', { method: 'POST', body: JSON.stringify(payload) })
}

export function updatePersonalNote(id: string, payload: Partial<PersonalNotePayload & { done: boolean }>): Promise<PersonalNoteApi> {
  return notesRequest<PersonalNoteApi>(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function deletePersonalNote(id: string): Promise<void> {
  return notesRequest<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

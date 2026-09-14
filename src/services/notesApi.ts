import { getAuthSession } from '@/src/composables/useAuth'

export interface NotePayload {
  title: string
  content: string
  date: string
  time: string
  tag: string
}
export interface NoteRecord extends NotePayload { id: string; done: boolean }
export interface Household { id: string; name: string; inviteCode: string; isOwner: boolean }
export interface MemberRecord { id: string; name: string; role: string; accent: string; linked: boolean }
export interface TaskRecord extends NoteRecord { assigneeId: string; creatorId: string }

const API_BASE = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export async function notesRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再使用記事。')
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method, credentials: 'include',
      headers: { Authorization: `Bearer ${token}`, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    })
  } catch { throw new Error('無法連線至記事服務，請稍後重試。') }
  const body = response.status === 204 ? undefined : await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : '記事儲存失敗，請確認欄位內容後重試。')
  }
  if (response.status !== 204 && body === null) throw new Error('記事服務回傳格式異常。')
  return body as T
}

export const listPersonalNotes = () => notesRequest<NoteRecord[]>('/notes')
export const createPersonalNote = (data: NotePayload) => notesRequest<NoteRecord>('/notes', 'POST', data)
export const updatePersonalNote = (id: string, data: Partial<NotePayload & { done: boolean }>) => notesRequest<NoteRecord>(`/notes/${encodeURIComponent(id)}`, 'PATCH', data)
export const deletePersonalNote = (id: string) => notesRequest<void>(`/notes/${encodeURIComponent(id)}`, 'DELETE')
export const listHouseholds = () => notesRequest<Household[]>('/households')
export const createHousehold = () => notesRequest<Household>('/households', 'POST', { name: '我的室友協作區' })
export const joinHousehold = (code: string) => notesRequest<Household>(`/households/join/${encodeURIComponent(code)}`, 'POST')
export const groupPath = (id: string) => `/households/${encodeURIComponent(id)}`

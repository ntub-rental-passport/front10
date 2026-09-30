/**
 * 公告、首頁輪播與通知模板的 API（backend/routers/content_api.py）。
 *
 * 公開的只有生效中的公告與輪播（usePublicContent 在讀）；其餘僅限管理員，
 * 稽核由後端記。失敗時丟出後端給的理由，畫面原樣顯示。
 */
import type { Announcement, Banner } from '@/src/mocks/admin/content'
import type { NotifTemplate } from '@/src/mocks/admin/notifications'
import { adminRequest, publicGet } from './adminHttp'

export interface PublicContent {
  banners: Banner[]
  announcements: Announcement[]
}

export type AnnouncementInput = Omit<Announcement, 'id' | 'updatedAt'>
export type BannerInput = Omit<Banner, 'id' | 'updatedAt' | 'order'>
export type TemplateInput = Omit<NotifTemplate, 'id' | 'updatedAt'>

function path(base: string, id: string): string {
  return `${base}/${encodeURIComponent(id)}`
}

/* -------------------- 公開 -------------------- */

export function fetchPublicContent(): Promise<PublicContent | null> {
  return publicGet<PublicContent>('/content/public')
}

/* -------------------- 公告與輪播 -------------------- */

/** 讀不到回 null：畫面要分得出「讀不到」和「真的沒有公告」 */
export async function fetchAdminContent(): Promise<{ announcements: Announcement[]; banners: Banner[] } | null> {
  try {
    return await adminRequest('/admin/content')
  } catch {
    return null
  }
}

const ANNOUNCEMENTS = '/admin/content/announcements'
const BANNERS = '/admin/content/banners'

export function createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  return adminRequest(ANNOUNCEMENTS, { method: 'POST', body: input })
}

export function updateAnnouncement(id: string, input: AnnouncementInput): Promise<Announcement> {
  return adminRequest(path(ANNOUNCEMENTS, id), { method: 'PUT', body: input })
}

export function deleteAnnouncement(id: string): Promise<void> {
  return adminRequest(path(ANNOUNCEMENTS, id), { method: 'DELETE' })
}

export function createBanner(input: BannerInput): Promise<Banner> {
  return adminRequest(BANNERS, { method: 'POST', body: input })
}

export function updateBanner(id: string, input: BannerInput): Promise<Banner> {
  return adminRequest(path(BANNERS, id), { method: 'PUT', body: input })
}

export function deleteBanner(id: string): Promise<void> {
  return adminRequest(path(BANNERS, id), { method: 'DELETE' })
}

/** ids 是排好的完整清單；movedId 只用來寫稽核（「調整輪播「XX」的順序」） */
export function reorderBanners(ids: string[], movedId: string | null): Promise<Banner[]> {
  return adminRequest('/admin/content/banner-order', { method: 'PUT', body: { ids, movedId } })
}

/* -------------------- 通知模板 -------------------- */

const TEMPLATES = '/admin/notification-templates'

/** 後端沒有按鈕時回 null；前端的型別是「沒有這個欄位」，在這裡換成 undefined */
function fromServer(template: NotifTemplate): NotifTemplate {
  return {
    ...template,
    actionUrl: template.actionUrl ?? undefined,
    actionLabel: template.actionLabel ?? undefined,
  }
}

export async function fetchTemplates(): Promise<NotifTemplate[] | null> {
  try {
    return (await adminRequest<NotifTemplate[]>(TEMPLATES)).map(fromServer)
  } catch {
    return null
  }
}

export async function createTemplate(input: TemplateInput): Promise<NotifTemplate> {
  return fromServer(await adminRequest(TEMPLATES, { method: 'POST', body: input }))
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<NotifTemplate> {
  return fromServer(await adminRequest(path(TEMPLATES, id), { method: 'PUT', body: input }))
}

export async function setTemplateEnabled(id: string, enabled: boolean): Promise<NotifTemplate> {
  return fromServer(await adminRequest(`${path(TEMPLATES, id)}/enabled`, { method: 'PATCH', body: { enabled } }))
}

export function deleteTemplate(id: string): Promise<void> {
  return adminRequest(path(TEMPLATES, id), { method: 'DELETE' })
}

import type { Announcement } from '@/src/mocks/admin/content'

export function isAnnouncementActive(a: Announcement, now: Date): boolean {
  if (!a.published) return false
  const current = now.getTime()
  if (current < new Date(a.startAt).getTime()) return false
  if (a.endAt !== null && current > new Date(a.endAt).getTime()) return false
  return true
}

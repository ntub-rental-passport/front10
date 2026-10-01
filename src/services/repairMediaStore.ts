import { readRepairFile, uploadRepairFile, type RepairSide } from './repairApi'
import { validateRepairUpload, type RepairPhotoPurpose } from '@/src/utils/repair-uploads'

export interface RepairPhotoRef { id: string; name: string; type: string; size: number; url?: string; purpose?: RepairPhotoPurpose }
// 草稿只在送出前暫存記憶體，不讀寫或移除原來的 IndexedDB。
const drafts = new Map<string, File>()
const references = new Map<string, RepairPhotoRef>()
export async function saveRepairPhoto(file: File, ticketId?: string, purpose: RepairPhotoPurpose = 'initial', side: RepairSide = 'tenant'): Promise<RepairPhotoRef> {
  const error = validateRepairUpload(file, purpose)
  if (error) throw new Error(error)
  const reference = ticketId ? await uploadRepairFile(side, ticketId, file, purpose) : { id: `draft-${crypto.randomUUID()}`, name: file.name, type: file.type, size: file.size, purpose }
  if (!ticketId) drafts.set(reference.id, file)
  references.set(reference.id, reference)
  return reference
}
export async function uploadDraftPhotos(ticketId: string, photos: RepairPhotoRef[]): Promise<RepairPhotoRef[]> {
  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!
    const file = drafts.get(photo.id)
    if (!file) continue
    const uploaded = await saveRepairPhoto(file, ticketId)
    photos[index] = uploaded
    drafts.delete(photo.id)
  }
  return [...photos]
}
export async function getRepairPhotoUrl(photo: RepairPhotoRef | string): Promise<string> {
  const reference = typeof photo === 'string' ? references.get(photo) : photo
  const id = typeof photo === 'string' ? photo : photo.id
  const draft = drafts.get(id)
  if (draft) return URL.createObjectURL(draft)
  return reference?.url ? readRepairFile(reference.url) : ''
}
export async function removeRepairPhoto(id: string): Promise<void> { drafts.delete(id); references.delete(id) }

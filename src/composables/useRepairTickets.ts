import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { notifyLandlordWorkspaceUpdated } from '@/src/composables/useLandlordWorkspace'
import { getAuthSession } from '@/src/composables/useAuth'
import type { RepairPhotoRef } from '@/src/services/repairMediaStore'

export type RepairUrgency = 'emergency' | 'soon' | 'normal'
export type RepairStatus = 'pending' | 'processing' | 'inspection' | 'completed' | 'canceled'
export type RepairResponsibility = 'pending' | 'landlord' | 'tenant' | 'shared'

export interface RepairTimelineItem {
  id: string
  at: string
  title: string
  detail?: string
  actorRole?: 'tenant' | 'landlord' | 'system'
}

export interface RepairSupplement {
  id: string
  at: string
  note: string
  photoNames: string[]
  photos: RepairPhotoRef[]
}

export interface RepairRescheduleRequest {
  date: string
  startTime: string
  endTime: string
  alternativeDate?: string
  alternativeStartTime?: string
  alternativeEndTime?: string
  note?: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface RepairTicket {
  canonicalStatus: 'new' | 'acknowledged' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  ticketNo: string
  landlordUserId: string
  overdue: boolean
  disputed: boolean
  receipt?: RepairPhotoRef | null
  quote?: RepairPhotoRef | null
  completionPhotos?: RepairPhotoRef[]
  unresolvedPhotos?: RepairPhotoRef[]
  id: string
  tenantUserId: string
  leaseId: string
  propertyId: string
  roomId: string
  property: string
  address: string
  room: string
  tenant: string
  phone: string
  location: string
  equipment: string
  description: string
  photoNames: string[]
  photos: RepairPhotoRef[]
  urgency: RepairUrgency
  availableTime: string
  accessPermission: 'present' | 'absent' | 'contact-first'
  status: RepairStatus
  landlordRead: boolean
  responsibility: RepairResponsibility
  responsibilityNote: string
  vendorName: string
  vendorPhone: string
  scheduledAt: string
  estimatedCost: number | null
  actualCost: number | null
  payer: string
  quoteName: string
  receiptName: string
  tenantScheduleReply: '' | 'accepted' | 'reschedule' | 'contact-first'
  inspectionResult: '' | 'resolved' | 'unresolved' | 'retry'
  contactBeforeArrival: boolean
  supplementRequested: boolean
  supplementRequestNote: string
  supplements: RepairSupplement[]
  rescheduleRequest: RepairRescheduleRequest | null
  responsibilityAgreement: '' | 'agreed' | 'questioned'
  responsibilityQuestion: string
  completionNote: string
  completionPhotoNames: string[]
  unresolvedNote: string
  unresolvedPhotoNames: string[]
  unresolvedSafetyConcern: boolean
  revisitAvailableTime: string
  inventory: {
    brand: string
    model: string
    moveInStatus: string
    moveInPhoto: string
    repairCount: number | null
  }
  createdAt: string
  updatedAt: string
  timeline: RepairTimelineItem[]
}

export interface NewRepairTicket {
  tenantUserId: string
  leaseId: string
  propertyId: string
  roomId: string
  property: string
  address: string
  room: string
  tenant: string
  location: string
  equipment: string
  description: string
  photoNames: string[]
  photos: RepairPhotoRef[]
  urgency: RepairUrgency
  availableTime: string
  accessPermission: RepairTicket['accessPermission']
  phone: string
}

import { fetchRepairs, fetchRepair, patchRepair, postRepair, type RepairSide } from '@/src/services/repairApi'
import { archiveLegacyRepairs } from '@/src/utils/repair-uploads'

export const REPAIR_TICKETS_UPDATED_EVENT = 'rentmate:repair-tickets-updated'

export function useRepairTickets() {
  const session = getAuthSession()
  const side: RepairSide = session?.role === 'landlord' ? 'landlord' : 'tenant'
  const state = reactive({ tickets: [] as RepairTicket[], loading: true, saving: false, error: '', actionError: '' })
  const currentIdentity = () => { const current = getAuthSession(); return current?.userId === session?.userId && current?.role === session?.role }
  function put(ticket: RepairTicket) {
    if (!currentIdentity()) return
    const index = state.tickets.findIndex(item => item.id === ticket.id)
    if (index < 0) state.tickets.unshift(ticket)
    else state.tickets[index] = ticket
    window.dispatchEvent(new CustomEvent(REPAIR_TICKETS_UPDATED_EVENT))
    try { notifyLandlordWorkspaceUpdated('repair') } catch { /* 本機儲存失效不能把成功的伺服器操作顯示成失敗。 */ }
  }
  async function refresh(): Promise<void> {
    state.loading = true
    state.error = ''
    try {
      const result = await fetchRepairs(side)
      state.tickets = currentIdentity() ? result.items : []
    } catch (error) { state.error = error instanceof Error ? error.message : '讀不到報修資料，請重試。' }
    finally { state.loading = false }
  }
  async function mutate<T>(operation: () => Promise<T>): Promise<T | null> {
    if (state.saving) return null
    state.saving = true
    state.actionError = ''
    try { return await operation() }
    catch (error) { state.actionError = error instanceof Error ? error.message : '報修操作失敗，請重試。'; return null }
    finally { state.saving = false }
  }
  async function createTicket(input: NewRepairTicket): Promise<RepairTicket | null> {
    return mutate(async () => { const ticket = await postRepair(input); put(ticket); return ticket })
  }
  async function updateTicket(id: string, updates: Partial<RepairTicket>, event?: { title: string; detail?: string; actorRole?: RepairTimelineItem['actorRole'] }): Promise<RepairTicket | null> {
    return mutate(async () => { const ticket = await patchRepair(side, id, updates, event && { title: event.title, detail: event.detail }); put(ticket); return ticket })
  }
  async function reloadTicket(id: string): Promise<void> { await mutate(async () => { put(await fetchRepair(side, id)) }) }
  async function markRead(id: string): Promise<void> {
    if (!state.tickets.find(item => item.id === id)?.landlordRead) await updateTicket(id, { landlordRead: true })
  }
  const refetch = () => { if (!state.saving) void refresh() }
  onMounted(() => {
    try { archiveLegacyRepairs(window.localStorage) }
    catch { state.actionError = '舊報修資料備份失敗，已保留原始資料；目前僅顯示伺服器資料。' }
    void refresh()
    window.addEventListener('focus', refetch)
  })
  onUnmounted(() => window.removeEventListener('focus', refetch))
  return { tickets: computed(() => state.tickets), loading: computed(() => state.loading), error: computed(() => state.error), saving: computed(() => state.saving), actionError: computed(() => state.actionError), refresh, createTicket, updateTicket, markRead, reloadTicket }
}

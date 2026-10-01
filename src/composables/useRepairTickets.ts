/**
 * 報修工單。
 *
 * 原本整個存在瀏覽器（localStorage + IndexedDB），造成：
 * - 房東只有在「同一台電腦、同一個瀏覽器」才看得到租客的報修
 * - 房東看不到照片，只看到檔名
 * - 房東端列出所有人的工單，沒有依房東過濾
 * - 另有 4 筆寫死的示範工單混在真實資料裡
 *
 * 現在一律讀寫後端（/api/repairs），由伺服器依登入身分限定範圍、
 * 檢查每個角色能改哪些欄位，並把每個動作寫進只能新增的時間軸。
 */
import { computed, reactive } from 'vue'
import { getAuthenticatedUserId, getAuthSession } from '@/src/composables/useAuth'
import { notifyLandlordWorkspaceUpdated } from '@/src/composables/useLandlordWorkspace'
import {
  forgetPending,
  uploadPayload,
  type RepairPhotoRef,
} from '@/src/services/repairMediaStore'
import {
  createRepairTicket,
  fetchRepairTickets,
  markRepairRead,
  patchRepairTicket,
  type RepairPhotoStage,
} from '@/src/services/repairApi'

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
  id: string
  /** 顯示用編號，例如 R-20260930-0012。 */
  code: string
  /** 房東不在平台上（對自己存檔的租約報修）：由租客自行管理與結案。 */
  selfManaged: boolean
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
  receipt: RepairPhotoRef | null
  completionPhotos: RepairPhotoRef[]
  unresolvedPhotos: RepairPhotoRef[]
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
    repairCount: number
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

export const REPAIR_TICKETS_UPDATED_EVENT = 'rentmate:repair-tickets-updated'

const state = reactive({
  tickets: [] as RepairTicket[],
  loading: false,
  /** 這份資料是用哪個身分載入的。同一個帳號可以同時是租客與房東，
   *  切換角色後伺服器回的是另一批工單，必須重新載入。 */
  loadedFor: '',
  error: '',
})

function identityKey(): string {
  const session = getAuthSession()
  return session ? `${session.role}:${getAuthenticatedUserId(session)}` : ''
}

/** 前端自己組的欄位，不送到後端（由伺服器依照片與事件重建）。 */
const CLIENT_ONLY_FIELDS = new Set<keyof RepairTicket>([
  'supplements',
  'photoNames',
  'photos',
  'unresolvedPhotoNames',
  'unresolvedPhotos',
  'completionPhotoNames',
  'completionPhotos',
  'receiptName',
  'receipt',
  'quoteName',
  'landlordRead',
  'timeline',
  'inventory',
  'updatedAt',
])

function replaceTicket(ticket: RepairTicket): void {
  const index = state.tickets.findIndex((item) => item.id === ticket.id)
  if (index === -1) state.tickets.unshift(ticket)
  else state.tickets.splice(index, 1, ticket)
}

function announce(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REPAIR_TICKETS_UPDATED_EVENT))
  notifyLandlordWorkspaceUpdated('repair')
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export interface RepairPhotoUpload {
  stage: RepairPhotoStage
  photos: RepairPhotoRef[]
}

export function useRepairTickets() {
  const tickets = computed(() => state.tickets)
  const loading = computed(() => state.loading)
  const error = computed(() => state.error)

  /** 依登入身分讀取：租客拿到自己的工單，房東拿到自己租約上的工單。 */
  async function load(): Promise<void> {
    const key = identityKey()
    state.loading = true
    state.error = ''
    try {
      state.tickets.splice(0, state.tickets.length, ...(await fetchRepairTickets()))
      state.loadedFor = key
    } catch (cause) {
      state.error = errorMessage(cause, '讀取報修資料失敗，請稍後重試。')
    } finally {
      state.loading = false
    }
  }

  async function createTicket(input: NewRepairTicket): Promise<RepairTicket | null> {
    state.error = ''
    try {
      const ticket = await createRepairTicket({
        target: input.leaseId,
        location: input.location,
        equipment: input.equipment,
        description: input.description,
        urgency: input.urgency,
        availableTime: input.availableTime,
        accessPermission: input.accessPermission,
        phone: input.phone,
        photos: uploadPayload(input.photos),
      })
      forgetPending(input.photos)
      replaceTicket(ticket)
      announce()
      return ticket
    } catch (cause) {
      state.error = errorMessage(cause, '報修送出失敗，請稍後重試。')
      return null
    }
  }

  /**
   * 更新工單。先寫資料庫成功才更新畫面 —— 反過來的話寫入失敗會留下
   * 一個看起來已處理、重整後又變回原狀的案件。
   *
   * 回傳 true 表示已存檔；失敗時錯誤訊息放在 error。
   */
  async function updateTicket(
    id: string,
    updates: Partial<RepairTicket>,
    event: { title: string; detail?: string; actorRole?: RepairTimelineItem['actorRole'] },
    upload?: RepairPhotoUpload,
  ): Promise<boolean> {
    state.error = ''
    const payload = Object.fromEntries(
      Object.entries(updates).filter(([key]) => !CLIENT_ONLY_FIELDS.has(key as keyof RepairTicket)),
    )
    try {
      const ticket = await patchRepairTicket(id, {
        updates: payload,
        // 行為者由伺服器依登入身分記錄，不送 actorRole
        event: { title: event.title, detail: event.detail },
        photos: upload ? uploadPayload(upload.photos) : [],
        photoStage: upload?.photos.length ? upload.stage : null,
      })
      if (upload) forgetPending(upload.photos)
      replaceTicket(ticket)
      announce()
      return true
    } catch (cause) {
      state.error = errorMessage(cause, '更新報修失敗，請稍後重試。')
      return false
    }
  }

  async function markRead(id: string): Promise<void> {
    const ticket = state.tickets.find((item) => item.id === id)
    if (!ticket || ticket.landlordRead) return
    try {
      replaceTicket(await markRepairRead(id))
      announce()
    } catch (cause) {
      state.error = errorMessage(cause, '標記已讀失敗。')
    }
  }

  if (!state.loading && state.loadedFor !== identityKey()) {
    // 換了身分就先清空，避免短暫顯示上一個角色的工單
    state.tickets.splice(0, state.tickets.length)
    void load()
  }

  return { tickets, loading, error, load, createTicket, updateTicket, markRead }
}

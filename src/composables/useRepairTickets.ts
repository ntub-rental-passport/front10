import { computed, reactive } from 'vue'

export type RepairUrgency = 'emergency' | 'soon' | 'normal'
export type RepairStatus = 'pending' | 'processing' | 'inspection' | 'completed' | 'canceled'
export type RepairResponsibility = 'pending' | 'landlord' | 'tenant' | 'shared'

export interface RepairTimelineItem {
  id: string
  at: string
  title: string
  detail?: string
}

export interface RepairTicket {
  id: string
  property: string
  address: string
  room: string
  tenant: string
  phone: string
  location: string
  equipment: string
  description: string
  photoNames: string[]
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
  location: string
  equipment: string
  description: string
  photoNames: string[]
  urgency: RepairUrgency
  availableTime: string
  accessPermission: RepairTicket['accessPermission']
  phone: string
}

const STORAGE_KEY = 'rentmate-repair-tickets-v1'

const seedTickets: RepairTicket[] = [
  {
    id: 'R-20260906-01',
    property: '我的出租物件',
    address: '臺北市中山區松江路 88 號',
    room: '101',
    tenant: '王小明',
    phone: '0912-345-678',
    location: '浴室',
    equipment: '水電',
    description: '洗手台下方水管持續漏水，地面已經有明顯積水。',
    photoNames: ['漏水近照.jpg', '浴室地面.jpg'],
    urgency: 'emergency',
    availableTime: '2026-09-08 14:00–18:00',
    accessPermission: 'contact-first',
    status: 'processing',
    landlordRead: true,
    responsibility: 'landlord',
    responsibilityNote: '屬固定設備自然耗損，由房東負擔。',
    vendorName: '安心水電工程行',
    vendorPhone: '02-2501-8899',
    scheduledAt: '2026-09-08T16:00',
    estimatedCost: 1800,
    actualCost: null,
    payer: '房東負擔',
    quoteName: '水管維修報價.jpg',
    receiptName: '',
    tenantScheduleReply: 'accepted',
    inspectionResult: '',
    inventory: {
      brand: '和成 HCG',
      model: 'LF-4012',
      moveInStatus: '功能正常，排水管外觀良好',
      moveInPhoto: '入住點交照片（2026/05/01）',
      repairCount: 0,
    },
    createdAt: '2026-09-06T14:20:00+08:00',
    updatedAt: '2026-09-07T11:00:00+08:00',
    timeline: [
      { id: 'tl-1', at: '2026-09-06T14:20:00+08:00', title: '租客提交報修' },
      { id: 'tl-2', at: '2026-09-06T15:10:00+08:00', title: '房東已確認', detail: '接受處理並確認由房東負擔。' },
      { id: 'tl-3', at: '2026-09-07T11:00:00+08:00', title: '已安排水電師傅', detail: '預計 09/08 16:00 到場。' },
    ],
  },
  {
    id: 'R-20260905-02',
    property: '我的出租物件',
    address: '臺北市中山區松江路 88 號',
    room: '202',
    tenant: '小白',
    phone: '0988-220-101',
    location: '臥室',
    equipment: '冷氣',
    description: '冷氣開啟後只有送風，沒有冷氣，濾網已自行清潔。',
    photoNames: ['冷氣面板.jpg'],
    urgency: 'soon',
    availableTime: '平日 18:30 後、週六全天',
    accessPermission: 'present',
    status: 'pending',
    landlordRead: false,
    responsibility: 'pending',
    responsibilityNote: '',
    vendorName: '',
    vendorPhone: '',
    scheduledAt: '',
    estimatedCost: null,
    actualCost: null,
    payer: '待確認',
    quoteName: '',
    receiptName: '',
    tenantScheduleReply: '',
    inspectionResult: '',
    inventory: {
      brand: 'DAIKIN 大金',
      model: 'RXM28SVLT',
      moveInStatus: '冷房功能正常，外觀輕微使用痕跡',
      moveInPhoto: '入住點交照片（2026/05/04）',
      repairCount: 1,
    },
    createdAt: '2026-09-05T20:42:00+08:00',
    updatedAt: '2026-09-05T20:42:00+08:00',
    timeline: [{ id: 'tl-4', at: '2026-09-05T20:42:00+08:00', title: '租客提交報修' }],
  },
  {
    id: 'R-20260902-03',
    property: '第二棟',
    address: '臺北市大安區復興南路 120 號',
    room: '3C',
    tenant: '武哥',
    phone: '0933-889-201',
    location: '廚房',
    equipment: '家具',
    description: '流理台下方櫃門鉸鏈鬆脫，門片會傾斜。',
    photoNames: ['櫃門.jpg'],
    urgency: 'normal',
    availableTime: '2026-09-10 上午',
    accessPermission: 'absent',
    status: 'inspection',
    landlordRead: true,
    responsibility: 'landlord',
    responsibilityNote: '固定家具自然耗損。',
    vendorName: '好鄰居居家修繕',
    vendorPhone: '02-2700-5218',
    scheduledAt: '2026-09-05T10:00',
    estimatedCost: 900,
    actualCost: 850,
    payer: '房東負擔',
    quoteName: '鉸鏈估價.png',
    receiptName: '維修收據.jpg',
    tenantScheduleReply: 'accepted',
    inspectionResult: '',
    inventory: {
      brand: '系統櫃',
      model: '無型號',
      moveInStatus: '外觀完整，開闔正常',
      moveInPhoto: '入住點交照片（2026/05/02）',
      repairCount: 0,
    },
    createdAt: '2026-09-02T09:15:00+08:00',
    updatedAt: '2026-09-05T12:12:00+08:00',
    timeline: [
      { id: 'tl-5', at: '2026-09-02T09:15:00+08:00', title: '租客提交報修' },
      { id: 'tl-6', at: '2026-09-02T10:30:00+08:00', title: '房東接受處理' },
      { id: 'tl-7', at: '2026-09-05T12:12:00+08:00', title: '維修完成，等待租客驗收', detail: '已更換兩組緩衝鉸鏈。' },
    ],
  },
  {
    id: 'R-20260818-04',
    property: '我的出租物件',
    address: '臺北市中山區松江路 88 號',
    room: '201',
    tenant: '小紅',
    phone: '0922-331-568',
    location: '客廳',
    equipment: '門窗',
    description: '陽台紗門卡住無法順暢拉動。',
    photoNames: ['紗門完修.jpg'],
    urgency: 'normal',
    availableTime: '週末',
    accessPermission: 'present',
    status: 'completed',
    landlordRead: true,
    responsibility: 'landlord',
    responsibilityNote: '軌道老化，由房東負擔。',
    vendorName: '順發鋁門窗',
    vendorPhone: '02-2517-4420',
    scheduledAt: '2026-08-22T11:00',
    estimatedCost: 1200,
    actualCost: 1200,
    payer: '房東負擔',
    quoteName: '',
    receiptName: '門窗收據.jpg',
    tenantScheduleReply: 'accepted',
    inspectionResult: 'resolved',
    inventory: {
      brand: '一般鋁門窗',
      model: '無型號',
      moveInStatus: '使用正常',
      moveInPhoto: '入住點交照片（2026/05/03）',
      repairCount: 0,
    },
    createdAt: '2026-08-18T10:30:00+08:00',
    updatedAt: '2026-08-22T17:05:00+08:00',
    timeline: [
      { id: 'tl-8', at: '2026-08-18T10:30:00+08:00', title: '租客提交報修' },
      { id: 'tl-9', at: '2026-08-22T13:40:00+08:00', title: '維修完成' },
      { id: 'tl-10', at: '2026-08-22T17:05:00+08:00', title: '租客驗收通過，案件完成' },
    ],
  },
]

function readInitialTickets(): RepairTicket[] {
  if (typeof window === 'undefined') return seedTickets
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RepairTicket[]) : seedTickets
  } catch {
    return seedTickets
  }
}

const state = reactive({ tickets: readInitialTickets() })

function persist(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tickets))
  }
}

function now(): string {
  return new Date().toISOString()
}

function addTimeline(ticket: RepairTicket, title: string, detail?: string): void {
  const at = now()
  ticket.timeline.push({ id: `tl-${Date.now()}`, at, title, detail })
  ticket.updatedAt = at
}

export function useRepairTickets() {
  const tickets = computed(() => state.tickets)

  function createTicket(input: NewRepairTicket): RepairTicket {
    const createdAt = now()
    const ticket: RepairTicket = {
      id: `R-${createdAt.slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-3)}`,
      property: '我的出租物件',
      address: '臺北市中山區松江路 88 號',
      room: '101',
      tenant: '王小明',
      phone: input.phone,
      location: input.location,
      equipment: input.equipment,
      description: input.description,
      photoNames: input.photoNames,
      urgency: input.urgency,
      availableTime: input.availableTime,
      accessPermission: input.accessPermission,
      status: 'pending',
      landlordRead: false,
      responsibility: 'pending',
      responsibilityNote: '',
      vendorName: '',
      vendorPhone: '',
      scheduledAt: '',
      estimatedCost: null,
      actualCost: null,
      payer: '待確認',
      quoteName: '',
      receiptName: '',
      tenantScheduleReply: '',
      inspectionResult: '',
      inventory: {
        brand: '點交清單已有紀錄',
        model: '待確認',
        moveInStatus: '入住時功能正常',
        moveInPhoto: '入住點交照片（2026/05/01）',
        repairCount: 0,
      },
      createdAt,
      updatedAt: createdAt,
      timeline: [{ id: `tl-${Date.now()}`, at: createdAt, title: '租客提交報修' }],
    }
    state.tickets.unshift(ticket)
    persist()
    return ticket
  }

  function updateTicket(id: string, updates: Partial<RepairTicket>, event?: { title: string; detail?: string }): void {
    const ticket = state.tickets.find((item) => item.id === id)
    if (!ticket) return
    Object.assign(ticket, updates)
    if (event) addTimeline(ticket, event.title, event.detail)
    else ticket.updatedAt = now()
    persist()
  }

  function markRead(id: string): void {
    const ticket = state.tickets.find((item) => item.id === id)
    if (!ticket || ticket.landlordRead) return
    ticket.landlordRead = true
    addTimeline(ticket, '房東已讀報修內容')
    persist()
  }

  function resetDemo(): void {
    state.tickets.splice(0, state.tickets.length, ...JSON.parse(JSON.stringify(seedTickets)))
    persist()
  }

  return { tickets, createTicket, updateTicket, markRead, resetDemo }
}

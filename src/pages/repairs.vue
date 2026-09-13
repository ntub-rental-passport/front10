<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileImage,
  Home,
  MessageCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Wrench,
  X,
} from 'lucide-vue-next'
import { getAuthenticatedUserId, getAuthSession } from '@/src/composables/useAuth'
import {
  useRepairTickets,
  type NewRepairTicket,
  type RepairStatus,
  type RepairUrgency,
} from '@/src/composables/useRepairTickets'
import { fetchTenantLeases, type TenantLeaseOption } from '@/src/services/tenantLeaseApi'
import {
  getRepairPhotoUrl,
  removeRepairPhoto,
  saveRepairPhoto,
  type RepairPhotoRef,
} from '@/src/services/repairMediaStore'

const session = getAuthSession()
const tenantUserId = getAuthenticatedUserId(session)
const { tickets, createTicket, updateTicket, claimDemoTenantTickets } = useRepairTickets()
claimDemoTenantTickets(tenantUserId)
const tenantTickets = computed(() =>
  tickets.value.filter((item) => item.tenantUserId === tenantUserId),
)
const selectedId = ref(tenantTickets.value[0]?.id ?? '')
const selected = computed(
  () => tenantTickets.value.find((item) => item.id === selectedId.value) ?? tenantTickets.value[0],
)

const demoLease: TenantLeaseOption = {
  leaseId: 'lease-demo-101',
  propertyId: 'property-demo-1',
  roomId: 'room-demo-101',
  property: '我的出租物件',
  address: '臺北市中山區松江路 88 號',
  room: '101',
  tenant: session?.nickname || '王小明',
  phone: '0912-345-678',
  startDate: '2026-05-01',
  endDate: '2027-04-30',
  status: 'active',
  effective: true,
}
const leases = ref<TenantLeaseOption[]>([])
const leaseLoadError = ref('')
const activeLeases = computed(() => leases.value.filter((lease) => lease.effective))
const selectedLeaseId = ref('')
const selectedLease = computed(
  () =>
    activeLeases.value.find((lease) => lease.leaseId === selectedLeaseId.value) ??
    activeLeases.value[0],
)

const createOpen = ref(false)
const summaryOpen = ref(false)
const supplementOpen = ref(false)
const rescheduleOpen = ref(false)
const unresolvedOpen = ref(false)
const questionOpen = ref(false)
const timelineOpen = ref(false)
const toast = ref('')
const formError = ref('')
const uploadError = ref('')
const uploadBusy = ref(false)
const photoUrls = ref<Record<string, string>>({})
const formPhotos = ref<RepairPhotoRef[]>([])
const formPhotoUrls = ref<Record<string, string>>({})

const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)
const toDateInput = (value: Date) =>
  [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
const minimumRepairDate = toDateInput(today)
const repairDate = ref(toDateInput(tomorrow))
const repairStartTime = ref('14:00')
const repairEndTime = ref('18:00')
const timeOptions = Array.from({ length: 29 }, (_, index) => {
  const minutes = 8 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})
const startTimeOptions = timeOptions.slice(0, -1)
const endOptions = (start: string) => timeOptions.filter((time) => time > start)
const endTimeOptions = computed(() => endOptions(repairStartTime.value))

const locationItems: Record<string, string[]> = {
  客廳: ['冷氣', '照明', '家具', '門窗', '插座', '其他'],
  臥室: ['冷氣', '照明', '家具', '門窗', '插座', '其他'],
  浴室: ['熱水器｜HCG LF-4012', '洗手台', '馬桶', '排水', '水管漏水', '照明', '其他'],
  廚房: ['冰箱', '流理台', '排水', '水管漏水', '瓦斯設備', '照明', '其他'],
  陽台: ['洗衣機', '排水', '水龍頭', '門窗', '照明', '其他'],
  公共區域: ['照明', '門鎖', '電梯', '消防設備', '其他'],
}

function emptyForm(): NewRepairTicket {
  return {
    tenantUserId,
    leaseId: '',
    propertyId: '',
    roomId: '',
    property: '',
    address: '',
    room: '',
    tenant: '',
    location: '浴室',
    equipment: '水管漏水',
    description: '',
    photoNames: [],
    photos: [],
    urgency: 'soon',
    availableTime: '',
    accessPermission: 'contact-first',
    phone: selectedLease.value?.phone || '',
  }
}
const form = ref<NewRepairTicket>(emptyForm())

const statusMeta: Record<RepairStatus, { label: string; cls: string }> = {
  pending: { label: '等待房東確認', cls: 'amber' },
  processing: { label: '已安排處理', cls: 'blue' },
  inspection: { label: '等待你驗收', cls: 'purple' },
  completed: { label: '已完成', cls: 'green' },
  canceled: { label: '已取消', cls: 'red' },
}
const urgencyMeta: Record<
  RepairUrgency,
  { label: string; title: string; example: string; cls: string }
> = {
  emergency: {
    label: '緊急',
    title: '可能影響人身或居住安全',
    example: '漏電、瓦斯味、大量漏水、門鎖故障',
    cls: 'red',
  },
  soon: {
    label: '儘快處理',
    title: '明顯影響日常使用',
    example: '無熱水、冷氣故障、馬桶堵塞',
    cls: 'amber',
  },
  normal: {
    label: '一般',
    title: '尚可正常居住',
    example: '櫃門鬆脫、燈泡故障、家具刮損',
    cls: 'green',
  },
}
const milestones = [
  { status: 'pending', label: '提出問題' },
  { status: 'processing', label: '確認與安排' },
  { status: 'inspection', label: '完修驗收' },
  { status: 'completed', label: '留下紀錄' },
] as const
const stepIndex = computed(
  () =>
    ({ pending: 0, processing: 1, inspection: 2, completed: 3, canceled: 0 })[
      selected.value?.status ?? 'pending'
    ],
)
const activeCount = computed(
  () =>
    tenantTickets.value.filter((item) => !['completed', 'canceled'].includes(item.status)).length,
)
const pendingActionCount = computed(
  () =>
    tenantTickets.value.filter(
      (item) =>
        item.supplementRequested ||
        item.status === 'inspection' ||
        (item.status === 'processing' && item.scheduledAt && !item.tenantScheduleReply),
    ).length,
)
const nextMaintenance = computed(
  () =>
    tenantTickets.value
      .filter((item) => !['completed', 'canceled'].includes(item.status) && item.scheduledAt)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
      ?.scheduledAt ?? '',
)
const latestActivities = computed(() => [...(selected.value?.timeline ?? [])].reverse().slice(0, 2))
const allActivities = computed(() => [...(selected.value?.timeline ?? [])].reverse())
const needsScheduleConfirmation = computed(() =>
  Boolean(
    selected.value?.status === 'processing' &&
    selected.value.scheduledAt &&
    !selected.value.tenantScheduleReply,
  ),
)
const money = (value: number | null) =>
  value === null ? '尚未提供' : `NT$${value.toLocaleString('zh-TW')}`
const formatDateTime = (value: string) =>
  value
    ? new Date(value).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '尚未安排'
const formatShortDateTime = (value: string) =>
  value
    ? new Date(value).toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '尚未安排'
const accessLabel = computed(() =>
  selected.value
    ? {
        present: '僅限我在場時進入',
        absent: '同意無人在場時進入',
        'contact-first': '進入前請先聯絡我',
      }[selected.value.accessPermission]
    : '',
)

const supplementNote = ref('')
const supplementPhotos = ref<RepairPhotoRef[]>([])
const questionNote = ref('')
const reschedule = ref({
  date: toDateInput(tomorrow),
  startTime: '14:00',
  endTime: '18:00',
  alternativeEnabled: false,
  alternativeDate: '',
  alternativeStartTime: '18:00',
  alternativeEndTime: '20:00',
  note: '',
})
const unresolved = ref({
  note: '',
  safetyConcern: false,
  date: toDateInput(tomorrow),
  startTime: '14:00',
  endTime: '18:00',
})
const unresolvedPhotos = ref<RepairPhotoRef[]>([])

onMounted(async () => {
  try {
    const remoteLeases = await fetchTenantLeases()
    leases.value = remoteLeases.length || session?.accessToken ? remoteLeases : [demoLease]
  } catch {
    leaseLoadError.value = session?.accessToken
      ? '租約服務暫時無法連線，為避免送錯物件，目前先停用新增報修。'
      : '目前使用本機示範租約；串接正式帳號後會自動載入有效租約。'
    leases.value = session?.accessToken ? [] : [demoLease]
  }
  selectedLeaseId.value = activeLeases.value[0]?.leaseId ?? ''
  form.value.phone = selectedLease.value?.phone || ''
})

watch(repairStartTime, () => {
  if (!endTimeOptions.value.includes(repairEndTime.value))
    repairEndTime.value = endTimeOptions.value[3] ?? ''
})
watch(
  () => form.value.location,
  (location) => {
    const items = locationItems[location] ?? ['其他']
    if (!items.includes(form.value.equipment)) form.value.equipment = items[0]
  },
)
watch(
  () => selected.value?.id,
  () => {
    timelineOpen.value = false
  },
)
watch(
  () => selected.value?.photos,
  async (photos) => {
    Object.values(photoUrls.value).forEach((url) => URL.revokeObjectURL(url))
    const entries = await Promise.all(
      (photos ?? []).map(async (photo) => [photo.id, await getRepairPhotoUrl(photo.id)] as const),
    )
    photoUrls.value = Object.fromEntries(entries)
  },
  { immediate: true },
)

function notify(message: string): void {
  toast.value = message
  window.setTimeout(() => (toast.value = ''), 2600)
}

async function processPhotos(
  files: File[],
  target: 'form' | 'supplement' | 'unresolved',
): Promise<void> {
  uploadError.value = ''
  const allowed = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
  const current =
    target === 'form'
      ? formPhotos.value
      : target === 'supplement'
        ? supplementPhotos.value
        : unresolvedPhotos.value
  const accepted = files.slice(0, Math.max(0, 5 - current.length))
  const invalid = accepted.find((file) => !allowed.has(file.type) || file.size > 10 * 1024 * 1024)
  if (invalid) {
    uploadError.value = `${invalid.name} 不符合 JPG、PNG、HEIC 或 10MB 上限。`
    return
  }
  uploadBusy.value = true
  try {
    const saved = await Promise.all(accepted.map(saveRepairPhoto))
    current.push(...saved)
    if (target === 'form') {
      form.value.photos = [...current]
      form.value.photoNames = current.map((photo) => photo.name)
      for (const photo of saved) formPhotoUrls.value[photo.id] = await getRepairPhotoUrl(photo.id)
    }
  } finally {
    uploadBusy.value = false
  }
}

function handlePhotos(event: Event, target: 'form' | 'supplement' | 'unresolved' = 'form'): void {
  const input = event.target as HTMLInputElement
  void processPhotos(Array.from(input.files ?? []), target)
  input.value = ''
}

async function removeFormPhoto(photo: RepairPhotoRef): Promise<void> {
  await removeRepairPhoto(photo.id)
  if (formPhotoUrls.value[photo.id]) URL.revokeObjectURL(formPhotoUrls.value[photo.id])
  formPhotos.value = formPhotos.value.filter((item) => item.id !== photo.id)
  form.value.photos = [...formPhotos.value]
  form.value.photoNames = formPhotos.value.map((item) => item.name)
}

function reviewForm(): void {
  formError.value = ''
  if (!selectedLease.value) {
    formError.value = '目前沒有可報修的有效租約。'
    return
  }
  if (!form.value.description.trim()) {
    formError.value = '請填寫問題描述。'
    return
  }
  if (
    !repairDate.value ||
    !repairStartTime.value ||
    !repairEndTime.value ||
    repairEndTime.value <= repairStartTime.value
  ) {
    formError.value = '請選擇有效的方便維修日期與起訖時間。'
    return
  }
  form.value.availableTime = `${repairDate.value} ${repairStartTime.value}–${repairEndTime.value}`
  summaryOpen.value = true
}

function submitRepair(): void {
  const lease = selectedLease.value
  if (!lease) return
  const ticket = createTicket({
    ...form.value,
    tenantUserId,
    leaseId: lease.leaseId,
    propertyId: lease.propertyId,
    roomId: lease.roomId,
    property: lease.property,
    address: lease.address,
    room: lease.room,
    tenant: lease.tenant,
    phone: form.value.phone || lease.phone,
  })
  selectedId.value = ticket.id
  summaryOpen.value = false
  createOpen.value = false
  formPhotos.value = []
  formPhotoUrls.value = {}
  form.value = emptyForm()
  notify('報修已送出，房東收到新案件通知')
}

function closeRepairDialogs(): void {
  summaryOpen.value = false
  createOpen.value = false
}

function acceptSchedule(): void {
  if (!selected.value) return
  updateTicket(
    selected.value.id,
    { tenantScheduleReply: 'accepted', rescheduleRequest: null },
    {
      title: '租客已確認維修時段',
      detail: `${formatDateTime(selected.value.scheduledAt)}；${selected.value.contactBeforeArrival ? '到場前請先聯絡' : '依原進場方式'}`,
      actorRole: 'tenant',
    },
  )
  notify('已確認維修時段並通知房東')
}

function submitReschedule(): void {
  if (
    !selected.value ||
    !reschedule.value.date ||
    reschedule.value.endTime <= reschedule.value.startTime
  )
    return
  const primary = `${reschedule.value.date} ${reschedule.value.startTime}–${reschedule.value.endTime}`
  const alternative =
    reschedule.value.alternativeEnabled && reschedule.value.alternativeDate
      ? `${reschedule.value.alternativeDate} ${reschedule.value.alternativeStartTime}–${reschedule.value.alternativeEndTime}`
      : ''
  updateTicket(
    selected.value.id,
    {
      tenantScheduleReply: 'reschedule',
      rescheduleRequest: {
        date: reschedule.value.date,
        startTime: reschedule.value.startTime,
        endTime: reschedule.value.endTime,
        alternativeDate: reschedule.value.alternativeDate || undefined,
        alternativeStartTime: reschedule.value.alternativeStartTime || undefined,
        alternativeEndTime: reschedule.value.alternativeEndTime || undefined,
        note: reschedule.value.note,
        status: 'pending',
      },
    },
    {
      title: '租客申請改期',
      detail: `可配合 ${primary}${alternative ? `；備選 ${alternative}` : ''}${reschedule.value.note ? `；${reschedule.value.note}` : ''}`,
      actorRole: 'tenant',
    },
  )
  rescheduleOpen.value = false
  notify('改期需求已送給房東')
}

function submitSupplement(): void {
  if (!selected.value || (!supplementNote.value.trim() && !supplementPhotos.value.length)) return
  const at = new Date().toISOString()
  updateTicket(
    selected.value.id,
    {
      supplementRequested: false,
      supplementRequestNote: '',
      supplements: [
        ...selected.value.supplements,
        {
          id: `sup-${Date.now()}`,
          at,
          note: supplementNote.value.trim(),
          photoNames: supplementPhotos.value.map((photo) => photo.name),
          photos: [...supplementPhotos.value],
        },
      ],
    },
    {
      title: '租客已補充報修資料',
      detail: `${supplementNote.value.trim()}${supplementPhotos.value.length ? `（新增 ${supplementPhotos.value.length} 張照片）` : ''}`,
      actorRole: 'tenant',
    },
  )
  supplementNote.value = ''
  supplementPhotos.value = []
  supplementOpen.value = false
  notify('補充資料已送出')
}

function cancelTicket(): void {
  if (!selected.value || !window.confirm('確定要取消這筆報修嗎？原始紀錄仍會保留。')) return
  updateTicket(
    selected.value.id,
    { status: 'canceled' },
    {
      title: '租客取消報修',
      detail: '案件已取消，原始報修與操作紀錄仍保留。',
      actorRole: 'tenant',
    },
  )
  notify('報修已取消')
}

function agreeResponsibility(): void {
  if (!selected.value) return
  updateTicket(
    selected.value.id,
    { responsibilityAgreement: 'agreed', responsibilityQuestion: '' },
    { title: '租客已確認費用與責任說明', actorRole: 'tenant' },
  )
  notify('確認紀錄已保存')
}

function submitQuestion(): void {
  if (!selected.value || !questionNote.value.trim()) return
  updateTicket(
    selected.value.id,
    { responsibilityAgreement: 'questioned', responsibilityQuestion: questionNote.value.trim() },
    { title: '租客對責任或金額提出疑問', detail: questionNote.value.trim(), actorRole: 'tenant' },
  )
  questionOpen.value = false
  questionNote.value = ''
  notify('疑問已送給房東')
}

function resolveInspection(): void {
  if (!selected.value) return
  updateTicket(
    selected.value.id,
    { inspectionResult: 'resolved', status: 'completed' },
    { title: '租客驗收通過，案件完成', actorRole: 'tenant' },
  )
  notify('驗收完成，案件紀錄已保存')
}

function submitUnresolved(): void {
  if (
    !selected.value ||
    !unresolved.value.note.trim() ||
    unresolved.value.endTime <= unresolved.value.startTime
  )
    return
  const revisit = `${unresolved.value.date} ${unresolved.value.startTime}–${unresolved.value.endTime}`
  updateTicket(
    selected.value.id,
    {
      inspectionResult: 'unresolved',
      status: 'processing',
      unresolvedNote: unresolved.value.note.trim(),
      unresolvedPhotoNames: unresolvedPhotos.value.map((photo) => photo.name),
      unresolvedSafetyConcern: unresolved.value.safetyConcern,
      revisitAvailableTime: revisit,
    },
    {
      title: '租客回報問題仍未解決',
      detail: `${unresolved.value.note.trim()}；可再次維修 ${revisit}${unresolved.value.safetyConcern ? '；仍有安全疑慮' : ''}`,
      actorRole: 'tenant',
    },
  )
  unresolvedOpen.value = false
  unresolvedPhotos.value = []
  notify('已通知房東再次處理')
}
</script>

<template>
  <div class="tenant-repair-page min-h-full w-full space-y-5 p-4 text-[#18233d] md:p-6 xl:p-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="eyebrow">住家服務</p>
        <h1 class="text-3xl font-extrabold tracking-tight">家具與設備報修</h1>
        <p class="mt-1.5 text-sm text-[#5f6e85]">
          快速回報問題，掌握房東回覆、維修時間與費用確認。
        </p>
      </div>
      <button class="btn primary" :disabled="!activeLeases.length" @click="createOpen = true">
        <Plus />建立報修單
      </button>
    </header>
    <p v-if="leaseLoadError" class="service-note">{{ leaseLoadError }}</p>
    <section class="grid gap-3 sm:grid-cols-3">
      <article class="metric">
        <span><Clock3 /></span>
        <div>
          <small>進行中</small><strong>{{ activeCount }}</strong>
        </div>
      </article>
      <article class="metric">
        <span><CheckCircle2 /></span>
        <div>
          <small>待我確認</small><strong>{{ pendingActionCount }}</strong>
        </div>
      </article>
      <article class="metric">
        <span><CalendarClock /></span>
        <div>
          <small>下一次維修</small
          ><strong class="text-base">{{
            nextMaintenance ? formatShortDateTime(nextMaintenance) : '尚未安排'
          }}</strong>
        </div>
      </article>
    </section>

    <section class="grid items-start gap-5 lg:grid-cols-[minmax(280px,24%)_minmax(0,1fr)]">
      <aside class="panel overflow-hidden">
        <header class="panel-head">
          <div>
            <h2>我的報修</h2>
            <p>依登入帳號顯示你的租約案件。</p>
          </div>
          <span>{{ tenantTickets.length }}</span>
        </header>
        <div class="space-y-2 p-3">
          <button
            v-for="item in tenantTickets"
            :key="item.id"
            class="ticket-card"
            :class="{ active: selected?.id === item.id }"
            :aria-selected="selected?.id === item.id"
            @click="selectedId = item.id"
          >
            <div class="flex items-start justify-between gap-2">
              <b>{{ item.location }}／{{ item.equipment }}</b
              ><span class="badge" :class="statusMeta[item.status].cls">{{
                statusMeta[item.status].label
              }}</span>
            </div>
            <p>{{ item.description }}</p>
            <small>{{ formatShortDateTime(item.createdAt) }} · {{ item.id }}</small>
          </button>
          <button class="new-card" :disabled="!activeLeases.length" @click="createOpen = true">
            <Plus />回報新的問題
          </button>
        </div>
      </aside>

      <article v-if="selected" class="panel overflow-hidden">
        <header class="panel-head">
          <div>
            <p>{{ selected.id }}</p>
            <h2>{{ selected.location }}／{{ selected.equipment }}</h2>
          </div>
          <span class="badge" :class="statusMeta[selected.status].cls">{{
            statusMeta[selected.status].label
          }}</span>
        </header>
        <div class="space-y-5 p-4 sm:p-5">
          <section v-if="selected.status !== 'canceled'" class="steps">
            <div
              v-for="(item, index) in milestones"
              :key="item.status"
              :class="{ done: index <= stepIndex }"
            >
              <i
                ><Check v-if="index < stepIndex" /><span v-else>{{ index + 1 }}</span></i
              ><b>{{ item.label }}</b>
            </div>
          </section>

          <section v-if="selected.supplementRequested" class="action-card urgent-action">
            <div>
              <p>需要你處理</p>
              <h3>房東需要你補充資料</h3>
              <span>{{ selected.supplementRequestNote || '請依房東要求補充文字或照片。' }}</span>
            </div>
            <button class="btn primary" @click="supplementOpen = true">補充文字與照片</button>
          </section>
          <section v-else-if="needsScheduleConfirmation" class="action-card">
            <div>
              <p>需要你確認</p>
              <h3>
                {{ formatDateTime(selected.scheduledAt) }}・{{
                  selected.vendorName || '維修人員待確認'
                }}
              </h3>
              <label class="contact-option"
                ><input v-model="selected.contactBeforeArrival" type="checkbox" />
                到場前請先聯絡我</label
              >
            </div>
            <div class="action-buttons">
              <button class="btn primary" @click="acceptSchedule">確認此時段</button
              ><button class="btn secondary" @click="rescheduleOpen = true">申請改期</button>
            </div>
          </section>
          <section
            v-else-if="selected.rescheduleRequest?.status === 'pending'"
            class="action-card waiting"
          >
            <div>
              <p>目前回覆</p>
              <h3>已申請改期，等待房東重新安排</h3>
              <span
                >希望時段：{{ selected.rescheduleRequest.date }}
                {{ selected.rescheduleRequest.startTime }}–{{
                  selected.rescheduleRequest.endTime
                }}</span
              >
            </div>
            <button class="btn secondary" @click="rescheduleOpen = true">修改需求</button>
          </section>
          <section v-else-if="selected.status === 'inspection'" class="action-card">
            <div>
              <p>需要你處理</p>
              <h3>維修完成，請確認問題是否解決</h3>
              <span>請先查看完修說明、照片、實際費用與憑證。</span>
            </div>
            <div class="action-buttons">
              <button class="btn primary" @click="resolveInspection">
                <CheckCircle2 />問題已解決，完成案件</button
              ><button class="btn secondary" @click="unresolvedOpen = true">
                <Wrench />問題仍未解決
              </button>
            </div>
          </section>

          <section
            v-if="
              selected.urgency === 'emergency' &&
              ['pending', 'processing'].includes(selected.status)
            "
            class="danger"
          >
            <AlertTriangle />
            <div>
              <b>有立即危險時請先離開現場</b>
              <p>
                若有火災、瓦斯外洩、嚴重漏電或人身危險，請先聯絡
                119、相關公用事業或管理單位。線上報修不等於緊急服務已受理。
              </p>
            </div>
          </section>
          <p
            v-else-if="selected.urgency === 'emergency' && selected.status === 'inspection'"
            class="emergency-history"
          >
            <AlertTriangle />原列為緊急案件；若現場仍有危險，請在驗收回覆中勾選安全疑慮。
          </p>
          <section v-if="selected.status === 'canceled'" class="danger">
            <AlertTriangle />
            <div>
              <b>此案件已取消</b>
              <p>{{ selected.responsibilityNote || '原始報修與處理紀錄仍保留。' }}</p>
            </div>
          </section>

          <section class="summary-grid">
            <div>
              <span><CalendarClock />預計維修時間</span
              ><b>{{
                selected.scheduledAt ? formatDateTime(selected.scheduledAt) : '房東尚未安排'
              }}</b>
            </div>
            <div>
              <span><UserRound />維修人員</span
              ><b
                >{{ selected.vendorName || '尚未提供'
                }}<small v-if="selected.vendorPhone">{{ selected.vendorPhone }}</small></b
              >
            </div>
            <div>
              <span><ShieldCheck />責任與費用</span
              ><b
                >{{ selected.payer || '待確認'
                }}<small>預估 {{ money(selected.estimatedCost) }}</small></b
              >
            </div>
            <div>
              <span><CheckCircle2 />房東是否已讀</span
              ><b>{{ selected.landlordRead ? '房東已讀' : '尚未讀取' }}</b>
            </div>
          </section>

          <section v-if="latestActivities.length" class="latest">
            <MessageCircle />
            <div class="w-full">
              <span>最新動態</span>
              <article v-for="item in latestActivities" :key="item.id">
                <b>{{ item.title }}</b
                ><time>{{ formatShortDateTime(item.at) }}</time>
                <p v-if="item.detail">{{ item.detail }}</p>
              </article>
            </div>
          </section>

          <section class="soft">
            <h3>報修內容</h3>
            <dl>
              <div>
                <dt>租屋地址</dt>
                <dd>{{ selected.address }}／{{ selected.room }}</dd>
              </div>
              <div>
                <dt>問題描述</dt>
                <dd>{{ selected.description }}</dd>
              </div>
              <div>
                <dt>方便時段</dt>
                <dd>{{ selected.availableTime }}</dd>
              </div>
              <div>
                <dt>進場方式</dt>
                <dd>{{ accessLabel }}</dd>
              </div>
            </dl>
            <div v-if="selected.photos.length" class="photo-grid">
              <a
                v-for="photo in selected.photos"
                :key="photo.id"
                :href="photoUrls[photo.id]"
                target="_blank"
                ><img
                  v-if="photoUrls[photo.id]"
                  :src="photoUrls[photo.id]"
                  :alt="photo.name"
                /><span>{{ photo.name }}</span></a
              >
            </div>
            <div v-else class="mt-3 flex flex-wrap gap-2">
              <span v-for="name in selected.photoNames" :key="name" class="file"
                ><FileImage />{{ name }}</span
              >
            </div>
            <div v-if="selected.status === 'pending'" class="sub-actions">
              <button @click="supplementOpen = true">補充說明或照片</button
              ><button class="danger-link" @click="cancelTicket">取消報修</button>
            </div>
          </section>

          <section v-if="selected.responsibility !== 'pending'" class="soft">
            <div class="section-title">
              <div>
                <h3>責任與費用說明</h3>
                <p>系統呈現雙方資料，不直接作法律判定。</p>
              </div>
              <span class="badge blue">{{ selected.payer }}</span>
            </div>
            <dl>
              <div>
                <dt>房東說明</dt>
                <dd>{{ selected.responsibilityNote || '尚未填寫' }}</dd>
              </div>
              <div>
                <dt>入住狀況</dt>
                <dd>{{ selected.inventory.moveInStatus }}</dd>
              </div>
              <div>
                <dt>設備資料</dt>
                <dd>{{ selected.inventory.brand }} {{ selected.inventory.model }}</dd>
              </div>
              <div>
                <dt>預估／實際</dt>
                <dd>{{ money(selected.estimatedCost) }}／{{ money(selected.actualCost) }}</dd>
              </div>
              <div>
                <dt>費用扣除</dt>
                <dd>不會自動從租金或押金扣除</dd>
              </div>
              <div>
                <dt>憑證</dt>
                <dd>{{ selected.receiptName || selected.quoteName || '尚未提供' }}</dd>
              </div>
            </dl>
            <div v-if="selected.responsibilityAgreement !== 'agreed'" class="sub-actions">
              <button @click="agreeResponsibility">同意費用負擔</button
              ><button @click="questionOpen = true">對責任或金額有疑問</button>
            </div>
            <p v-else class="confirmed"><Check />你已確認這份責任與費用說明</p>
          </section>

          <section v-if="selected.status === 'inspection'" class="soft">
            <h3>完修資料</h3>
            <dl>
              <div>
                <dt>完修說明</dt>
                <dd>{{ selected.completionNote || '房東尚未填寫完修說明' }}</dd>
              </div>
              <div>
                <dt>實際費用</dt>
                <dd>{{ money(selected.actualCost) }}</dd>
              </div>
              <div>
                <dt>收據／發票</dt>
                <dd>{{ selected.receiptName || '尚未提供' }}</dd>
              </div>
              <div>
                <dt>完修照片</dt>
                <dd>
                  {{
                    selected.completionPhotoNames.length
                      ? selected.completionPhotoNames.join('、')
                      : '尚未提供'
                  }}
                </dd>
              </div>
            </dl>
          </section>

          <section class="soft">
            <button
              class="timeline-toggle"
              :aria-expanded="timelineOpen"
              @click="timelineOpen = !timelineOpen"
            >
              <span>完整時間軸　{{ selected.timeline.length }} 筆</span
              ><ChevronDown :class="{ rotate: timelineOpen }" />
            </button>
            <div v-if="timelineOpen" class="timeline">
              <div v-for="item in allActivities" :key="item.id">
                <i />
                <p>
                  <b>{{ item.title }}</b
                  ><span>{{ formatShortDateTime(item.at) }}</span>
                </p>
                <small v-if="item.detail">{{ item.detail }}</small>
              </div>
            </div>
          </section>
        </div>
      </article>
      <section v-else class="panel empty">
        <Home />
        <h2>目前沒有報修案件</h2>
        <p>你可以從有效租約建立第一筆報修。</p>
        <button class="btn primary" :disabled="!activeLeases.length" @click="createOpen = true">
          建立報修單
        </button>
      </section>
    </section>

    <Transition name="toast"
      ><div v-if="toast" class="toast"><Check />{{ toast }}</div></Transition
    >

    <Teleport to="body">
      <div v-if="createOpen" class="backdrop" @click.self="createOpen = false">
        <form class="repair-form" @submit.prevent="reviewForm">
          <header>
            <div>
              <p>約 2 分鐘完成</p>
              <h2>建立報修單</h2>
            </div>
            <button type="button" class="close" aria-label="關閉" @click="createOpen = false">
              <X />
            </button>
          </header>
          <div class="form-scroll">
            <label v-if="activeLeases.length > 1" class="field-title"
              >選擇租約<select v-model="selectedLeaseId">
                <option v-for="lease in activeLeases" :key="lease.leaseId" :value="lease.leaseId">
                  {{ lease.property }}／{{ lease.room }}（{{ lease.startDate }}～{{
                    lease.endDate
                  }}）
                </option>
              </select></label
            >
            <section v-if="selectedLease" class="address">
              <Home />
              <div>
                <span>租屋地址（依有效租約帶入）</span
                ><b>{{ selectedLease.address }}／{{ selectedLease.room }}</b>
              </div>
            </section>
            <div class="form-grid">
              <label
                >報修位置<select v-model="form.location">
                  <option v-for="value in Object.keys(locationItems)" :key="value">
                    {{ value }}
                  </option>
                </select></label
              ><label
                >設備／問題項目<select v-model="form.equipment">
                  <option v-for="value in locationItems[form.location]" :key="value">
                    {{ value }}
                  </option>
                </select></label
              ><label class="full"
                >問題描述<textarea
                  v-model="form.description"
                  required
                  placeholder="請描述發生情況、開始時間與是否仍可使用"
                /></label
              ><label class="full"
                >問題照片（最多 5 張）<span class="upload"
                  ><Camera />{{ uploadBusy ? '上傳中…' : '選擇照片'
                  }}<input
                    class="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/heic,image/heif"
                    multiple
                    :disabled="uploadBusy"
                    @change="handlePhotos($event, 'form')" /></span
                ><small>支援 JPG、PNG、HEIC，每張最大 10MB；照片內容會保存於媒體儲存層。</small
                ><span v-if="uploadError" class="form-error"
                  ><AlertTriangle />{{ uploadError }}</span
                ></label
              >
            </div>
            <div v-if="formPhotos.length" class="upload-list">
              <div v-for="photo in formPhotos" :key="photo.id">
                <img :src="formPhotoUrls[photo.id]" :alt="photo.name" /><span
                  >{{ photo.name
                  }}<small>{{ (photo.size / 1024 / 1024).toFixed(1) }} MB</small></span
                ><button type="button" aria-label="移除照片" @click="removeFormPhoto(photo)">
                  <Trash2 />
                </button>
              </div>
            </div>
            <fieldset>
              <legend>緊急程度</legend>
              <div class="urgency-grid">
                <button
                  v-for="(meta, value) in urgencyMeta"
                  :key="value"
                  type="button"
                  :class="[meta.cls, { selected: form.urgency === value }]"
                  @click="form.urgency = value"
                >
                  <b>{{ meta.label }}</b
                  ><span>{{ meta.title }}</span
                  ><small>{{ meta.example }}</small>
                </button>
              </div>
              <div v-if="form.urgency === 'emergency'" class="danger mt-3">
                <AlertTriangle />
                <div>
                  <b>線上報修不是緊急服務</b>
                  <p>
                    有火災、瓦斯外洩、嚴重漏電或人身危險時，請先離開現場並聯絡
                    119、相關公用事業或管理單位。
                  </p>
                </div>
              </div>
            </fieldset>
            <div class="form-grid">
              <div class="full">
                <span class="field-title">方便維修時段</span>
                <div class="time-grid">
                  <label
                    >日期<input
                      v-model="repairDate"
                      :min="minimumRepairDate"
                      required
                      type="date" /></label
                  ><label
                    >開始時間<select v-model="repairStartTime" required>
                      <option v-for="time in startTimeOptions" :key="time">{{ time }}</option>
                    </select></label
                  ><label
                    >結束時間<select v-model="repairEndTime" required>
                      <option v-for="time in endTimeOptions" :key="time">{{ time }}</option>
                    </select></label
                  >
                </div>
              </div>
              <label class="full"
                >房東或師傅進入方式<select v-model="form.accessPermission">
                  <option value="present">僅限我在場時進入</option>
                  <option value="absent">同意無人在場時進入</option>
                  <option value="contact-first">進入前請先聯絡我</option></select
                ><small>提出報修不代表房東可自由進入房屋。</small></label
              ><label class="full"
                >聯絡電話（可修改）<input v-model="form.phone" required type="tel"
              /></label>
            </div>
            <p v-if="formError" class="form-error"><AlertTriangle />{{ formError }}</p>
          </div>
          <footer>
            <button type="button" class="btn secondary" @click="createOpen = false">取消</button
            ><button class="btn primary">檢查報修摘要<ChevronRight /></button>
          </footer>
        </form>
      </div>

      <div v-if="summaryOpen" class="backdrop summary-layer">
        <section class="summary-dialog">
          <header>
            <button class="back" @click="summaryOpen = false"><ArrowLeft />返回修改</button>
            <h2>送出前確認</h2>
            <button class="close" @click="closeRepairDialogs">
              <X />
            </button>
          </header>
          <div class="space-y-3 p-5">
            <p class="text-sm text-[#5f6e85]">
              請確認租約、房間與設備；送出後會保留原始內容，補充資料將另存紀錄。
            </p>
            <dl>
              <div>
                <dt>租屋處</dt>
                <dd>{{ selectedLease?.address }}／{{ selectedLease?.room }}</dd>
              </div>
              <div>
                <dt>報修項目</dt>
                <dd>{{ form.location }}／{{ form.equipment }}</dd>
              </div>
              <div>
                <dt>緊急程度</dt>
                <dd>{{ urgencyMeta[form.urgency].label }}</dd>
              </div>
              <div>
                <dt>問題描述</dt>
                <dd>{{ form.description }}</dd>
              </div>
              <div>
                <dt>方便時段</dt>
                <dd>{{ form.availableTime }}</dd>
              </div>
              <div>
                <dt>照片</dt>
                <dd>{{ form.photos.length ? `${form.photos.length} 張` : '未上傳' }}</dd>
              </div>
            </dl>
            <button class="btn primary w-full" @click="submitRepair"><Check />確認送出報修</button>
          </div>
        </section>
      </div>

      <div v-if="supplementOpen" class="backdrop">
        <form class="mini-dialog" @submit.prevent="submitSupplement">
          <header>
            <h2>{{ selected?.supplementRequested ? '回覆補件要求' : '補充報修資料' }}</h2>
            <button type="button" class="close" @click="supplementOpen = false"><X /></button>
          </header>
          <div>
            <p v-if="selected?.supplementRequested" class="request-note">
              {{ selected.supplementRequestNote }}
            </p>
            <label
              >補充說明<textarea
                v-model="supplementNote"
                placeholder="補充問題狀況或回覆房東要求"
              /></label
            ><label class="upload"
              ><Camera />補充照片<input
                class="hidden"
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                multiple
                @change="handlePhotos($event, 'supplement')"
            /></label>
            <p v-if="supplementPhotos.length" class="file-count">
              已選擇 {{ supplementPhotos.length }} 張：{{
                supplementPhotos.map((item) => item.name).join('、')
              }}
            </p>
          </div>
          <footer>
            <button type="button" class="btn secondary" @click="supplementOpen = false">取消</button
            ><button
              class="btn primary"
              :disabled="!supplementNote.trim() && !supplementPhotos.length"
            >
              送出補充資料
            </button>
          </footer>
        </form>
      </div>

      <div v-if="rescheduleOpen" class="backdrop">
        <form class="mini-dialog" @submit.prevent="submitReschedule">
          <header>
            <h2>申請改期</h2>
            <button type="button" class="close" @click="rescheduleOpen = false"><X /></button>
          </header>
          <div class="dialog-fields">
            <p>原安排：{{ formatDateTime(selected?.scheduledAt || '') }}</p>
            <span class="field-title">可配合時段</span>
            <div class="time-grid">
              <label
                >日期<input
                  v-model="reschedule.date"
                  :min="minimumRepairDate"
                  type="date"
                  required /></label
              ><label
                >開始<select v-model="reschedule.startTime">
                  <option v-for="time in startTimeOptions" :key="time">{{ time }}</option>
                </select></label
              ><label
                >結束<select v-model="reschedule.endTime">
                  <option v-for="time in endOptions(reschedule.startTime)" :key="time">
                    {{ time }}
                  </option>
                </select></label
              >
            </div>
            <label class="check-row"
              ><input
                v-model="reschedule.alternativeEnabled"
                type="checkbox"
              />再提供一個備選時段</label
            >
            <div v-if="reschedule.alternativeEnabled" class="time-grid">
              <label
                >日期<input
                  v-model="reschedule.alternativeDate"
                  :min="minimumRepairDate"
                  type="date"
                  required /></label
              ><label
                >開始<select v-model="reschedule.alternativeStartTime">
                  <option v-for="time in startTimeOptions" :key="time">{{ time }}</option>
                </select></label
              ><label
                >結束<select v-model="reschedule.alternativeEndTime">
                  <option v-for="time in endOptions(reschedule.alternativeStartTime)" :key="time">
                    {{ time }}
                  </option>
                </select></label
              >
            </div>
            <label
              >備註<textarea
                v-model="reschedule.note"
                placeholder="改期原因或其他可配合方式（選填）"
              />
            </label>
          </div>
          <footer>
            <button type="button" class="btn secondary" @click="rescheduleOpen = false">取消</button
            ><button class="btn primary">送出改期需求</button>
          </footer>
        </form>
      </div>

      <div v-if="questionOpen" class="backdrop">
        <form class="mini-dialog" @submit.prevent="submitQuestion">
          <header>
            <h2>對責任或金額有疑問</h2>
            <button type="button" class="close" @click="questionOpen = false"><X /></button>
          </header>
          <div>
            <label
              >請說明你的疑問<textarea
                v-model="questionNote"
                required
                placeholder="例如：希望確認點交照片、報價項目或付款方式"
              />
            </label>
          </div>
          <footer>
            <button type="button" class="btn secondary" @click="questionOpen = false">取消</button
            ><button class="btn primary" :disabled="!questionNote.trim()">送出給房東</button>
          </footer>
        </form>
      </div>

      <div v-if="unresolvedOpen" class="backdrop">
        <form class="mini-dialog" @submit.prevent="submitUnresolved">
          <header>
            <h2>回報問題仍未解決</h2>
            <button type="button" class="close" @click="unresolvedOpen = false"><X /></button>
          </header>
          <div class="dialog-fields">
            <label
              >仍存在的問題<textarea
                v-model="unresolved.note"
                required
                placeholder="請說明維修後仍發生的狀況"
              /></label
            ><label class="upload"
              ><Camera />上傳完修後照片<input
                class="hidden"
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                multiple
                @change="handlePhotos($event, 'unresolved')" /></label
            ><label class="check-row safety"
              ><input
                v-model="unresolved.safetyConcern"
                type="checkbox"
              />現場仍有漏電、瓦斯、嚴重漏水等安全疑慮</label
            ><span class="field-title">可再次維修時段</span>
            <div class="time-grid">
              <label
                >日期<input
                  v-model="unresolved.date"
                  :min="minimumRepairDate"
                  type="date"
                  required /></label
              ><label
                >開始<select v-model="unresolved.startTime">
                  <option v-for="time in startTimeOptions" :key="time">{{ time }}</option>
                </select></label
              ><label
                >結束<select v-model="unresolved.endTime">
                  <option v-for="time in endOptions(unresolved.startTime)" :key="time">
                    {{ time }}
                  </option>
                </select></label
              >
            </div>
          </div>
          <footer>
            <button type="button" class="btn secondary" @click="unresolvedOpen = false">取消</button
            ><button class="btn primary" :disabled="!unresolved.note.trim()">
              通知房東再次處理
            </button>
          </footer>
        </form>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
@reference "../index.css";
.eyebrow {
  @apply mb-1 text-xs font-bold uppercase tracking-[.2em] text-[#315fc4];
}
.panel {
  @apply rounded-[1.5rem] border border-[#d9e1f0] bg-white shadow-[0_10px_28px_rgba(37,70,135,.06)];
}
.panel-head {
  @apply flex items-center justify-between border-b border-[#e1e7f1] p-4;
}
.panel-head h2 {
  @apply text-lg font-bold;
}
.panel-head p {
  @apply mt-1 text-[13px] text-[#5f6e85];
}
.panel-head > span:not(.badge) {
  @apply rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-bold text-[#315fc4];
}
.btn {
  @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-50;
}
.btn :deep(svg) {
  @apply h-4 w-4;
}
.btn.primary {
  @apply bg-[#315fc4] text-white hover:bg-[#244fae];
}
.btn.secondary {
  @apply border border-[#d7deeb] bg-white;
}
.service-note {
  @apply rounded-xl border border-[#c8d8f5] bg-[#edf4ff] px-4 py-2 text-[13px] text-[#244d9b];
}
.metric {
  @apply flex items-center gap-3 rounded-2xl border border-[#d9e1f0] bg-white p-4;
}
.metric > span {
  @apply grid h-10 w-10 place-items-center rounded-full bg-[#edf4ff] text-[#315fc4];
}
.metric > span :deep(svg) {
  @apply h-4 w-4;
}
.metric small {
  @apply block text-[13px] text-[#5f6e85];
}
.metric strong {
  @apply mt-1 block text-xl font-extrabold;
}
.ticket-card {
  @apply block w-full rounded-2xl border border-[#dfe5ef] p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dfe9ff];
}
.ticket-card.active {
  @apply border-[#98b4ec] bg-[#eef5ff] shadow-[inset_3px_0_0_#315fc4];
}
.ticket-card b {
  @apply text-base;
}
.ticket-card p {
  @apply mt-2 line-clamp-2 text-sm leading-5 text-[#56667e];
}
.ticket-card small {
  @apply mt-2 block text-xs text-[#68768b];
}
.new-card {
  @apply flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#9db5e4] py-4 text-sm font-bold text-[#315fc4];
}
.new-card :deep(svg) {
  @apply h-4 w-4;
}
.badge {
  @apply inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold;
}
.badge.green,
.badge.blue {
  @apply border-[#c8d8f5] bg-[#edf4ff] text-[#285f70];
}
.badge.amber {
  @apply border-[#ecd4ae] bg-[#fff1dd] text-[#865717];
}
.badge.purple {
  @apply border-[#ddd0ea] bg-[#f0e9f7] text-[#654487];
}
.badge.red {
  @apply border-[#edc9c3] bg-[#fbe9e6] text-[#8f3f36];
}
.steps {
  @apply grid grid-cols-4;
}
.steps > div {
  @apply relative flex flex-col items-center gap-2 text-center text-xs text-[#66748a];
}
.steps > div:before {
  content: '';
  @apply absolute left-0 right-1/2 top-4 h-px bg-[#d9e1ee];
}
.steps > div:after {
  content: '';
  @apply absolute left-1/2 right-0 top-4 h-px bg-[#d9e1ee];
}
.steps > div:first-child:before,
.steps > div:last-child:after {
  @apply hidden;
}
.steps i {
  @apply relative z-10 grid h-8 w-8 place-items-center rounded-full border border-[#d6deeb] bg-white text-xs font-bold not-italic;
}
.steps i :deep(svg) {
  @apply h-4 w-4;
}
.steps .done {
  @apply font-bold text-[#315fc4];
}
.steps .done i {
  @apply border-[#315fc4] bg-[#315fc4] text-white;
}
.steps .done:before,
.steps .done:after {
  @apply bg-[#7397e0];
}
.action-card {
  @apply flex flex-col justify-between gap-4 rounded-2xl border border-[#9db5e4] bg-[#eef5ff] p-4 sm:flex-row sm:items-center;
}
.action-card p {
  @apply text-xs font-bold text-[#315fc4];
}
.action-card h3 {
  @apply mt-1 text-base font-bold;
}
.action-card span {
  @apply mt-1 block text-[13px] text-[#56667e];
}
.action-buttons {
  @apply flex shrink-0 flex-wrap gap-2;
}
.urgent-action {
  @apply border-[#e9bf88] bg-[#fff5e6];
}
.urgent-action p {
  @apply text-[#865717];
}
.waiting {
  @apply border-[#d6c7e6] bg-[#f7f2fb];
}
.contact-option {
  @apply mt-2 flex items-center gap-2 text-[13px] font-semibold;
}
.danger {
  @apply flex gap-3 rounded-2xl border border-[#edc2ba] bg-[#fff0ed] p-4 text-[#8f3f36];
}
.danger > svg {
  @apply h-5 w-5 shrink-0;
}
.danger p {
  @apply mt-1 text-sm leading-6;
}
.emergency-history {
  @apply flex items-center gap-2 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm font-semibold text-[#8f3f36];
}
.emergency-history :deep(svg) {
  @apply h-4 w-4;
}
.summary-grid {
  @apply grid gap-3 sm:grid-cols-2;
}
.summary-grid > div {
  @apply rounded-2xl border border-[#dfe5ef] bg-[#f8faff] p-4;
}
.summary-grid span {
  @apply flex items-center gap-1 text-[13px] text-[#5f6e85];
}
.summary-grid span :deep(svg) {
  @apply h-4 w-4;
}
.summary-grid b {
  @apply mt-2 block text-sm;
}
.summary-grid small {
  @apply mt-1 block text-[13px] font-normal text-[#5f6e85];
}
.latest {
  @apply flex gap-3 rounded-2xl bg-[#edf4ff] p-4 text-[#244d9b];
}
.latest > svg {
  @apply h-5 w-5 shrink-0;
}
.latest > div > span {
  @apply text-xs font-bold;
}
.latest article {
  @apply relative mt-2 border-t border-[#d7e4fa] pt-2;
}
.latest article b {
  @apply block pr-28 text-sm;
}
.latest time {
  @apply absolute right-0 top-2 text-xs text-[#5f6e85];
}
.latest article p {
  @apply mt-1 text-[13px] leading-5 text-[#4f6180];
}
.soft {
  @apply rounded-2xl border border-[#dfe5ef] bg-[#f8faff] p-4;
}
.soft h3 {
  @apply text-base font-bold;
}
.soft dl,
.summary-dialog dl {
  @apply mt-3 space-y-2;
}
.soft dl div,
.summary-dialog dl div {
  @apply grid grid-cols-[110px_1fr] gap-3 text-sm;
}
.soft dt,
.summary-dialog dt {
  @apply text-[#5f6e85];
}
.soft dd,
.summary-dialog dd {
  @apply font-semibold;
}
.section-title {
  @apply flex items-start justify-between gap-3;
}
.section-title p {
  @apply mt-1 text-[13px] text-[#5f6e85];
}
.file {
  @apply inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-bold;
}
.file :deep(svg) {
  @apply h-3.5 w-3.5;
}
.sub-actions {
  @apply mt-4 flex flex-wrap gap-2 border-t border-[#dfe5ef] pt-3;
}
.sub-actions button {
  @apply rounded-full border border-[#cbd7ed] bg-white px-3 py-2 text-[13px] font-bold text-[#315fc4];
}
.sub-actions .danger-link {
  @apply border-[#edc9c3] text-[#8f3f36];
}
.confirmed {
  @apply mt-4 flex items-center gap-2 rounded-xl bg-[#eaf2ff] px-3 py-2 text-[13px] font-semibold text-[#244d9b];
}
.confirmed :deep(svg) {
  @apply h-4 w-4;
}
.photo-grid {
  @apply mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4;
}
.photo-grid a {
  @apply overflow-hidden rounded-xl border border-[#dce4f0] bg-white;
}
.photo-grid img {
  @apply h-24 w-full object-cover;
}
.photo-grid span {
  @apply block truncate p-2 text-xs font-semibold;
}
.timeline-toggle {
  @apply flex w-full items-center justify-between text-left text-base font-bold;
}
.timeline-toggle :deep(svg) {
  @apply h-5 w-5 transition;
}
.timeline-toggle .rotate {
  @apply rotate-180;
}
.timeline {
  @apply mt-4;
}
.timeline > div {
  @apply relative ml-1 border-l border-[#cbd9f3] pb-4 pl-4;
}
.timeline i {
  @apply absolute -left-1 top-1 h-2 w-2 rounded-full bg-[#315fc4];
}
.timeline p {
  @apply flex justify-between gap-2 text-sm;
}
.timeline p span {
  @apply shrink-0 text-xs text-[#68768b];
}
.timeline small {
  @apply mt-1 block text-[13px] leading-5 text-[#56667e];
}
.empty {
  @apply grid min-h-80 place-content-center justify-items-center gap-3 p-8 text-center;
}
.empty > svg {
  @apply h-8 w-8 text-[#315fc4];
}
.empty p {
  @apply text-sm text-[#5f6e85];
}
.backdrop {
  @apply fixed inset-0 z-50 grid place-items-center bg-[#17213a]/45 p-3 backdrop-blur-sm;
}
.summary-layer {
  @apply z-[60];
}
.repair-form,
.summary-dialog,
.mini-dialog {
  @apply flex w-full flex-col overflow-hidden rounded-[1.25rem] border border-[#d9e1ef] bg-white shadow-2xl;
}
.repair-form {
  @apply max-h-[calc(100dvh-48px)] max-w-xl;
}
.summary-dialog,
.mini-dialog {
  @apply max-h-[calc(100dvh-48px)] max-w-lg;
}
.repair-form > header,
.summary-dialog > header,
.mini-dialog > header {
  @apply flex items-center justify-between border-b border-[#e1e7f1] px-4 py-3;
}
.repair-form header p {
  @apply text-xs text-[#68768b];
}
.repair-form header h2,
.summary-dialog header h2,
.mini-dialog header h2 {
  @apply text-xl font-bold;
}
.close {
  @apply grid h-9 w-9 place-items-center rounded-full border border-[#d7deeb] bg-white;
}
.close :deep(svg) {
  @apply h-4 w-4;
}
.form-scroll {
  @apply space-y-3 overflow-y-auto p-4;
}
.repair-form > footer,
.mini-dialog > footer {
  @apply flex justify-end gap-2 border-t border-[#e1e7f1] px-4 py-3;
}
.mini-dialog > div {
  @apply space-y-3 overflow-y-auto p-4;
}
.mini-dialog label:not(.upload):not(.check-row) {
  @apply block text-sm font-bold;
}
.mini-dialog textarea {
  @apply mt-1.5 min-h-24 w-full rounded-xl border border-[#d7deeb] p-3;
}
.request-note {
  @apply rounded-xl bg-[#fff5e6] p-3 text-sm text-[#865717];
}
.file-count {
  @apply text-xs text-[#5f6e85];
}
.address {
  @apply flex gap-3 rounded-2xl bg-[#edf4ff] p-3;
}
.address > svg {
  @apply h-5 w-5 shrink-0 text-[#315fc4];
}
.address span {
  @apply block text-xs text-[#5f6e85];
}
.address b {
  @apply mt-1 block text-sm;
}
.form-grid {
  @apply grid gap-3 sm:grid-cols-2;
}
.form-grid .full {
  @apply sm:col-span-2;
}
.form-grid label,
fieldset legend,
.field-title {
  @apply text-sm font-bold;
}
.form-grid input,
.form-grid select,
.form-grid textarea,
.field-title select,
.dialog-fields input,
.dialog-fields select {
  @apply mt-1.5 w-full rounded-xl border border-[#d7deeb] bg-white px-3 py-2.5 font-normal outline-none focus:border-[#7294dc] focus:ring-4 focus:ring-[#dfe9ff];
}
.form-grid textarea {
  @apply min-h-20;
}
.form-grid small {
  @apply mt-1 block text-xs font-normal leading-5 text-[#5f6e85];
}
.time-grid {
  @apply mt-1.5 grid grid-cols-[1.3fr_1fr_1fr] gap-2;
}
.time-grid label {
  @apply text-xs text-[#56667e];
}
.form-error {
  @apply mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#9a4138];
}
.form-error :deep(svg) {
  @apply h-4 w-4;
}
.upload {
  @apply mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#9db5e4] bg-[#f6f9ff] py-3 text-[#315fc4];
}
.upload :deep(svg) {
  @apply h-4 w-4;
}
.upload-list {
  @apply grid gap-2 sm:grid-cols-2;
}
.upload-list > div {
  @apply flex items-center gap-2 rounded-xl border border-[#dfe5ef] bg-white p-2;
}
.upload-list img {
  @apply h-12 w-12 rounded-lg object-cover;
}
.upload-list span {
  @apply min-w-0 flex-1 truncate text-xs font-bold;
}
.upload-list small {
  @apply block font-normal text-[#68768b];
}
.upload-list button {
  @apply grid h-8 w-8 place-items-center rounded-full text-[#8f3f36];
}
.upload-list button :deep(svg) {
  @apply h-4 w-4;
}
fieldset {
  @apply rounded-2xl border border-[#dfe5ef] p-3;
}
fieldset legend {
  @apply px-1;
}
.urgency-grid {
  @apply grid gap-2 sm:grid-cols-3;
}
.urgency-grid button {
  @apply rounded-xl border border-[#dfe5ef] p-3 text-left opacity-70;
}
.urgency-grid button.selected {
  @apply opacity-100 ring-2 ring-[#315fc4];
}
.urgency-grid button.red.selected {
  @apply ring-[#b9564a];
}
.urgency-grid button.amber.selected {
  @apply ring-[#bc7d23];
}
.urgency-grid b,
.urgency-grid span,
.urgency-grid small {
  @apply block;
}
.urgency-grid span {
  @apply mt-1 text-xs;
}
.urgency-grid small {
  @apply mt-2 text-[11px] leading-4 text-[#5f6e85];
}
.summary-dialog .back {
  @apply inline-flex items-center gap-1 text-xs font-bold text-[#315fc4];
}
.summary-dialog .back :deep(svg) {
  @apply h-4 w-4;
}
.dialog-fields {
  @apply space-y-3;
}
.dialog-fields > p {
  @apply rounded-xl bg-[#f4f7fb] p-3 text-sm;
}
.check-row {
  @apply flex items-center gap-2 text-sm font-semibold;
}
.safety {
  @apply rounded-xl border border-[#edc9c3] bg-[#fff0ed] p-3 text-[#8f3f36];
}
.toast {
  @apply fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1f469d] px-5 py-3 text-sm font-bold text-white shadow-xl;
}
.toast :deep(svg) {
  @apply h-4 w-4;
}
.toast-enter-active,
.toast-leave-active {
  transition: 0.2s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
@media (max-width: 639px) {
  .repair-form,
  .summary-dialog,
  .mini-dialog {
    @apply max-h-[calc(100dvh-8px)] rounded-[1.25rem];
  }
  .repair-form > footer,
  .mini-dialog > footer {
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
  }
  .steps b {
    @apply max-w-16;
  }
  .soft dl div,
  .summary-dialog dl div {
    @apply grid-cols-1 gap-0;
  }
  .time-grid {
    @apply grid-cols-1;
  }
  .latest article b {
    @apply pr-0;
  }
  .latest time {
    @apply static mt-1 block;
  }
}
</style>

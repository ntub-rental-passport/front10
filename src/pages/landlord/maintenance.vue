<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileImage,
  FileUp,
  History,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
  Wrench,
  X,
} from 'lucide-vue-next'
import {
  useRepairTickets,
  type RepairResponsibility,
  type RepairStatus,
  type RepairTicket,
  type RepairUrgency,
} from '@/src/composables/useRepairTickets'

type ActionStep = 'decision' | 'responsibility' | 'schedule' | 'completion' | 'inspection' | 'done'

const { tickets, updateTicket, markRead, resetDemo } = useRepairTickets()
const statusFilter = ref<'all' | RepairStatus>('all')
const emergencyOnly = ref(false)
const keyword = ref('')
const selectedId = ref(tickets.value[0]?.id ?? '')
const toast = ref('')
const actionOpen = ref<'request' | 'reject' | null>(null)
const actionReason = ref('')
const vendorPickerOpen = ref(false)
const completeConfirmOpen = ref(false)
const receiptFile = ref<File | null>(null)

const selected = computed(() =>
  tickets.value.find((item) => item.id === selectedId.value) ?? tickets.value[0],
)
const responsibilityDraft = ref<{ responsibility: RepairResponsibility; note: string }>({
  responsibility: selected.value?.responsibility ?? 'pending',
  note: selected.value?.responsibilityNote ?? '',
})
const scheduleDraft = ref<{
  vendorName: string
  vendorPhone: string
  scheduledAt: string
  estimatedCost: number | null
  note: string
  needsTenant: boolean
}>({
  vendorName: selected.value?.vendorName ?? '',
  vendorPhone: selected.value?.vendorPhone ?? '',
  scheduledAt: selected.value?.scheduledAt ?? '',
  estimatedCost: selected.value?.estimatedCost ?? null,
  note: '',
  needsTenant: selected.value?.accessPermission === 'present',
})
const costDraft = ref<{ actualCost: number | null; payer: string; receiptName: string }>({
  actualCost: selected.value?.actualCost ?? null,
  payer: selected.value?.payer ?? '待確認',
  receiptName: selected.value?.receiptName ?? '',
})

const count = (status: RepairStatus) =>
  tickets.value.filter((item) => item.status === status).length

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return tickets.value.filter((item) => {
    const matchesStatus = statusFilter.value === 'all' || item.status === statusFilter.value
    const matchesUrgency = !emergencyOnly.value || item.urgency === 'emergency'
    const haystack = `${item.property} ${item.room} ${item.tenant} ${item.location} ${item.equipment} ${item.description} ${item.id}`.toLowerCase()
    return matchesStatus && matchesUrgency && (!query || haystack.includes(query))
  })
})

const tabs = computed(() => [
  { value: 'all' as const, label: '全部', count: tickets.value.length },
  { value: 'pending' as const, label: '待處理', count: count('pending') },
  { value: 'processing' as const, label: '處理中', count: count('processing') },
  { value: 'inspection' as const, label: '待驗收', count: count('inspection') },
  { value: 'completed' as const, label: '已完成', count: count('completed') },
])
const unreadCount = computed(() => tickets.value.filter((item) => !item.landlordRead).length)
const emergencyCount = computed(
  () =>
    tickets.value.filter(
      (item) => item.urgency === 'emergency' && item.status !== 'completed',
    ).length,
)

const statusMeta: Record<RepairStatus, { label: string; cls: string }> = {
  pending: { label: '待處理', cls: 'amber' },
  processing: { label: '處理中', cls: 'blue' },
  inspection: { label: '待驗收', cls: 'purple' },
  completed: { label: '已完成', cls: 'green' },
}
const urgencyMeta: Record<RepairUrgency, { label: string; cls: string }> = {
  emergency: { label: '緊急', cls: 'red' },
  soon: { label: '儘快處理', cls: 'amber' },
  normal: { label: '一般', cls: 'neutral' },
}
const responsibilityOptions: { value: RepairResponsibility; label: string }[] = [
  { value: 'pending', label: '暫待確認' },
  { value: 'landlord', label: '房東負擔' },
  { value: 'tenant', label: '租客負擔' },
  { value: 'shared', label: '雙方協議分攤' },
]
const vendors = [
  { name: '安心水電工程行', type: '水電／漏水', distance: '距離 0.8 公里', phone: '02-2501-8899', rating: '4.8' },
  { name: '好鄰居居家修繕', type: '家具／門窗', distance: '距離 1.3 公里', phone: '02-2700-5218', rating: '4.7' },
  { name: '大台北冷氣服務', type: '空調／家電', distance: '距離 1.7 公里', phone: '02-2711-0288', rating: '4.6' },
]

const actionStep = computed<ActionStep>(() => {
  const ticket = selected.value
  if (!ticket) return 'done'
  if (ticket.status === 'pending') return 'decision'
  if (ticket.status === 'inspection') return 'inspection'
  if (ticket.status === 'completed') return 'done'
  if (ticket.responsibility === 'pending') return 'responsibility'
  if (!ticket.scheduledAt) return 'schedule'
  return 'completion'
})
const phaseIndex = computed(() => ({
  decision: 0,
  responsibility: 1,
  schedule: 2,
  completion: 3,
  inspection: 4,
  done: 5,
})[actionStep.value])
const workflowSteps = ['確認處理', '責任說明', '安排維修', '完修送驗收', '租客驗收']
const currentTaskLabel = computed(() => workflowSteps[phaseIndex.value] ?? '案件已完成')

const pad = (value: number) => String(value).padStart(2, '0')
function parseDate(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
function formatDateTime(value: string, compact = false): string {
  const date = parseDate(value)
  if (!date) return value || '尚未安排'
  const datePart = compact
    ? `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    : `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const formatAvailableTime = (value: string) =>
  value.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1/$2/$3')
const money = (value: number | null) =>
  value === null ? '尚未填寫' : `NT$ ${value.toLocaleString('zh-TW')}`
const accessLabel = (value: RepairTicket['accessPermission']) =>
  ({ present: '租客在場時進入', absent: '同意無人在場時進入', 'contact-first': '進入前先聯絡租客' })[value]

function notify(message: string): void {
  toast.value = message
  window.setTimeout(() => (toast.value = ''), 2800)
}
function hydrateDrafts(item: RepairTicket): void {
  responsibilityDraft.value = { responsibility: item.responsibility, note: item.responsibilityNote }
  scheduleDraft.value = {
    vendorName: item.vendorName,
    vendorPhone: item.vendorPhone,
    scheduledAt: item.scheduledAt,
    estimatedCost: item.estimatedCost,
    note: '',
    needsTenant: item.accessPermission === 'present',
  }
  costDraft.value = { actualCost: item.actualCost, payer: item.payer, receiptName: item.receiptName }
  receiptFile.value = null
}
function selectTicket(item: RepairTicket): void {
  selectedId.value = item.id
  markRead(item.id)
  hydrateDrafts(item)
}
function setStatusFilter(status: RepairStatus): void {
  statusFilter.value = status
  emergencyOnly.value = false
}
function toggleEmergencyFilter(): void {
  emergencyOnly.value = !emergencyOnly.value
  if (emergencyOnly.value) statusFilter.value = 'all'
}
function acceptTicket(): void {
  if (!selected.value) return
  updateTicket(selected.value.id, { status: 'processing', landlordRead: true }, { title: '房東接受處理', detail: '案件已進入責任確認與安排維修階段。' })
  notify('已接受處理，租客將收到通知')
}
function submitAction(): void {
  if (!selected.value || !actionReason.value.trim()) return
  if (actionOpen.value === 'request') {
    updateTicket(selected.value.id, { status: 'pending', landlordRead: true }, { title: '房東要求補充資料', detail: actionReason.value.trim() })
    notify('已通知租客補充資料')
  } else {
    updateTicket(selected.value.id, { status: 'completed', landlordRead: true, responsibilityNote: actionReason.value.trim() }, { title: '房東判定不屬於報修範圍', detail: actionReason.value.trim() })
    notify('已保存原因並通知租客')
  }
  actionOpen.value = null
  actionReason.value = ''
}
function saveResponsibility(): void {
  if (!selected.value || responsibilityDraft.value.responsibility === 'pending') {
    notify('請先選擇責任歸屬')
    return
  }
  const label = responsibilityOptions.find((item) => item.value === responsibilityDraft.value.responsibility)?.label ?? '暫待確認'
  updateTicket(selected.value.id, {
    responsibility: responsibilityDraft.value.responsibility,
    responsibilityNote: responsibilityDraft.value.note.trim(),
    payer: label,
  }, { title: '更新責任與費用說明', detail: `${label}：${responsibilityDraft.value.note.trim() || '尚未補充說明'}` })
  costDraft.value.payer = label
  notify('已保存責任歸屬與說明')
}
function useVendor(vendor: (typeof vendors)[number]): void {
  scheduleDraft.value.vendorName = vendor.name
  scheduleDraft.value.vendorPhone = vendor.phone
  vendorPickerOpen.value = false
  notify(`已帶入 ${vendor.name}`)
}
function numericOrNull(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function saveSchedule(): void {
  if (!selected.value) return
  if (!scheduleDraft.value.vendorName.trim() || !scheduleDraft.value.scheduledAt) {
    notify('請填寫維修人員與預計到場時間')
    return
  }
  updateTicket(selected.value.id, {
    status: 'processing',
    vendorName: scheduleDraft.value.vendorName.trim(),
    vendorPhone: scheduleDraft.value.vendorPhone.trim(),
    scheduledAt: scheduleDraft.value.scheduledAt,
    estimatedCost: numericOrNull(scheduleDraft.value.estimatedCost),
  }, { title: '已安排維修人員', detail: `${scheduleDraft.value.vendorName}，預計 ${formatDateTime(scheduleDraft.value.scheduledAt)} 到場。${scheduleDraft.value.note.trim()}` })
  notify('已安排維修，租客可確認或申請改期')
}
function applyReceipt(file?: File): void {
  if (!file) return
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    notify('僅支援 JPG、PNG 或 PDF 檔案')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    notify('檔案不可超過 10MB')
    return
  }
  receiptFile.value = file
  costDraft.value.receiptName = file.name
}
function handleReceipt(event: Event): void {
  const input = event.target as HTMLInputElement
  applyReceipt(input.files?.[0])
  input.value = ''
}
function handleReceiptDrop(event: DragEvent): void {
  applyReceipt(event.dataTransfer?.files[0])
}
function removeReceipt(): void {
  receiptFile.value = null
  costDraft.value.receiptName = ''
}
function completeRepair(): void {
  if (!selected.value) return
  const actualCost = numericOrNull(costDraft.value.actualCost)
  updateTicket(selected.value.id, {
    status: 'inspection',
    actualCost,
    payer: costDraft.value.payer,
    receiptName: costDraft.value.receiptName,
  }, { title: '維修完成，等待租客驗收', detail: `實際費用 ${money(actualCost)}，${costDraft.value.payer}。` })
  completeConfirmOpen.value = false
  notify('已送出租客驗收，原始紀錄會完整保留')
}
function reset(): void {
  resetDemo()
  selectedId.value = tickets.value[0]?.id ?? ''
  if (tickets.value[0]) hydrateDrafts(tickets.value[0])
  statusFilter.value = 'all'
  emergencyOnly.value = false
  keyword.value = ''
  notify('已還原展示資料')
}
</script>

<template>
  <div class="maintenance-page mx-auto max-w-[1640px] space-y-5">
    <header class="page-header">
      <div><h1>修繕管理</h1><p>掌握報修、責任、安排、費用與驗收，保留完整處理證明。</p></div>
      <button class="btn secondary" @click="reset"><RefreshCw />還原展示資料</button>
    </header>

    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="案件狀態統計">
      <button
        v-for="metric in [
          { status: 'pending' as RepairStatus, label: '待處理', note: `其中 ${unreadCount} 件尚未讀取`, icon: Clock3, cls: 'amber' },
          { status: 'processing' as RepairStatus, label: '處理中', note: '責任確認或安排維修', icon: Wrench, cls: 'blue' },
          { status: 'inspection' as RepairStatus, label: '待驗收', note: '等待確認完修結果', icon: ShieldCheck, cls: 'purple' },
          { status: 'completed' as RepairStatus, label: '已完成', note: '完整歷程已封存', icon: CheckCircle2, cls: 'green' },
        ]"
        :key="metric.status"
        class="metric"
        :class="[metric.cls, { active: statusFilter === metric.status && !emergencyOnly }]"
        :aria-pressed="statusFilter === metric.status && !emergencyOnly"
        @click="setStatusFilter(metric.status)"
      >
        <span>{{ metric.label }}</span><strong>{{ count(metric.status) }}</strong><small>{{ metric.note }}</small><i><component :is="metric.icon" /></i>
      </button>
    </section>

    <button class="emergency-alert" :class="{ active: emergencyOnly }" :aria-pressed="emergencyOnly" @click="toggleEmergencyFilter">
      <span><AlertTriangle /><b>目前有 {{ emergencyCount }} 件緊急案件需要優先確認</b></span>
      <span>{{ emergencyOnly ? '顯示全部案件' : '查看緊急案件' }}<ChevronRight /></span>
    </button>

    <section class="panel filter-panel">
      <div class="flex flex-wrap gap-2">
        <button v-for="item in tabs" :key="item.value" class="tab" :class="{ active: statusFilter === item.value && !emergencyOnly }" @click="statusFilter = item.value; emergencyOnly = false">{{ item.label }} <b>{{ item.count }}</b></button>
      </div>
      <label class="search"><Search /><span class="sr-only">搜尋報修案件</span><input v-model="keyword" placeholder="搜尋房屋、租客、設備或案件編號" /></label>
    </section>

    <section class="grid items-start gap-5 xl:grid-cols-[minmax(620px,1.15fr)_minmax(430px,.85fr)]">
      <article class="panel self-start overflow-hidden">
        <header class="panel-head"><div><h2>報修案件列表</h2><p>點選案件查看內容並留下處理紀錄。</p></div><span>{{ filtered.length }} 筆</span></header>
        <div class="overflow-x-auto">
          <table class="ticket-table w-full min-w-[760px] text-left">
            <thead><tr><th>優先度</th><th>案件</th><th>租屋處</th><th>租客</th><th>狀態</th><th>時間</th></tr></thead>
            <tbody>
              <tr
                v-for="item in filtered"
                :key="item.id"
                tabindex="0"
                role="button"
                :aria-selected="selected?.id === item.id"
                :class="{ selected: selected?.id === item.id }"
                @click="selectTicket(item)"
                @keydown.enter.prevent="selectTicket(item)"
                @keydown.space.prevent="selectTicket(item)"
              >
                <td><span class="badge" :class="urgencyMeta[item.urgency].cls">{{ urgencyMeta[item.urgency].label }}</span></td>
                <td><div class="case-cell"><span><b>{{ item.location }}／{{ item.equipment }}</b><small>{{ item.description }}</small></span><ChevronRight /></div></td>
                <td><b>{{ item.property }}</b><small>{{ item.room }} 房</small></td>
                <td><b>{{ item.tenant }}</b></td>
                <td><span class="status-cell"><span class="badge" :class="statusMeta[item.status].cls">{{ statusMeta[item.status].label }}</span><i v-if="!item.landlordRead" class="unread">未讀</i></span></td>
                <td class="numeric"><b>{{ item.scheduledAt ? `預計 ${formatDateTime(item.scheduledAt, true)}` : `建立 ${formatDateTime(item.createdAt, true)}` }}</b></td>
              </tr>
              <tr v-if="!filtered.length" class="empty-row"><td colspan="6">沒有符合條件的報修案件。</td></tr>
            </tbody>
          </table>
        </div>
      </article>

      <aside v-if="selected" class="panel self-start overflow-hidden">
        <header class="detail-head">
          <div><p class="numeric">{{ selected.id }}</p><h2>{{ selected.location }}／{{ selected.equipment }}</h2></div>
          <div class="flex flex-wrap justify-end gap-2"><span class="badge" :class="urgencyMeta[selected.urgency].cls">{{ urgencyMeta[selected.urgency].label }}</span><span class="badge" :class="statusMeta[selected.status].cls">{{ statusMeta[selected.status].label }}</span></div>
        </header>
        <div class="detail-body">
          <section v-if="selected.urgency === 'emergency' && selected.status !== 'completed'" class="danger"><AlertTriangle /><div><b>先確認現場安全</b><p>若有火災、瓦斯外洩、嚴重漏電或人身危險，應請租客先離開現場並聯絡 119、相關公用事業或管理單位。報修送出不代表緊急服務已受理。</p></div></section>

          <dl class="info-list">
            <div><dt><Building2 />租屋處</dt><dd>{{ selected.address }}／{{ selected.room }}</dd></div>
            <div><dt><UserRound />租客</dt><dd>{{ selected.tenant }}・<a :href="`tel:${selected.phone}`">{{ selected.phone }}</a></dd></div>
            <div><dt><CalendarClock />方便時段</dt><dd>{{ formatAvailableTime(selected.availableTime) }}</dd></div>
            <div><dt><ShieldCheck />進場方式</dt><dd>{{ accessLabel(selected.accessPermission) }}</dd></div>
          </dl>

          <section class="content-section"><h3>問題與照片</h3><p>{{ selected.description }}</p><div class="mt-3 flex flex-wrap gap-2"><span v-for="name in selected.photoNames" :key="name" class="file"><FileImage />{{ name }}</span></div></section>
          <section class="content-section inventory">
            <div class="flex items-center justify-between gap-3"><h3>家具點交存證</h3><span>自動串接</span></div>
            <dl><div><dt>品牌／型號</dt><dd>{{ selected.inventory.brand }}／{{ selected.inventory.model }}</dd></div><div><dt>入住狀況</dt><dd>{{ selected.inventory.moveInStatus }}</dd></div><div><dt>入住照片</dt><dd>{{ selected.inventory.moveInPhoto }}</dd></div><div><dt>過去報修</dt><dd>{{ selected.inventory.repairCount }} 次</dd></div></dl>
          </section>

          <section class="workflow-summary" aria-label="案件處理進度">
            <header><div><span>目前待辦</span><h3>{{ currentTaskLabel }}</h3></div><strong>{{ Math.min(phaseIndex + 1, workflowSteps.length) }}/{{ workflowSteps.length }}</strong></header>
            <ol><li v-for="(step, index) in workflowSteps" :key="step" :class="{ done: index < phaseIndex, current: index === phaseIndex, future: index > phaseIndex }"><i><Check v-if="index < phaseIndex" /><span v-else>{{ index + 1 }}</span></i><span>{{ step }}</span></li></ol>
          </section>

          <section v-if="actionStep === 'decision'" class="action-block current-action">
            <span class="eyebrow">目前待辦</span><h3>確認責任處理方式</h3><p>接受後再確認責任與維修安排；如不屬於報修範圍，必須保留具體原因。</p>
            <div class="mt-4 grid gap-2 sm:grid-cols-3"><button class="btn primary" @click="acceptTicket"><Check />接受處理</button><button class="btn secondary" @click="actionOpen = 'request'">請租客補充</button><button class="btn danger-btn" @click="actionOpen = 'reject'">不屬報修範圍</button></div>
          </section>

          <section v-else-if="actionStep === 'responsibility'" class="action-block current-action">
            <span class="eyebrow">目前待辦</span><h3>確認責任與費用說明</h3><p>系統提供資料對照，不直接作法律判定；請由雙方確認最後結果。</p>
            <div class="mt-4 grid gap-4 sm:grid-cols-2"><label>責任歸屬<select v-model="responsibilityDraft.responsibility"><option v-for="item in responsibilityOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label class="sm:col-span-2">判斷依據與說明<textarea v-model="responsibilityDraft.note" placeholder="說明設備狀況、契約約定與雙方協議" /></label></div>
            <button class="btn primary mt-4" @click="saveResponsibility">儲存責任說明</button>
          </section>

          <section v-else-if="actionStep === 'schedule'" class="action-block current-action">
            <span class="eyebrow">目前待辦</span><div class="action-title"><div><h3>安排維修時間</h3><p>儲存後租客會收到時間通知並可申請改期。</p></div><Store /></div>
            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              <label>廠商／人員名稱<span class="field-with-action"><input v-model="scheduleDraft.vendorName" placeholder="輸入名稱" /><button type="button" @click="vendorPickerOpen = true">選擇附近店家</button></span></label>
              <label>聯絡電話<input v-model="scheduleDraft.vendorPhone" placeholder="02-0000-0000" /></label>
              <label>預計到場時間<input v-model="scheduleDraft.scheduledAt" type="datetime-local" /></label>
              <label>預估費用<span class="money-input"><b>NT$</b><input v-model.number="scheduleDraft.estimatedCost" min="0" type="number" placeholder="尚未取得報價" /></span></label>
              <label class="sm:col-span-2">備註<textarea v-model="scheduleDraft.note" placeholder="例如：到場前 30 分鐘聯絡" /></label>
            </div>
            <button class="btn primary mt-4" @click="saveSchedule"><CalendarClock />儲存維修安排</button>
          </section>

          <section v-else-if="actionStep === 'completion'" class="action-block current-action">
            <span class="eyebrow">目前待辦</span><h3>記錄完修費用並送驗收</h3><p>確認實際費用、付款人與憑證後，再通知租客驗收。</p>
            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              <label>實際費用<span class="money-input"><b>NT$</b><input v-model.number="costDraft.actualCost" min="0" type="number" placeholder="尚未填寫" /></span></label>
              <label>付款人<select v-model="costDraft.payer"><option>房東負擔</option><option>租客負擔</option><option>雙方協議分攤</option><option>待確認</option></select></label>
              <div class="sm:col-span-2"><span class="form-label">收據或發票</span><span class="upload-zone" @dragover.prevent @drop.prevent="handleReceiptDrop"><input id="receipt-upload" class="sr-only" type="file" accept="image/jpeg,image/png,.pdf" @change="handleReceipt" /><label v-if="!costDraft.receiptName" for="receipt-upload"><FileUp /><b>拖曳或點擊上傳收據</b><small>支援 JPG、PNG、PDF，最大 10MB</small></label><span v-else class="upload-file"><FileImage /><span><b>{{ costDraft.receiptName }}</b><small>{{ receiptFile ? `${(receiptFile.size / 1024).toFixed(0)} KB` : '已附加至案件' }}</small></span><button type="button" aria-label="移除憑證" @click="removeReceipt"><Trash2 /></button></span></span></div>
            </div>
            <p class="notice">若從租金或押金扣除，請另外填寫說明並取得租客確認；系統不會自動扣除。</p>
            <button class="btn primary mt-4" @click="completeConfirmOpen = true"><CheckCircle2 />標記完修並送驗收</button>
          </section>

          <section v-else-if="actionStep === 'inspection'" class="inspection-waiting"><Clock3 /><div><span>目前待辦</span><h3>等待租客驗收</h3><p>已通知 {{ selected.tenant }} 確認問題是否解決；若租客要求再次處理，案件會回到處理中。</p></div></section>
          <section v-else class="success"><CheckCircle2 /><div><b>案件已完成並保留原始紀錄</b><p>驗收結果：{{ selected.inspectionResult === 'resolved' ? '問題已解決' : '依處理紀錄結案' }}。後續修改會新增操作紀錄，不覆蓋原內容。</p></div></section>

          <details v-if="selected.status === 'processing' && phaseIndex > 1" class="secondary-details">
            <summary>查看已完成步驟與安排資料<ChevronDown /></summary>
            <dl><div><dt>責任歸屬</dt><dd>{{ responsibilityOptions.find((item) => item.value === selected.responsibility)?.label }}</dd></div><div><dt>責任說明</dt><dd>{{ selected.responsibilityNote || '尚未補充' }}</dd></div><div v-if="selected.vendorName"><dt>維修人員</dt><dd>{{ selected.vendorName }}・{{ selected.vendorPhone }}</dd></div><div v-if="selected.scheduledAt"><dt>預計到場</dt><dd>{{ formatDateTime(selected.scheduledAt) }}</dd></div><div v-if="selected.estimatedCost !== null"><dt>預估費用</dt><dd class="numeric">{{ money(selected.estimatedCost) }}</dd></div></dl>
          </details>

          <details class="timeline-details">
            <summary><span><History />完整時間軸</span><span>{{ selected.timeline.length }} 筆<ChevronDown /></span></summary>
            <div class="timeline"><div v-for="item in [...selected.timeline].reverse()" :key="item.id"><i /><p><b>{{ item.title }}</b><span class="numeric">{{ formatDateTime(item.at) }}</span></p><small v-if="item.detail">{{ item.detail }}</small></div></div>
          </details>
        </div>
      </aside>
    </section>

    <Transition name="toast"><div v-if="toast" class="toast"><Check />{{ toast }}</div></Transition>
    <Teleport to="body">
      <div v-if="actionOpen" class="backdrop" @click.self="actionOpen = null"><form class="dialog" role="dialog" aria-modal="true" @submit.prevent="submitAction"><header><div><p>{{ selected?.id }}</p><h2>{{ actionOpen === 'request' ? '要求租客補充資料' : '不屬於報修範圍' }}</h2></div><button type="button" class="close" aria-label="關閉" @click="actionOpen = null"><X /></button></header><div class="p-5"><p class="dialog-copy">{{ actionOpen === 'request' ? '請清楚說明需要補充的照片或資訊。' : '請選擇或填寫具體原因，內容將同步給租客並永久保留。' }}</p><label class="field">原因<textarea v-model="actionReason" required :placeholder="actionOpen === 'request' ? '例如：請補拍漏水源頭與水表位置' : '例如：契約已約定該耗材由租客負責更換'" /></label><div v-if="actionOpen === 'reject'" class="mt-3 flex flex-wrap gap-2"><button v-for="reason in ['屬於耗材更換','疑似人為損壞','契約約定由租客負責','問題描述不足','重複報修']" :key="reason" type="button" class="reason" @click="actionReason = reason">{{ reason }}</button></div></div><footer><button type="button" class="btn secondary" @click="actionOpen = null">取消</button><button class="btn" :class="actionOpen === 'reject' ? 'danger-btn' : 'primary'">確認並通知</button></footer></form></div>

      <div v-if="vendorPickerOpen" class="backdrop" @click.self="vendorPickerOpen = false"><section class="dialog vendor-dialog" role="dialog" aria-modal="true" aria-labelledby="vendor-title"><header><div><p>{{ selected?.address }}</p><h2 id="vendor-title">選擇附近修繕店家</h2></div><button type="button" class="close" aria-label="關閉" @click="vendorPickerOpen = false"><X /></button></header><div class="space-y-3 p-5"><p class="dialog-copy">依案件地址提供參考，店家由房東自行聯絡與安排，平台不代為派工。</p><button v-for="vendor in vendors" :key="vendor.name" class="vendor-option" @click="useVendor(vendor)"><span><Store /></span><span><b>{{ vendor.name }}</b><small>{{ vendor.type }}・{{ vendor.distance }}・★ {{ vendor.rating }}</small><em><Phone />{{ vendor.phone }}</em></span><ChevronRight /></button></div></section></div>

      <div v-if="completeConfirmOpen && selected" class="backdrop" @click.self="completeConfirmOpen = false"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="complete-title"><header><div><p>{{ selected.id }}</p><h2 id="complete-title">確認送出租客驗收</h2></div><button type="button" class="close" aria-label="關閉" @click="completeConfirmOpen = false"><X /></button></header><div class="p-5"><p class="dialog-copy">送出後案件會進入「待驗收」，請確認以下內容無誤。</p><dl class="confirm-list"><div><dt>實際費用</dt><dd class="numeric">{{ money(numericOrNull(costDraft.actualCost)) }}</dd></div><div><dt>付款人</dt><dd>{{ costDraft.payer }}</dd></div><div><dt>收據或發票</dt><dd>{{ costDraft.receiptName || '尚未附加' }}</dd></div><div><dt>通知租客</dt><dd>{{ selected.tenant }}・{{ selected.phone }}</dd></div></dl></div><footer><button type="button" class="btn secondary" @click="completeConfirmOpen = false">返回修改</button><button class="btn primary" @click="completeRepair"><CheckCircle2 />確認送出</button></footer></section></div>
    </Teleport>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.maintenance-page { --text-primary:#1f2d25; --text-secondary:#56635b; --text-muted:#66726a; color:var(--text-primary); font-family:"Noto Sans TC",system-ui,sans-serif; }
.numeric { font-variant-numeric:tabular-nums; }
.page-header { @apply flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between; }.page-header h1 { @apply text-[30px] font-extrabold leading-tight tracking-tight lg:text-[32px]; }.page-header p { @apply mt-2 text-sm text-[#56635b]; }
.panel { @apply rounded-[1.4rem] border border-[#e2dccf] bg-white/90 shadow-[0_10px_28px_rgba(65,70,61,.05)]; }.panel-head,.detail-head { @apply flex items-center justify-between gap-4 border-b border-[#e7e1d6] p-5; }.panel-head h2,.detail-head h2 { @apply text-xl font-bold; }.panel-head p,.detail-head p { @apply mt-1 text-[13px] text-[#66726a]; }.panel-head > span { @apply rounded-full bg-[#edf5ed] px-3 py-1 text-xs font-bold text-[#3f6747]; }.detail-body { @apply space-y-5 p-5; }
.btn { @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#cfe3d2]; }.btn :deep(svg) { @apply h-4 w-4; }.btn.primary { @apply bg-[#4f7657] text-white; }.btn.secondary { @apply border border-[#d5d0c5] bg-white text-[#26372d]; }.btn.danger-btn,.danger-btn { @apply border border-[#e3b7b0] bg-[#fff1ef] text-[#8f3f36]; }
.metric { @apply relative min-h-28 rounded-[1.25rem] border border-[#ddd7cb] border-t-[3px] bg-white/90 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#cfe3d2]; }.metric.active { @apply ring-2 ring-[#547b5c] ring-offset-2; }.metric > span,.metric > small { @apply block text-[13px] font-semibold text-[#56635b]; }.metric > strong { @apply my-1 block text-2xl font-extrabold; font-variant-numeric:tabular-nums; }.metric i { @apply absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full not-italic; }.metric i :deep(svg) { @apply h-4 w-4; }.metric.green { @apply border-t-[#5b8263]; }.metric.green i { @apply bg-[#e7f3e9] text-[#3f6747]; }.metric.amber { @apply border-t-[#c88a2c]; }.metric.amber i { @apply bg-[#fff1dc] text-[#865717]; }.metric.blue { @apply border-t-[#4b8293]; }.metric.blue i { @apply bg-[#e7f2f6] text-[#285f70]; }.metric.purple { @apply border-t-[#8261a3]; }.metric.purple i { @apply bg-[#efe8f7] text-[#654487]; }
.emergency-alert { @apply flex w-full items-center justify-between gap-4 rounded-2xl border border-[#e6bbb4] bg-[#fff1ef] px-5 py-3.5 text-left text-sm text-[#8f3f36] transition hover:bg-[#fde9e6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f0d0cb]; }.emergency-alert.active { @apply border-[#b34c42] bg-[#fbe5e1] ring-2 ring-[#b34c42]/20; }.emergency-alert > span { @apply flex items-center gap-2; }.emergency-alert svg { @apply h-4 w-4 shrink-0; }.emergency-alert > span:last-child { @apply shrink-0 text-[13px] font-bold; }
.filter-panel { @apply flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between; }.tab { @apply rounded-full px-3.5 py-2 text-[13px] font-bold text-[#56635b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#cfe3d2]; }.tab.active { @apply bg-[#254e3b] text-white; }.tab b { @apply ml-1; font-variant-numeric:tabular-nums; }.search { @apply relative block; }.search > svg { @apply absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#66726a]; }.search input { @apply w-full rounded-full border border-[#d9d3c7] bg-white py-2.5 pl-9 pr-4 text-sm text-[#1f2d25] outline-none placeholder:text-[#66726a] focus:ring-4 focus:ring-[#dcebdd] lg:min-w-80; }
.ticket-table { @apply text-sm; }.ticket-table thead { @apply bg-[#fbf9f3] text-[13px] text-[#56635b]; }.ticket-table th,.ticket-table td { @apply border-b border-[#e9e3d8] px-3 py-3.5; }.ticket-table tbody tr:not(.empty-row) { @apply cursor-pointer transition hover:bg-[#f5f9f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4f7657]; }.ticket-table tbody tr.selected { @apply bg-[#eaf5eb]; }.ticket-table tbody tr.selected > td:first-child { box-shadow:inset 3px 0 #315c43; }.ticket-table td b { @apply font-semibold text-[#26372d]; }.ticket-table td small { @apply mt-0.5 block max-w-56 truncate text-[13px] text-[#66726a]; }.case-cell { @apply flex items-center justify-between gap-2; }.case-cell > svg { @apply h-4 w-4 shrink-0 text-[#55755d]; }.status-cell { @apply flex flex-wrap items-center gap-1.5; }.empty-row td { @apply py-12 text-center text-sm text-[#66726a]; }
.badge { @apply inline-flex rounded-full border px-2.5 py-1 text-xs font-bold; }.badge.green { @apply border-[#bdd8c1] bg-[#e7f3e9] text-[#3f6747]; }.badge.red { @apply border-[#e5bcb5] bg-[#fbe9e6] text-[#8f3f36]; }.badge.blue { @apply border-[#bfd7df] bg-[#e7f2f6] text-[#285f70]; }.badge.amber { @apply border-[#e6cca3] bg-[#fff1dd] text-[#865717]; }.badge.purple { @apply border-[#d5c4e5] bg-[#f0e9f7] text-[#654487]; }.badge.neutral { @apply border-[#d5d1c7] bg-[#f2f0ea] text-[#56635b]; }.unread { @apply rounded-full bg-[#f8dfdb] px-2 py-1 text-xs font-bold not-italic text-[#8f3f36]; }
.danger,.success,.inspection-waiting { @apply flex gap-3 rounded-2xl border p-4; }.danger { @apply border-[#e5b6ae] bg-[#fff0ed] text-[#8f3f36]; }.success { @apply border-[#bfd8c3] bg-[#edf7ee] text-[#3f6747]; }.inspection-waiting { @apply border-[#c9dce3] bg-[#edf6f8] text-[#285f70]; }.danger > svg,.success > svg,.inspection-waiting > svg { @apply mt-0.5 h-5 w-5 shrink-0; }.danger b,.success b { @apply text-[15px] font-bold; }.danger p,.success p,.inspection-waiting p { @apply mt-1 text-sm leading-6; }.inspection-waiting span { @apply text-xs font-bold uppercase tracking-wide; }.inspection-waiting h3 { @apply mt-0.5 text-[17px] font-bold; }
.info-list { @apply grid gap-x-6 sm:grid-cols-2; }.info-list > div { @apply border-b border-[#ece6dc] py-3; }.info-list dt { @apply flex items-center gap-1.5 text-[13px] font-semibold text-[#66726a]; }.info-list dt :deep(svg) { @apply h-4 w-4; }.info-list dd { @apply mt-1 text-sm font-semibold leading-6 text-[#26372d]; }.info-list a { @apply underline decoration-[#a9b9ad] underline-offset-2; }
.content-section { @apply border-t border-[#e9e3d8] pt-5; }.content-section h3,.action-block h3 { @apply flex items-center gap-2 text-[17px] font-bold; }.content-section > p,.action-block > p,.action-title p { @apply mt-1.5 text-sm leading-6 text-[#56635b]; }.file { @apply inline-flex items-center gap-1.5 rounded-lg bg-[#f3f5f1] px-3 py-2 text-[13px] font-semibold text-[#46564c]; }.file :deep(svg) { @apply h-4 w-4; }.inventory > div > span { @apply rounded-full bg-[#e7f3e9] px-2.5 py-1 text-xs font-bold text-[#3f6747]; }.inventory dl { @apply mt-3 grid gap-x-5 sm:grid-cols-2; }.inventory dl div { @apply grid grid-cols-[88px_1fr] gap-2 border-b border-[#ece6dc] py-2.5 text-sm; }.inventory dt { @apply text-[#66726a]; }.inventory dd { @apply font-semibold text-[#26372d]; }
.workflow-summary { @apply rounded-2xl bg-[#f1f6f1] p-4; }.workflow-summary header { @apply flex items-center justify-between; }.workflow-summary header span { @apply text-xs font-bold uppercase tracking-wide text-[#4f7657]; }.workflow-summary header h3 { @apply mt-0.5 text-[17px] font-bold; }.workflow-summary header strong { @apply text-sm text-[#4f7657]; font-variant-numeric:tabular-nums; }.workflow-summary ol { @apply mt-4 grid grid-cols-5 gap-1; }.workflow-summary li { @apply flex min-w-0 flex-col items-center gap-1 text-center text-[11px] font-semibold text-[#7a857d]; }.workflow-summary li i { @apply grid h-6 w-6 place-items-center rounded-full border border-[#d4d9d3] bg-white text-[11px] not-italic; }.workflow-summary li i :deep(svg) { @apply h-3.5 w-3.5; }.workflow-summary li.done { @apply text-[#3f6747]; }.workflow-summary li.done i { @apply border-[#5b8263] bg-[#5b8263] text-white; }.workflow-summary li.current { @apply text-[#254e3b]; }.workflow-summary li.current i { @apply border-[#315c43] bg-[#315c43] font-bold text-white ring-4 ring-[#dbe9dd]; }.workflow-summary li.future { @apply opacity-65; }
.action-block { @apply rounded-2xl border border-[#dcd6ca] bg-[#fbf9f3] p-5; }.current-action { @apply border-[#bcd2c0] bg-[#f8fcf8] shadow-[0_8px_22px_rgba(57,88,65,.08)]; }.eyebrow { @apply mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#4f7657]; }.action-title { @apply flex items-start justify-between gap-3; }.action-title > svg { @apply h-5 w-5 shrink-0 text-[#4f7657]; }.action-block label,.field,.form-label { @apply text-[13px] font-semibold text-[#3f4c44]; }.action-block input,.action-block select,.action-block textarea,.field textarea { @apply mt-1.5 w-full rounded-xl border border-[#d7d1c6] bg-white px-3 py-2.5 text-sm font-normal text-[#1f2d25] outline-none placeholder:text-[#68736b] focus:ring-4 focus:ring-[#dcebdd]; }.action-block textarea,.field textarea { @apply min-h-24; }.field-with-action { @apply relative block; }.field-with-action input { @apply pr-32; }.field-with-action button { @apply absolute right-1.5 top-[7px] rounded-lg bg-[#edf4ed] px-2.5 py-2 text-xs font-bold text-[#3f6747] hover:bg-[#e1ece2]; }.money-input { @apply relative block; }.money-input > b { @apply absolute left-3 top-[17px] z-10 text-[13px] text-[#56635b]; }.money-input input { @apply pl-12; font-variant-numeric:tabular-nums; }.notice { @apply mt-4 rounded-xl bg-[#fff1dd] p-3.5 text-[13px] leading-6 text-[#865717]; }
.upload-zone { @apply mt-1.5 block rounded-xl border border-dashed border-[#b9c8bc] bg-white p-3; }.upload-zone > label { @apply flex cursor-pointer flex-col items-center gap-1 rounded-lg py-4 text-center hover:bg-[#f5f9f5]; }.upload-zone > label :deep(svg) { @apply mb-1 h-6 w-6 text-[#4f7657]; }.upload-zone > label b { @apply text-sm; }.upload-zone > label small { @apply text-xs font-normal text-[#66726a]; }.upload-file { @apply flex items-center gap-3; }.upload-file > svg { @apply h-8 w-8 shrink-0 rounded-lg bg-[#e8f2e9] p-1.5 text-[#4f7657]; }.upload-file > span { @apply min-w-0 flex-1; }.upload-file b,.upload-file small { @apply block truncate; }.upload-file small { @apply mt-0.5 text-xs font-normal text-[#66726a]; }.upload-file button { @apply grid h-9 w-9 place-items-center rounded-full text-[#8f3f36] hover:bg-[#fbe9e6]; }.upload-file button :deep(svg) { @apply h-4 w-4; }
.secondary-details,.timeline-details { @apply overflow-hidden rounded-2xl border border-[#e2dccf] bg-white; }.secondary-details summary,.timeline-details summary { @apply flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-bold text-[#46564c] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#dcebdd]; }.secondary-details summary::-webkit-details-marker,.timeline-details summary::-webkit-details-marker { display:none; }.secondary-details summary :deep(svg),.timeline-details summary :deep(svg) { @apply h-4 w-4 transition; }.secondary-details[open] summary :deep(svg),.timeline-details[open] summary :deep(svg) { @apply rotate-180; }.secondary-details dl { @apply border-t border-[#e9e3d8] px-4 py-2; }.secondary-details dl div,.confirm-list div { @apply grid grid-cols-[110px_1fr] gap-3 border-b border-[#ece6dc] py-2.5 text-sm last:border-0; }.secondary-details dt,.confirm-list dt { @apply text-[#66726a]; }.secondary-details dd,.confirm-list dd { @apply font-semibold text-[#26372d]; }
.timeline-details summary > span { @apply flex items-center gap-2; }.timeline { @apply border-t border-[#e9e3d8] px-4 pt-4; }.timeline > div { @apply relative ml-1 border-l border-[#c5d2c8] pb-5 pl-4; }.timeline i { @apply absolute -left-1 top-1.5 h-2 w-2 rounded-full bg-[#4f7657]; }.timeline p { @apply flex flex-col gap-1 text-sm sm:flex-row sm:justify-between; }.timeline p b { @apply font-semibold; }.timeline p span { @apply shrink-0 text-[13px] text-[#66726a]; }.timeline small { @apply mt-1 block text-[13px] leading-5 text-[#56635b]; }
.backdrop { @apply fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#24332a]/45 p-3 backdrop-blur-sm; }.dialog { @apply w-full max-w-lg overflow-hidden rounded-[1.5rem] border border-[#e1dacd] bg-[#fffdf8] text-[#1f2d25] shadow-2xl; font-family:"Noto Sans TC",system-ui,sans-serif; }.dialog > header { @apply flex items-center justify-between gap-4 border-b border-[#e4ded2] p-5; }.dialog > header p { @apply text-[13px] text-[#66726a]; }.dialog > header h2 { @apply text-xl font-bold; }.dialog > footer { @apply flex justify-end gap-2 border-t border-[#e4ded2] p-4; }.dialog-copy { @apply mb-4 text-sm leading-6 text-[#56635b]; }.close { @apply grid h-9 w-9 place-items-center rounded-full border border-[#d5d0c5] bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dcebdd]; }.close :deep(svg) { @apply h-4 w-4; }.reason { @apply rounded-full border border-[#d5d0c5] bg-white px-3 py-2 text-[13px] font-bold text-[#46564c] hover:bg-[#f5f4ef]; }
.vendor-dialog { @apply max-w-xl; }.vendor-option { @apply flex w-full items-center gap-3 rounded-2xl border border-[#ddd7cc] bg-white p-4 text-left transition hover:border-[#91af97] hover:bg-[#f5faf5] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dcebdd]; }.vendor-option > span:first-child { @apply grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f3e9] text-[#3f6747]; }.vendor-option > span:first-child :deep(svg) { @apply h-5 w-5; }.vendor-option > span:nth-child(2) { @apply min-w-0 flex-1; }.vendor-option b,.vendor-option small,.vendor-option em { @apply block; }.vendor-option b { @apply text-[15px] font-bold; }.vendor-option small { @apply mt-1 text-[13px] text-[#66726a]; }.vendor-option em { @apply mt-2 flex items-center gap-1 text-[13px] font-semibold not-italic text-[#3f6747]; }.vendor-option em :deep(svg),.vendor-option > svg { @apply h-4 w-4; }.confirm-list { @apply rounded-2xl bg-[#f7f5ef] px-4 py-2; }
.toast { @apply fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#234c39] px-5 py-3 text-sm font-bold text-white shadow-xl; }.toast :deep(svg) { @apply h-4 w-4; }.toast-enter-active,.toast-leave-active { transition:.2s; }.toast-enter-from,.toast-leave-to { opacity:0; transform:translate(-50%,8px); }
@media (max-width:640px) { .emergency-alert { @apply items-start; }.emergency-alert > span:last-child { @apply hidden; }.workflow-summary ol { @apply grid-cols-1 items-start gap-2; }.workflow-summary li { @apply flex-row text-left text-xs; }.field-with-action input { @apply pr-3; }.field-with-action button { @apply relative right-auto top-auto mt-2 w-full; } }
</style>

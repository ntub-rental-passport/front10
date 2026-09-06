<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileImage,
  History,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
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

const { tickets, updateTicket, markRead, resetDemo } = useRepairTickets()
const statusFilter = ref<'all' | RepairStatus>('all')
const keyword = ref('')
const selectedId = ref(tickets.value[0]?.id ?? '')
const toast = ref('')
const actionOpen = ref<'request' | 'reject' | null>(null)
const actionReason = ref('')
const scheduleDraft = ref({ vendorName: '', vendorPhone: '', scheduledAt: '', estimatedCost: 0, note: '', needsTenant: true })
const costDraft = ref({ actualCost: 0, payer: '房東負擔', receiptName: '' })

const selected = computed(() => tickets.value.find((item) => item.id === selectedId.value) ?? tickets.value[0])
const count = (status: RepairStatus) => tickets.value.filter((item) => item.status === status).length
const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return tickets.value.filter((item) => (statusFilter.value === 'all' || item.status === statusFilter.value) && (!query || `${item.property} ${item.room} ${item.tenant} ${item.equipment} ${item.id}`.toLowerCase().includes(query)))
})
const tabs = computed(() => [
  { value: 'all' as const, label: '全部', count: tickets.value.length },
  { value: 'pending' as const, label: '待處理', count: count('pending') },
  { value: 'processing' as const, label: '處理中', count: count('processing') },
  { value: 'inspection' as const, label: '待驗收', count: count('inspection') },
  { value: 'completed' as const, label: '已完成', count: count('completed') },
])
const unreadCount = computed(() => tickets.value.filter((item) => !item.landlordRead).length)
const emergencyCount = computed(() => tickets.value.filter((item) => item.urgency === 'emergency' && item.status !== 'completed').length)

const statusMeta: Record<RepairStatus, { label: string; cls: string }> = {
  pending: { label: '待處理', cls: 'amber' }, processing: { label: '處理中', cls: 'blue' }, inspection: { label: '待驗收', cls: 'purple' }, completed: { label: '已完成', cls: 'green' },
}
const urgencyMeta: Record<RepairUrgency, { label: string; cls: string }> = {
  emergency: { label: '緊急', cls: 'red' }, soon: { label: '儘快處理', cls: 'amber' }, normal: { label: '一般', cls: 'neutral' },
}
const responsibilityOptions: { value: RepairResponsibility; label: string }[] = [
  { value: 'pending', label: '暫待確認' }, { value: 'landlord', label: '房東負擔' }, { value: 'tenant', label: '租客負擔' }, { value: 'shared', label: '雙方協議分攤' },
]
const vendors = [
  { name: '安心水電工程行', type: '水電／漏水', distance: '距離 0.8 公里', phone: '02-2501-8899', rating: '4.8' },
  { name: '好鄰居居家修繕', type: '家具／門窗', distance: '距離 1.3 公里', phone: '02-2700-5218', rating: '4.7' },
  { name: '大台北冷氣服務', type: '空調／家電', distance: '距離 1.7 公里', phone: '02-2711-0288', rating: '4.6' },
]

const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未安排'
const money = (value: number | null) => value === null ? '待確認' : `NT$${value.toLocaleString('zh-TW')}`
const accessLabel = (value: RepairTicket['accessPermission']) => ({ present: '租客在場時進入', absent: '同意無人在場時進入', 'contact-first': '進入前先聯絡租客' }[value])

function notify(message: string): void {
  toast.value = message
  window.setTimeout(() => (toast.value = ''), 2800)
}

function selectTicket(item: RepairTicket): void {
  selectedId.value = item.id
  markRead(item.id)
  scheduleDraft.value = { vendorName: item.vendorName, vendorPhone: item.vendorPhone, scheduledAt: item.scheduledAt, estimatedCost: item.estimatedCost ?? 0, note: '', needsTenant: item.accessPermission === 'present' }
  costDraft.value = { actualCost: item.actualCost ?? 0, payer: item.payer, receiptName: item.receiptName }
}

function acceptTicket(): void {
  updateTicket(selected.value.id, { status: 'processing', landlordRead: true }, { title: '房東接受處理', detail: '案件已進入責任確認與安排維修階段。' })
  notify('已接受處理，租客將收到通知')
}

function submitAction(): void {
  if (!actionReason.value.trim()) return
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
  const label = responsibilityOptions.find((item) => item.value === selected.value.responsibility)?.label ?? '暫待確認'
  updateTicket(selected.value.id, { payer: label }, { title: '更新責任與費用說明', detail: `${label}：${selected.value.responsibilityNote || '尚未補充說明'}` })
  notify('已保存責任歸屬與說明')
}

function useVendor(vendor: typeof vendors[number]): void {
  scheduleDraft.value.vendorName = vendor.name
  scheduleDraft.value.vendorPhone = vendor.phone
  notify(`已帶入 ${vendor.name}`)
}

function saveSchedule(): void {
  if (!scheduleDraft.value.vendorName.trim() || !scheduleDraft.value.scheduledAt) return
  updateTicket(selected.value.id, {
    status: 'processing', vendorName: scheduleDraft.value.vendorName, vendorPhone: scheduleDraft.value.vendorPhone,
    scheduledAt: scheduleDraft.value.scheduledAt, estimatedCost: scheduleDraft.value.estimatedCost || null,
  }, { title: '已安排維修人員', detail: `${scheduleDraft.value.vendorName}，預計 ${formatDateTime(scheduleDraft.value.scheduledAt)} 到場。${scheduleDraft.value.note}` })
  notify('已安排維修，租客可確認或申請改期')
}

function handleReceipt(event: Event): void {
  const input = event.target as HTMLInputElement
  costDraft.value.receiptName = input.files?.[0]?.name ?? ''
}

function completeRepair(): void {
  updateTicket(selected.value.id, {
    status: 'inspection', actualCost: costDraft.value.actualCost || null, payer: costDraft.value.payer, receiptName: costDraft.value.receiptName,
  }, { title: '維修完成，等待租客驗收', detail: `實際費用 ${money(costDraft.value.actualCost || null)}，${costDraft.value.payer}。` })
  notify('已送出租客驗收，原始紀錄會完整保留')
}

function reset(): void {
  resetDemo(); selectedId.value = tickets.value[0]?.id ?? ''; notify('已還原展示資料')
}
</script>

<template>
  <div class="mx-auto max-w-[1640px] space-y-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 class="text-3xl font-black tracking-tight">修繕管理</h1><p class="mt-1.5 text-sm text-[#758078]">掌握報修、責任、安排、費用與驗收，保留完整處理證明。</p></div><button class="btn secondary" @click="reset"><RefreshCw />還原展示資料</button></header>

    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <article class="metric red"><span>緊急案件</span><strong>{{ emergencyCount }}</strong><small>優先確認居住安全</small><i><AlertTriangle /></i></article>
      <article class="metric amber"><span>待處理</span><strong>{{ count('pending') }}</strong><small>其中 {{ unreadCount }} 件尚未讀取</small><i><Clock3 /></i></article>
      <article class="metric blue"><span>處理中</span><strong>{{ count('processing') }}</strong><small>責任確認或安排維修</small><i><Wrench /></i></article>
      <article class="metric purple"><span>待租客驗收</span><strong>{{ count('inspection') }}</strong><small>等待確認完修結果</small><i><ShieldCheck /></i></article>
      <article class="metric green"><span>已完成</span><strong>{{ count('completed') }}</strong><small>完整歷程已封存</small><i><CheckCircle2 /></i></article>
    </section>

    <section class="panel p-3"><div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div class="flex flex-wrap gap-1.5"><button v-for="item in tabs" :key="item.value" class="tab" :class="{ active: statusFilter === item.value }" @click="statusFilter = item.value">{{ item.label }} <b>{{ item.count }}</b></button></div><label class="search"><Search /><input v-model="keyword" placeholder="搜尋房屋、租客、設備或案件編號" /></label></div></section>

    <section class="grid gap-5 xl:grid-cols-[minmax(560px,1.15fr)_minmax(420px,.85fr)]">
      <article class="panel overflow-hidden"><header class="panel-head"><div><h2>報修案件列表</h2><p>點選案件查看內容並留下處理紀錄。</p></div><span>{{ filtered.length }} 筆</span></header>
        <div class="overflow-x-auto"><table class="w-full min-w-[820px] text-left text-sm"><thead><tr><th>程度</th><th>房屋／房號</th><th>租客</th><th>報修項目</th><th>建立時間</th><th>狀態</th><th>預計維修</th></tr></thead><tbody>
          <tr v-for="item in filtered" :key="item.id" :class="{ selected: selected?.id === item.id }" @click="selectTicket(item)"><td><span class="badge" :class="urgencyMeta[item.urgency].cls">{{ urgencyMeta[item.urgency].label }}</span><i v-if="!item.landlordRead" class="unread" title="尚未讀取" /></td><td><b>{{ item.property }}</b><small>{{ item.room }}</small></td><td><b>{{ item.tenant }}</b><small>{{ item.phone }}</small></td><td><b>{{ item.location }}／{{ item.equipment }}</b><small class="max-w-40 truncate">{{ item.description }}</small></td><td>{{ formatDateTime(item.createdAt) }}</td><td><span class="badge" :class="statusMeta[item.status].cls">{{ statusMeta[item.status].label }}</span></td><td>{{ item.scheduledAt ? formatDateTime(item.scheduledAt) : '尚未安排' }}</td></tr>
          <tr v-if="!filtered.length"><td colspan="7" class="py-12 text-center text-[#778078]">沒有符合條件的報修案件。</td></tr>
        </tbody></table></div>
      </article>

      <aside v-if="selected" class="panel overflow-hidden"><header class="panel-head"><div><p>{{ selected.id }}</p><h2>{{ selected.location }}／{{ selected.equipment }}</h2></div><div class="flex gap-1"><span class="badge" :class="urgencyMeta[selected.urgency].cls">{{ urgencyMeta[selected.urgency].label }}</span><span class="badge" :class="statusMeta[selected.status].cls">{{ statusMeta[selected.status].label }}</span></div></header>
        <div class="max-h-[720px] space-y-4 overflow-auto p-4">
          <section v-if="selected.urgency === 'emergency' && selected.status !== 'completed'" class="danger"><AlertTriangle /><div><b>先確認現場安全</b><p>若有火災、瓦斯外洩、嚴重漏電或人身危險，應請租客先離開現場並聯絡 119、相關公用事業或管理單位。報修送出不代表緊急服務已受理。</p></div></section>
          <section class="info-grid"><div><span><Building2 />租屋處</span><b>{{ selected.address }}／{{ selected.room }}</b></div><div><span><UserRound />租客聯絡</span><b>{{ selected.tenant }} · {{ selected.phone }}</b></div><div><span><CalendarClock />方便時段</span><b>{{ selected.availableTime }}</b></div><div><span><ShieldCheck />進場同意</span><b>{{ accessLabel(selected.accessPermission) }}</b></div></section>
          <section class="soft"><h3>問題描述</h3><p>{{ selected.description }}</p><div class="mt-3 flex flex-wrap gap-2"><span v-for="name in selected.photoNames" :key="name" class="file"><FileImage />{{ name }}</span></div></section>
          <section class="soft inventory"><div class="flex items-center justify-between"><h3>家具點交存證</h3><span>自動串接</span></div><dl><div><dt>品牌／型號</dt><dd>{{ selected.inventory.brand }}／{{ selected.inventory.model }}</dd></div><div><dt>入住狀況</dt><dd>{{ selected.inventory.moveInStatus }}</dd></div><div><dt>入住照片</dt><dd>{{ selected.inventory.moveInPhoto }}</dd></div><div><dt>過去報修</dt><dd>{{ selected.inventory.repairCount }} 次</dd></div></dl></section>

          <template v-if="selected.status === 'pending'">
            <section class="action-block"><h3>確認處理方式</h3><p>接受後再確認責任與維修安排；如需拒絕，必須保留原因。</p><div class="grid gap-2 sm:grid-cols-3"><button class="btn primary" @click="acceptTicket"><Check />接受處理</button><button class="btn secondary" @click="actionOpen = 'request'">請租客補充</button><button class="btn danger-btn" @click="actionOpen = 'reject'">不屬報修範圍</button></div></section>
          </template>

          <template v-else-if="selected.status !== 'completed'">
            <section class="action-block"><h3>責任與費用說明</h3><p>系統提供資料對照，不直接作法律判定；請由雙方確認最後結果。</p><div class="grid gap-3 sm:grid-cols-2"><label>責任歸屬<select v-model="selected.responsibility"><option v-for="item in responsibilityOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label class="sm:col-span-2">判斷依據與說明<textarea v-model="selected.responsibilityNote" placeholder="說明設備狀況、契約約定與雙方協議" /></label></div><button class="btn secondary mt-3" @click="saveResponsibility">儲存責任說明</button></section>

            <section v-if="selected.status === 'processing'" class="action-block"><div class="flex items-center justify-between"><div><h3>安排維修</h3><p>儲存後租客會收到時間通知並可申請改期。</p></div><Store class="h-5 w-5 text-[#5b8263]" /></div><div class="grid gap-3 sm:grid-cols-2"><label>廠商／人員名稱<input v-model="scheduleDraft.vendorName" placeholder="輸入名稱" /></label><label>聯絡電話<input v-model="scheduleDraft.vendorPhone" placeholder="02-0000-0000" /></label><label>預計到場時間<input v-model="scheduleDraft.scheduledAt" type="datetime-local" /></label><label>預估費用<input v-model.number="scheduleDraft.estimatedCost" min="0" type="number" /></label><label class="sm:col-span-2">備註<textarea v-model="scheduleDraft.note" placeholder="例如：到場前 30 分鐘聯絡" /></label></div><button class="btn primary mt-3" @click="saveSchedule"><CalendarClock />儲存維修安排</button></section>

            <section v-if="selected.status === 'processing'" class="action-block"><h3>完修費用與憑證</h3><div class="grid gap-3 sm:grid-cols-2"><label>實際費用<input v-model.number="costDraft.actualCost" min="0" type="number" /></label><label>付款人<select v-model="costDraft.payer"><option>房東負擔</option><option>租客負擔</option><option>雙方協議分攤</option><option>待確認</option></select></label><label class="sm:col-span-2">收據或發票<input type="file" accept="image/*,.pdf" @change="handleReceipt" /><small v-if="costDraft.receiptName">已選擇：{{ costDraft.receiptName }}</small></label></div><p class="notice">若從租金或押金扣除，請另外填寫說明並取得租客確認；系統不會自動扣除。</p><button class="btn primary mt-3" @click="completeRepair"><CheckCircle2 />標記完修並送驗收</button></section>
          </template>

          <section v-else class="success"><CheckCircle2 /><div><b>案件已完成並保留原始紀錄</b><p>驗收結果：{{ selected.inspectionResult === 'resolved' ? '問題已解決' : '依處理紀錄結案' }}。若有後續修改，系統會新增一筆操作紀錄而不覆蓋原內容。</p></div></section>
          <section class="soft"><h3><History />完整時間軸</h3><div class="timeline"><div v-for="item in [...selected.timeline].reverse()" :key="item.id"><i /><p><b>{{ item.title }}</b><span>{{ formatDateTime(item.at) }}</span></p><small v-if="item.detail">{{ item.detail }}</small></div></div></section>
        </div>
      </aside>
    </section>

    <section class="panel overflow-hidden"><header class="panel-head"><div><h2>租屋處附近的修繕店家</h2><p>依案件地址提供選擇；店家由房東自行聯絡與安排，平台不代為派工。</p></div><MapPin class="h-5 w-5 text-[#5b8263]" /></header><div class="grid gap-3 p-4 md:grid-cols-3"><article v-for="vendor in vendors" :key="vendor.name" class="vendor"><div><span><Store /></span><em>★ {{ vendor.rating }}</em></div><h3>{{ vendor.name }}</h3><p>{{ vendor.type }} · {{ vendor.distance }}</p><small><Phone />{{ vendor.phone }}</small><button @click="useVendor(vendor)">帶入維修安排<ChevronRight /></button></article></div></section>

    <Transition name="toast"><div v-if="toast" class="toast"><Check />{{ toast }}</div></Transition>
    <Teleport to="body"><div v-if="actionOpen" class="backdrop" @click.self="actionOpen = null"><form class="dialog" @submit.prevent="submitAction"><header><div><p>{{ selected.id }}</p><h2>{{ actionOpen === 'request' ? '要求租客補充資料' : '不屬於報修範圍' }}</h2></div><button type="button" class="close" @click="actionOpen = null"><X /></button></header><div class="p-5"><p class="mb-4 text-sm leading-6 text-[#69736c]">{{ actionOpen === 'request' ? '請清楚說明需要補充的照片或資訊。' : '請選擇或填寫具體原因，內容將同步給租客並永久保留。' }}</p><label class="field">原因<textarea v-model="actionReason" required :placeholder="actionOpen === 'request' ? '例如：請補拍漏水源頭與水表位置' : '例如：契約已約定該耗材由租客負責更換'" /></label><div v-if="actionOpen === 'reject'" class="mt-3 flex flex-wrap gap-2"><button v-for="reason in ['屬於耗材更換','疑似人為損壞','契約約定由租客負責','問題描述不足','重複報修']" :key="reason" type="button" class="reason" @click="actionReason = reason">{{ reason }}</button></div></div><footer><button type="button" class="btn secondary" @click="actionOpen = null">取消</button><button class="btn" :class="actionOpen === 'reject' ? 'danger-btn' : 'primary'">確認並通知</button></footer></form></div></Teleport>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.panel { @apply rounded-[1.4rem] border border-[#e2dccf] bg-white/90 shadow-[0_10px_28px_rgba(65,70,61,.05)]; }.panel-head { @apply flex items-center justify-between border-b border-[#e7e1d6] p-4; }.panel-head h2 { @apply text-lg font-black; }.panel-head p { @apply mt-1 text-xs text-[#778078]; }.panel-head > span { @apply rounded-full bg-[#edf5ed] px-3 py-1 text-xs font-bold text-[#587a5f]; }
.btn { @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-px; }.btn :deep(svg) { @apply h-4 w-4; }.btn.primary { @apply bg-[#5b8263] text-white; }.btn.secondary { @apply border border-[#ded8cc] bg-white; }.btn.danger-btn,.danger-btn { @apply border border-[#e8bfb8] bg-[#fff1ef] text-[#a74f45]; }
.metric { @apply relative min-h-28 rounded-[1.25rem] border border-[#e2dccf] border-t-[3px] bg-white/90 p-4; }.metric > span,.metric > small { @apply block text-xs font-bold text-[#727c74]; }.metric > strong { @apply my-1 block text-2xl font-black; }.metric i { @apply absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full not-italic; }.metric i :deep(svg) { @apply h-4 w-4; }.metric.green { @apply border-t-[#5b8263]; }.metric.green i { @apply bg-[#e7f3e9] text-[#5b8263]; }.metric.amber { @apply border-t-[#c88a2c]; }.metric.amber i { @apply bg-[#fff1dc] text-[#b87920]; }.metric.red { @apply border-t-[#be594c]; }.metric.red i { @apply bg-[#fbe8e5] text-[#b45549]; }.metric.blue { @apply border-t-[#4b8293]; }.metric.blue i { @apply bg-[#e7f2f6] text-[#3f7c8e]; }.metric.purple { @apply border-t-[#8261a3]; }.metric.purple i { @apply bg-[#efe8f7] text-[#7b58a1]; }
.tab { @apply rounded-full px-3 py-2 text-xs font-bold text-[#737c75]; }.tab.active { @apply bg-[#254e3b] text-white; }.tab b { @apply ml-1; }.search { @apply relative block; }.search > svg { @apply absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#879087]; }.search input { @apply min-w-72 rounded-full border border-[#dfd8cc] bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-4 focus:ring-[#dcebdd]; }
table thead { @apply bg-[#fbf9f3] text-xs text-[#747d76]; } th,td { @apply border-b border-[#e9e3d8] px-3 py-3; } tbody tr { @apply cursor-pointer transition hover:bg-[#f7faf6]; } tbody tr.selected { @apply bg-[#eaf5eb]; } td small { @apply block text-xs text-[#788179]; }.badge { @apply inline-flex rounded-full border px-2 py-1 text-[11px] font-bold; }.badge.green { @apply border-[#cce1cf] bg-[#e7f3e9] text-[#54795a]; }.badge.red { @apply border-[#edc9c3] bg-[#fbe9e6] text-[#a7564b]; }.badge.blue { @apply border-[#cbdfe7] bg-[#e7f2f6] text-[#3d788a]; }.badge.amber { @apply border-[#ecd4ae] bg-[#fff1dd] text-[#a56c21]; }.badge.purple { @apply border-[#ddd0ea] bg-[#f0e9f7] text-[#76569a]; }.badge.neutral { @apply border-[#ddd9cf] bg-[#f2f0ea] text-[#6e756f]; }.unread { @apply ml-2 inline-block h-2 w-2 rounded-full bg-[#c14f43]; }
.danger,.success { @apply flex gap-3 rounded-2xl border p-4; }.danger { @apply border-[#edc2ba] bg-[#fff0ed] text-[#8f443b]; }.success { @apply border-[#c8dfcb] bg-[#edf7ee] text-[#4d7255]; }.danger > svg,.success > svg { @apply h-5 w-5 shrink-0; }.danger p,.success p { @apply mt-1 text-xs leading-5; }.info-grid { @apply grid gap-2 sm:grid-cols-2; }.info-grid > div { @apply rounded-xl border border-[#e4ded2] p-3; }.info-grid span { @apply flex items-center gap-1 text-xs text-[#778078]; }.info-grid span :deep(svg) { @apply h-3.5 w-3.5; }.info-grid b { @apply mt-1 block text-xs; }
.soft,.action-block { @apply rounded-2xl border border-[#e4ded2] bg-[#fbf9f3] p-4; }.soft h3,.action-block h3 { @apply flex items-center gap-2 font-black; }.soft h3 :deep(svg) { @apply h-4 w-4; }.soft > p,.action-block > p { @apply mt-1 text-xs leading-5 text-[#6f7971]; }.file { @apply inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-bold; }.file :deep(svg) { @apply h-3.5 w-3.5; }.inventory > div > span { @apply rounded-full bg-[#e7f3e9] px-2 py-1 text-[10px] font-bold text-[#55795d]; }.inventory dl { @apply mt-3 space-y-2; }.inventory dl div { @apply grid grid-cols-[90px_1fr] gap-2 text-xs; }.inventory dt { @apply text-[#788179]; }.inventory dd { @apply font-semibold; }
.action-block label,.field { @apply text-xs font-bold; }.action-block input,.action-block select,.action-block textarea,.field textarea { @apply mt-1 w-full rounded-xl border border-[#ddd7ca] bg-white px-3 py-2.5 font-normal outline-none focus:ring-4 focus:ring-[#dcebdd]; }.action-block textarea,.field textarea { @apply min-h-20; }.action-block label small { @apply mt-1 block text-[#69736c]; }.notice { @apply mt-3 rounded-xl bg-[#fff2dd] p-3 text-xs leading-5 text-[#8f6428]; }
.timeline { @apply mt-3; }.timeline > div { @apply relative ml-1 border-l border-[#ced8d0] pb-4 pl-4; }.timeline i { @apply absolute -left-1 top-1 h-2 w-2 rounded-full bg-[#5b8263]; }.timeline p { @apply flex justify-between gap-2 text-xs; }.timeline p span { @apply shrink-0 text-[#7b847d]; }.timeline small { @apply mt-1 block text-xs leading-5 text-[#6c766e]; }.vendor { @apply rounded-2xl border border-[#e3ddd1] p-4; }.vendor > div { @apply flex items-center justify-between; }.vendor > div span { @apply grid h-9 w-9 place-items-center rounded-full bg-[#e8f3e9] text-[#5b8263]; }.vendor > div svg { @apply h-4 w-4; }.vendor em { @apply text-xs font-bold not-italic text-[#b27624]; }.vendor h3 { @apply mt-3 font-black; }.vendor p { @apply mt-1 text-xs text-[#778078]; }.vendor small { @apply mt-3 flex items-center gap-1 text-xs; }.vendor small :deep(svg) { @apply h-3.5 w-3.5; }.vendor button { @apply mt-4 flex w-full items-center justify-center gap-1 rounded-full border border-[#cbdccb] py-2 text-xs font-bold text-[#55795d]; }.vendor button :deep(svg) { @apply h-3.5 w-3.5; }
.backdrop { @apply fixed inset-0 z-50 grid place-items-center bg-[#24332a]/45 p-3 backdrop-blur-sm; }.dialog { @apply w-full max-w-lg overflow-hidden rounded-[1.5rem] border border-[#e1dacd] bg-[#fffdf8] shadow-2xl; }.dialog > header { @apply flex items-center justify-between border-b border-[#e4ded2] p-5; }.dialog > header p { @apply text-xs text-[#7b847d]; }.dialog > header h2 { @apply text-xl font-black; }.dialog > footer { @apply flex justify-end gap-2 border-t border-[#e4ded2] p-4; }.close { @apply grid h-9 w-9 place-items-center rounded-full border border-[#ded8cc] bg-white; }.close :deep(svg) { @apply h-4 w-4; }.reason { @apply rounded-full border border-[#ded8cc] bg-white px-3 py-2 text-xs font-bold; }
.toast { @apply fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#234c39] px-5 py-3 text-sm font-bold text-white shadow-xl; }.toast :deep(svg) { @apply h-4 w-4; }.toast-enter-active,.toast-leave-active { transition: .2s; }.toast-enter-from,.toast-leave-to { opacity: 0; transform: translate(-50%,8px); }
</style>

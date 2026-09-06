<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileImage,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from 'lucide-vue-next'
import { useRepairTickets, type NewRepairTicket, type RepairStatus, type RepairUrgency } from '@/src/composables/useRepairTickets'

const { tickets, createTicket, updateTicket } = useRepairTickets()
const tenantTickets = computed(() => tickets.value.filter((item) => item.tenant === '王小明'))
const selectedId = ref(tenantTickets.value[0]?.id ?? '')
const selected = computed(() => tenantTickets.value.find((item) => item.id === selectedId.value) ?? tenantTickets.value[0])
const createOpen = ref(false)
const summaryOpen = ref(false)
const toast = ref('')
const formError = ref('')
const tomorrow = new Date()
const today = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
const minimumRepairDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-')
const repairDate = ref([
  tomorrow.getFullYear(),
  String(tomorrow.getMonth() + 1).padStart(2, '0'),
  String(tomorrow.getDate()).padStart(2, '0'),
].join('-'))
const repairStartTime = ref('14:00')
const repairEndTime = ref('18:00')
const timeOptions = Array.from({ length: 29 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const minute = String(totalMinutes % 60).padStart(2, '0')
  return `${hour}:${minute}`
})
const startTimeOptions = timeOptions.slice(0, -1)
const endTimeOptions = computed(() => timeOptions.filter((time) => time > repairStartTime.value))
const form = ref<NewRepairTicket>({ location: '浴室', equipment: '水電', description: '', photoNames: [], urgency: 'soon', availableTime: '', accessPermission: 'contact-first', phone: '0912-345-678' })

const statusMeta: Record<RepairStatus, { label: string; cls: string }> = {
  pending: { label: '等待房東確認', cls: 'amber' }, processing: { label: '已安排處理', cls: 'blue' }, inspection: { label: '等待你驗收', cls: 'purple' }, completed: { label: '已完成', cls: 'green' }, canceled: { label: '已取消', cls: 'red' },
}
const urgencyMeta: Record<RepairUrgency, { label: string; title: string; example: string; cls: string }> = {
  emergency: { label: '緊急', title: '可能影響人身或居住安全', example: '漏電、瓦斯味、大量漏水、門鎖故障', cls: 'red' },
  soon: { label: '儘快處理', title: '明顯影響日常使用', example: '無熱水、冷氣故障、馬桶堵塞', cls: 'amber' },
  normal: { label: '一般', title: '尚可正常居住', example: '櫃門鬆脫、燈泡故障、家具刮損', cls: 'green' },
}
const milestones = [
  { status: 'pending', label: '提出問題' }, { status: 'processing', label: '確認與安排' }, { status: 'inspection', label: '完修驗收' }, { status: 'completed', label: '留下紀錄' },
] as const
const stepIndex = computed(() => ({ pending: 0, processing: 1, inspection: 2, completed: 3, canceled: 0 }[selected.value?.status ?? 'pending']))
const money = (value: number | null) => value === null ? '待確認' : `NT$${value.toLocaleString('zh-TW')}`
const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未安排'
const accessLabel = computed(() => selected.value ? ({ present: '僅限我在場時進入', absent: '同意無人在場時進入', 'contact-first': '進入前請先聯絡我' }[selected.value.accessPermission]) : '')
const payerText = computed(() => selected.value?.payer || '待房東確認')
const latestReply = computed(() => selected.value?.timeline.at(-1))

watch(repairStartTime, () => {
  if (endTimeOptions.value.includes(repairEndTime.value)) return
  repairEndTime.value = endTimeOptions.value[Math.min(3, endTimeOptions.value.length - 1)] ?? ''
})

function notify(message: string): void {
  toast.value = message
  window.setTimeout(() => (toast.value = ''), 2600)
}

function handlePhotos(event: Event): void {
  const input = event.target as HTMLInputElement
  form.value.photoNames = Array.from(input.files ?? []).slice(0, 5).map((file) => file.name)
}

function reviewForm(): void {
  formError.value = ''
  if (!form.value.description.trim()) return
  if (!repairDate.value || !repairStartTime.value || !repairEndTime.value) {
    formError.value = '請選擇方便維修的日期、開始時間與結束時間。'
    return
  }
  if (repairEndTime.value <= repairStartTime.value) {
    formError.value = '結束時間必須晚於開始時間。'
    return
  }
  form.value.availableTime = `${repairDate.value} ${repairStartTime.value}–${repairEndTime.value}`
  summaryOpen.value = true
}

function submitRepair(): void {
  const ticket = createTicket(form.value)
  selectedId.value = ticket.id
  summaryOpen.value = false
  createOpen.value = false
  form.value = { location: '浴室', equipment: '水電', description: '', photoNames: [], urgency: 'soon', availableTime: '', accessPermission: 'contact-first', phone: '0912-345-678' }
  formError.value = ''
  notify('報修已送出，房東收到新案件通知')
}

function replySchedule(reply: 'accepted' | 'reschedule' | 'contact-first'): void {
  const labels = { accepted: '時間可以', reschedule: '希望改期', 'contact-first': '需要先聯絡我' }
  updateTicket(selected.value.id, { tenantScheduleReply: reply }, { title: `租客回覆維修安排：${labels[reply]}` })
  notify('已將回覆通知房東')
}

function inspect(result: 'resolved' | 'unresolved' | 'retry'): void {
  const labels = { resolved: '問題已解決', unresolved: '問題尚未解決', retry: '需要再次處理' }
  updateTicket(selected.value.id, { inspectionResult: result, status: result === 'resolved' ? 'completed' : 'processing' }, { title: result === 'resolved' ? '租客驗收通過，案件完成' : `租客驗收回覆：${labels[result]}` })
  notify(result === 'resolved' ? '驗收完成，案件紀錄已保存' : '已通知房東再次處理')
}
</script>

<template>
  <div class="tenant-repair-page min-h-full w-full space-y-5 p-4 text-[#18233d] md:p-6 xl:p-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p class="eyebrow">住家服務</p><h1 class="text-3xl font-black tracking-tight">家具與設備報修</h1><p class="mt-1.5 text-sm text-[#758078]">快速回報問題，隨時確認房東是否已讀、維修時間與費用負擔。</p></div><button class="btn primary" @click="createOpen = true"><Plus />建立報修單</button></header>

    <section class="grid gap-3 sm:grid-cols-3"><article class="metric"><span><Clock3 /></span><div><small>進行中的案件</small><strong>{{ tenantTickets.filter(item => item.status !== 'completed' && item.status !== 'canceled').length }}</strong></div></article><article class="metric"><span><CalendarClock /></span><div><small>下一次維修</small><strong class="text-base">{{ selected?.scheduledAt ? formatDateTime(selected.scheduledAt) : '尚未安排' }}</strong></div></article><article class="metric"><span><ShieldCheck /></span><div><small>費用負擔</small><strong class="text-base">{{ payerText }}</strong></div></article></section>

    <section class="grid items-start gap-5 lg:grid-cols-[minmax(260px,22%)_minmax(0,1fr)]">
      <aside class="panel overflow-hidden"><header class="panel-head"><div><h2>我的報修</h2><p>只會顯示你的租屋案件。</p></div><span>{{ tenantTickets.length }}</span></header><div class="space-y-2 p-3"><button v-for="item in tenantTickets" :key="item.id" class="ticket-card" :class="{ active: selected?.id === item.id }" @click="selectedId = item.id"><div class="flex items-start justify-between gap-2"><b>{{ item.location }}／{{ item.equipment }}</b><span class="badge" :class="statusMeta[item.status].cls">{{ statusMeta[item.status].label }}</span></div><p>{{ item.description }}</p><small>{{ formatDateTime(item.createdAt) }} · {{ item.id }}</small></button><button class="new-card" @click="createOpen = true"><Plus />回報新的問題</button></div></aside>

      <article v-if="selected" class="panel overflow-hidden">
        <header class="panel-head"><div><p>{{ selected.id }}</p><h2>{{ selected.location }}／{{ selected.equipment }}</h2></div><span class="badge" :class="statusMeta[selected.status].cls">{{ statusMeta[selected.status].label }}</span></header>
        <div class="space-y-5 p-4 sm:p-5">
          <section v-if="selected.status !== 'canceled'" class="steps"><div v-for="(item,index) in milestones" :key="item.status" :class="{ done: index <= stepIndex }"><i><Check v-if="index < stepIndex" /><span v-else>{{ index + 1 }}</span></i><b>{{ item.label }}</b></div></section>
          <section v-if="selected.urgency === 'emergency' && selected.status !== 'completed' && selected.status !== 'canceled'" class="danger"><AlertTriangle /><div><b>有立即危險時請先離開現場</b><p>若有火災、瓦斯外洩、嚴重漏電或人身危險，請先聯絡 119、相關公用事業或管理單位。線上報修不等於緊急服務已受理。</p></div></section>
          <section v-if="selected.status === 'canceled'" class="danger"><AlertTriangle /><div><b>此案件已取消</b><p>{{ selected.responsibilityNote || '房東已說明此問題不屬於報修範圍。' }}</p></div></section>
          <section class="summary-grid"><div><span><CheckCircle2 />房東是否已讀</span><b>{{ selected.landlordRead ? '房東已讀' : '尚未讀取' }}</b></div><div><span><CalendarClock />預計維修日期</span><b>{{ selected.scheduledAt ? formatDateTime(selected.scheduledAt) : '房東尚未安排' }}</b></div><div><span><UserRound />維修人員</span><b>{{ selected.vendorName || '尚未提供' }}<small v-if="selected.vendorPhone">{{ selected.vendorPhone }}</small></b></div><div><span><ShieldCheck />費用由誰負擔</span><b>{{ selected.payer || '待確認' }}<small>預估 {{ money(selected.estimatedCost) }}</small></b></div></section>
          <section v-if="latestReply" class="latest"><MessageCircle /><div><span>最新回覆 · {{ formatDateTime(latestReply.at) }}</span><b>{{ latestReply.title }}</b><p v-if="latestReply.detail">{{ latestReply.detail }}</p></div></section>
          <section class="soft"><h3>報修內容</h3><dl><div><dt>租屋地址</dt><dd>{{ selected.address }}／{{ selected.room }}</dd></div><div><dt>問題描述</dt><dd>{{ selected.description }}</dd></div><div><dt>方便時段</dt><dd>{{ selected.availableTime }}</dd></div><div><dt>進場同意</dt><dd>{{ accessLabel }}</dd></div></dl><div class="mt-3 flex flex-wrap gap-2"><span v-for="name in selected.photoNames" :key="name" class="file"><FileImage />{{ name }}</span></div></section>
          <section v-if="selected.scheduledAt && selected.status === 'processing'" class="response"><h3>確認維修時間</h3><p>{{ formatDateTime(selected.scheduledAt) }} · {{ selected.vendorName }}</p><div class="grid gap-2 sm:grid-cols-3"><button :class="{ chosen: selected.tenantScheduleReply === 'accepted' }" @click="replySchedule('accepted')">時間可以</button><button :class="{ chosen: selected.tenantScheduleReply === 'reschedule' }" @click="replySchedule('reschedule')">希望改期</button><button :class="{ chosen: selected.tenantScheduleReply === 'contact-first' }" @click="replySchedule('contact-first')">需要先聯絡我</button></div></section>
          <section v-if="selected.status === 'inspection'" class="inspection"><h3>維修完成，請協助驗收</h3><p>請確認原本問題是否解決；你也可以在再次處理時補充說明與完修照片。</p><div class="grid gap-2 sm:grid-cols-3"><button @click="inspect('resolved')"><CheckCircle2 />問題已解決</button><button @click="inspect('unresolved')"><X />問題尚未解決</button><button @click="inspect('retry')"><Wrench />需要再次處理</button></div></section>
          <section class="soft"><h3>完整時間軸</h3><div class="timeline"><div v-for="item in [...selected.timeline].reverse()" :key="item.id"><i /><p><b>{{ item.title }}</b><span>{{ formatDateTime(item.at) }}</span></p><small v-if="item.detail">{{ item.detail }}</small></div></div></section>
        </div>
      </article>
    </section>

    <Transition name="toast"><div v-if="toast" class="toast"><Check />{{ toast }}</div></Transition>

    <Teleport to="body">
      <div v-if="createOpen" class="backdrop" @click.self="createOpen = false"><form class="repair-form" @submit.prevent="reviewForm"><header><div><p>約 2 分鐘完成</p><h2>建立報修單</h2></div><button type="button" class="close" @click="createOpen = false"><X /></button></header><div class="form-scroll">
        <section class="address"><Home /><div><span>租屋地址（系統自動帶入）</span><b>臺北市中山區松江路 88 號／101</b></div></section>
        <div class="form-grid"><label>報修位置<select v-model="form.location"><option v-for="value in ['客廳','臥室','浴室','廚房','陽台','公共區域']" :key="value">{{ value }}</option></select></label><label>設備項目<select v-model="form.equipment"><option v-for="value in ['冷氣','冰箱','洗衣機','熱水器','水電','家具','門窗','其他']" :key="value">{{ value }}</option></select></label><label class="full">問題描述<textarea v-model="form.description" required placeholder="請描述發生的情況、開始時間與是否仍可使用" /></label><label class="full">問題照片（最多 5 張）<span class="upload"><Camera />選擇照片<input class="hidden" type="file" accept="image/*" multiple @change="handlePhotos" /></span><small v-if="form.photoNames.length">已選擇：{{ form.photoNames.join('、') }}</small></label></div>
        <fieldset><legend>緊急程度</legend><div class="urgency-grid"><button v-for="(meta,value) in urgencyMeta" :key="value" type="button" :class="[meta.cls,{selected:form.urgency === value}]" @click="form.urgency = value"><b>{{ meta.label }}</b><span>{{ meta.title }}</span><small>{{ meta.example }}</small></button></div><div v-if="form.urgency === 'emergency'" class="danger mt-3"><AlertTriangle /><div><b>線上報修不是緊急服務</b><p>有火災、瓦斯外洩、嚴重漏電或人身危險時，請先離開現場並聯絡 119、相關公用事業或管理單位。</p></div></div></fieldset>
        <div class="form-grid"><div class="full"><span class="field-title">方便維修時段</span><div class="time-grid"><label>日期<input v-model="repairDate" :min="minimumRepairDate" required type="date" /></label><label>開始時間<select v-model="repairStartTime" required><option v-for="time in startTimeOptions" :key="`start-${time}`" :value="time">{{ time }}</option></select></label><label>結束時間<select v-model="repairEndTime" required><option v-for="time in endTimeOptions" :key="`end-${time}`" :value="time">{{ time }}</option></select></label></div><small class="field-help">請選擇可讓房東或維修人員聯繫、到場的完整時段。</small><p v-if="formError" class="form-error"><AlertTriangle />{{ formError }}</p></div><label class="full">房東或師傅進入方式<select v-model="form.accessPermission"><option value="present">僅限我在場時進入</option><option value="absent">同意無人在場時進入</option><option value="contact-first">進入前請先聯絡我</option></select><small>房東不會因你提出報修而自動取得自由進入房屋的權利。</small></label><label class="full">聯絡電話（可修改）<input v-model="form.phone" required type="tel" /></label></div>
      </div><footer><button type="button" class="btn secondary" @click="createOpen = false">取消</button><button class="btn primary">檢查報修摘要<ChevronRight /></button></footer></form></div>

      <div v-if="summaryOpen" class="backdrop summary-layer"><section class="summary-dialog"><header><button class="back" @click="summaryOpen = false"><ArrowLeft />返回修改</button><h2>送出前確認</h2><button class="close" @click="summaryOpen = false; createOpen = false"><X /></button></header><div class="space-y-3 p-5"><p class="text-sm text-[#6e7870]">請確認報修的房間與設備，送出後仍可在房東處理前補充資料。</p><dl><div><dt>租屋處</dt><dd>松江路 88 號／101</dd></div><div><dt>報修項目</dt><dd>{{ form.location }}／{{ form.equipment }}</dd></div><div><dt>緊急程度</dt><dd>{{ urgencyMeta[form.urgency].label }}</dd></div><div><dt>問題描述</dt><dd>{{ form.description }}</dd></div><div><dt>方便時段</dt><dd>{{ form.availableTime }}</dd></div><div><dt>進入方式</dt><dd>{{ {present:'僅限我在場時進入',absent:'同意無人在場時進入','contact-first':'進入前請先聯絡我'}[form.accessPermission] }}</dd></div><div><dt>照片</dt><dd>{{ form.photoNames.length ? `${form.photoNames.length} 張` : '未上傳' }}</dd></div></dl><button class="btn primary w-full" @click="submitRepair"><Check />確認送出報修</button></div></section></div>
    </Teleport>
  </div>
</template>

<style scoped>
@reference "../index.css";
.eyebrow { @apply mb-1 text-xs font-black uppercase tracking-[.2em] text-[#315fc4]; }.panel { @apply rounded-[1.5rem] border border-[#d9e1f0] bg-white shadow-[0_10px_28px_rgba(37,70,135,.06)]; }.panel-head { @apply flex items-center justify-between border-b border-[#e1e7f1] p-4; }.panel-head h2 { @apply text-lg font-black; }.panel-head p { @apply mt-1 text-xs text-[#66748a]; }.panel-head > span:not(.badge) { @apply rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-bold text-[#315fc4]; }
.btn { @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm disabled:opacity-50; }.btn :deep(svg) { @apply h-4 w-4; }.btn.primary { @apply bg-[#315fc4] text-white hover:bg-[#244fae]; }.btn.secondary { @apply border border-[#d7deeb] bg-white; }.metric { @apply flex items-center gap-3 rounded-2xl border border-[#d9e1f0] bg-white p-4; }.metric > span { @apply grid h-10 w-10 place-items-center rounded-full bg-[#edf4ff] text-[#315fc4]; }.metric > span :deep(svg) { @apply h-4 w-4; }.metric small { @apply block text-xs text-[#66748a]; }.metric strong { @apply mt-1 block text-xl font-black; }
.ticket-card { @apply block w-full rounded-2xl border border-[#dfe5ef] p-4 text-left transition; }.ticket-card.active { @apply border-[#98b4ec] bg-[#eef5ff] shadow-[inset_3px_0_0_#315fc4]; }.ticket-card p { @apply mt-2 line-clamp-2 text-xs leading-5 text-[#5f6e85]; }.ticket-card small { @apply mt-2 block text-[10px] text-[#748196]; }.new-card { @apply flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#9db5e4] py-4 text-sm font-bold text-[#315fc4]; }.new-card :deep(svg) { @apply h-4 w-4; }
.badge { @apply inline-flex shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold; }.badge.green { @apply border-[#c8d8f5] bg-[#edf4ff] text-[#315fc4]; }.badge.amber { @apply border-[#ecd4ae] bg-[#fff1dd] text-[#a56c21]; }.badge.blue { @apply border-[#c8d8f5] bg-[#edf4ff] text-[#315fc4]; }.badge.purple { @apply border-[#ddd0ea] bg-[#f0e9f7] text-[#76569a]; }.badge.red { @apply border-[#edc9c3] bg-[#fbe9e6] text-[#8f3f36]; }
.steps { @apply grid grid-cols-4; }.steps > div { @apply relative flex flex-col items-center gap-2 text-center text-[10px] text-[#7b8798]; }.steps > div::before { content:''; @apply absolute left-0 right-1/2 top-4 h-px bg-[#d9e1ee]; }.steps > div::after { content:''; @apply absolute left-1/2 right-0 top-4 h-px bg-[#d9e1ee]; }.steps > div:first-child::before,.steps > div:last-child::after { @apply hidden; }.steps i { @apply relative z-10 grid h-8 w-8 place-items-center rounded-full border border-[#d6deeb] bg-white text-xs font-bold not-italic; }.steps i :deep(svg) { @apply h-4 w-4; }.steps .done { @apply font-bold text-[#315fc4]; }.steps .done i { @apply border-[#315fc4] bg-[#315fc4] text-white; }.steps .done::before,.steps .done::after { @apply bg-[#7397e0]; }
.danger { @apply flex gap-3 rounded-2xl border border-[#edc2ba] bg-[#fff0ed] p-4 text-[#8f443b]; }.danger > svg { @apply h-5 w-5 shrink-0; }.danger p { @apply mt-1 text-xs leading-5; }.summary-grid { @apply grid gap-3 sm:grid-cols-2; }.summary-grid > div { @apply rounded-2xl border border-[#dfe5ef] bg-[#f8faff] p-4; }.summary-grid span { @apply flex items-center gap-1 text-xs text-[#68768b]; }.summary-grid span :deep(svg) { @apply h-3.5 w-3.5; }.summary-grid b { @apply mt-2 block; }.summary-grid small { @apply mt-1 block text-xs font-normal text-[#68768b]; }.latest { @apply flex gap-3 rounded-2xl bg-[#edf4ff] p-4 text-[#244d9b]; }.latest > svg { @apply h-5 w-5 shrink-0; }.latest span { @apply block text-[10px]; }.latest b { @apply mt-1 block text-sm; }.latest p { @apply mt-1 text-xs; }
.soft,.response,.inspection { @apply rounded-2xl border border-[#dfe5ef] bg-[#f8faff] p-4; }.soft h3,.response h3,.inspection h3 { @apply font-black; }.soft dl,.summary-dialog dl { @apply mt-3 space-y-2; }.soft dl div,.summary-dialog dl div { @apply grid grid-cols-[100px_1fr] gap-3 text-sm; }.soft dt,.summary-dialog dt { @apply text-[#68768b]; }.soft dd,.summary-dialog dd { @apply font-semibold; }.file { @apply inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-bold; }.file :deep(svg) { @apply h-3.5 w-3.5; }.response > p,.inspection > p { @apply mt-1 text-xs leading-5 text-[#657389]; }.response > div,.inspection > div { @apply mt-3; }.response button,.inspection button { @apply flex items-center justify-center gap-1 rounded-xl border border-[#d7deeb] bg-white px-3 py-2.5 text-xs font-bold; }.response button.chosen { @apply border-[#315fc4] bg-[#315fc4] text-white; }.inspection button :deep(svg) { @apply h-4 w-4; }
.timeline { @apply mt-3; }.timeline > div { @apply relative ml-1 border-l border-[#cbd9f3] pb-4 pl-4; }.timeline i { @apply absolute -left-1 top-1 h-2 w-2 rounded-full bg-[#315fc4]; }.timeline p { @apply flex justify-between gap-2 text-xs; }.timeline p span { @apply shrink-0 text-[#748196]; }.timeline small { @apply mt-1 block text-xs leading-5 text-[#657389]; }
.backdrop { @apply fixed inset-0 z-50 grid place-items-center bg-[#17213a]/45 p-3 backdrop-blur-sm; }.summary-layer { @apply z-[60]; }.repair-form,.summary-dialog { @apply flex w-full flex-col overflow-hidden rounded-[1.25rem] border border-[#d9e1ef] bg-white shadow-2xl; }.repair-form { @apply max-h-[calc(100dvh-48px)] max-w-xl; }.summary-dialog { @apply max-h-[calc(100dvh-48px)] max-w-lg; }.repair-form > header,.summary-dialog > header { @apply flex items-center justify-between border-b border-[#e1e7f1] px-4 py-3; }.repair-form header p { @apply text-xs text-[#748196]; }.repair-form header h2,.summary-dialog header h2 { @apply text-xl font-black; }.close { @apply grid h-9 w-9 place-items-center rounded-full border border-[#d7deeb] bg-white; }.close :deep(svg) { @apply h-4 w-4; }.form-scroll { @apply space-y-3 overflow-y-auto p-4; }.repair-form > footer { @apply flex justify-end gap-2 border-t border-[#e1e7f1] px-4 py-3; }.address { @apply flex gap-3 rounded-2xl bg-[#edf4ff] p-3; }.address > svg { @apply h-5 w-5 shrink-0 text-[#315fc4]; }.address span { @apply block text-xs text-[#60708a]; }.address b { @apply mt-1 block text-sm; }
.form-grid { @apply grid gap-3 sm:grid-cols-2; }.form-grid .full { @apply sm:col-span-2; }.form-grid label,fieldset legend,.field-title { @apply text-sm font-bold; }.form-grid input,.form-grid select,.form-grid textarea { @apply mt-1.5 w-full rounded-xl border border-[#d7deeb] bg-white px-3 py-2.5 font-normal outline-none focus:border-[#7294dc] focus:ring-4 focus:ring-[#dfe9ff]; }.form-grid textarea { @apply min-h-20; }.form-grid small,.field-help { @apply mt-1 block text-xs font-normal leading-5 text-[#68768b]; }.time-grid { @apply mt-1.5 grid grid-cols-[1.3fr_1fr_1fr] gap-2; }.time-grid label { @apply text-xs text-[#5f6e85]; }.form-error { @apply mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#9a4138]; }.form-error :deep(svg) { @apply h-4 w-4; }.upload { @apply mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#9db5e4] bg-[#f6f9ff] py-3 text-[#315fc4]; }.upload :deep(svg) { @apply h-4 w-4; } fieldset { @apply rounded-2xl border border-[#dfe5ef] p-3; } fieldset legend { @apply px-1; }.urgency-grid { @apply grid gap-2 sm:grid-cols-3; }.urgency-grid button { @apply rounded-xl border border-[#dfe5ef] p-3 text-left opacity-70; }.urgency-grid button.selected { @apply opacity-100 ring-2 ring-[#315fc4]; }.urgency-grid button.red.selected { @apply ring-[#b9564a]; }.urgency-grid button.amber.selected { @apply ring-[#bc7d23]; }.urgency-grid b,.urgency-grid span,.urgency-grid small { @apply block; }.urgency-grid span { @apply mt-1 text-xs; }.urgency-grid small { @apply mt-2 text-[10px] leading-4 text-[#6f7c90]; }
.summary-dialog .back { @apply inline-flex items-center gap-1 text-xs font-bold text-[#315fc4]; }.summary-dialog .back :deep(svg) { @apply h-4 w-4; }.toast { @apply fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1f469d] px-5 py-3 text-sm font-bold text-white shadow-xl; }.toast :deep(svg) { @apply h-4 w-4; }.toast-enter-active,.toast-leave-active { transition:.2s; }.toast-enter-from,.toast-leave-to { opacity:0; transform:translate(-50%,8px); }
@media (max-width: 639px) { .repair-form,.summary-dialog { @apply max-h-[calc(100dvh-8px)] rounded-[1.25rem]; }.repair-form > footer { padding-bottom:max(1rem,env(safe-area-inset-bottom)); }.steps b { @apply max-w-14; }.soft dl div,.summary-dialog dl div { @apply grid-cols-1 gap-0; }.time-grid { @apply grid-cols-1; } }
</style>

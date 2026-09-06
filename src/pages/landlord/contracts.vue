<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  Check, ChevronLeft, ChevronRight, Download, EllipsisVertical, FileCheck2, FilePlus2,
  FileSearch, FileText, Home, Paperclip, RefreshCw, Search, Upload, UserRound, X,
} from 'lucide-vue-next'
import ContractOcrImport from '@/src/components/landlord/ContractOcrImport.vue'
import type { ContractAutofillData } from '@/src/utils/landlord-contract-import'
import { fetchTenants, type LandlordTenant } from '@/src/services/landlordTenantApi'
import {
  CONTRACTS_UPDATED_EVENT,
  findContractImportMetadata,
  saveContractImportMetadata,
} from '@/src/utils/landlord-contract-sync'

type ContractState = 'active' | 'expiring' | 'expired' | 'archived'
interface ContractRow {
  tenantId: number | null; leaseId: number | null
  id: string; tenant: string; phone: string; nationalId: string; contactAddress: string
  initials: string; property: string; propertyAddress: string; room: string
  start: string; end: string; rent: number; deposit: number; paymentDay: number
  paymentFrequency: 'monthly' | 'bimonthly' | 'quarterly'; state: ContractState
  attachmentNames: string[]; createdAt: string
}

const contracts = ref<ContractRow[]>([
  { tenantId: null, leaseId: null, id: 'CT-2026-001', tenant: '王曉明', phone: '0912-345-678', nationalId: 'A123456789', contactAddress: '新北市板橋區文化路一段 10 號', initials: '王', property: '101', propertyAddress: '臺北市中山區松江路 88 號', room: '1A', start: '2026-09-01', end: '2027-09-01', rent: 10000, deposit: 2000, paymentDay: 5, paymentFrequency: 'monthly', state: 'active', attachmentNames: [], createdAt: '2026-08-12' },
  { tenantId: null, leaseId: null, id: 'CT-2026-002', tenant: '莊育翔', phone: '0988-201-589', nationalId: 'F123456789', contactAddress: '臺北市信義區松仁路 30 號', initials: '莊', property: '101', propertyAddress: '臺北市中山區松江路 88 號', room: '1A-01', start: '2026-08-01', end: '2027-08-01', rent: 9500, deposit: 2000, paymentDay: 10, paymentFrequency: 'monthly', state: 'active', attachmentNames: [], createdAt: '2026-08-01' },
  { tenantId: null, leaseId: null, id: 'CT-2026-003', tenant: '小白', phone: '0933-221-879', nationalId: '', contactAddress: '', initials: '小', property: '我的出租物件', propertyAddress: '臺北市中山區松江路 88 號', room: '202', start: '2026-05-04', end: '2026-09-24', rent: 17000, deposit: 34000, paymentDay: 5, paymentFrequency: 'monthly', state: 'expiring', attachmentNames: ['住宅租賃契約.pdf'], createdAt: '2026-05-01' },
  { tenantId: null, leaseId: null, id: 'CT-2026-004', tenant: '大王', phone: '0922-810-510', nationalId: '', contactAddress: '', initials: '大', property: '第二棟', propertyAddress: '臺北市大安區復興南路 120 號', room: '203', start: '2025-08-01', end: '2026-07-31', rent: 15000, deposit: 30000, paymentDay: 8, paymentFrequency: 'monthly', state: 'expired', attachmentNames: ['舊租約.pdf'], createdAt: '2025-07-28' },
])

const activeTab = ref<'all' | 'expiring' | 'expired' | 'missing' | 'uploaded' | 'archived'>('all')
const keyword = ref(''); const propertyFilter = ref('all'); const stateFilter = ref('all'); const attachmentFilter = ref('all')
const selectedId = ref(contracts.value[1].id); const formOpen = ref(false); const uploadOpen = ref(false)
const showCreateOcr = ref(false); const formMode = ref<'create' | 'edit' | 'renew'>('create'); const toast = ref('')
const uploadedAttachmentName = ref('')
const syncing = ref(false)
const usingSharedData = ref(false)
const form = reactive({ id: '', tenant: '', phone: '', nationalId: '', contactAddress: '', property: '101', propertyAddress: '', room: '', start: '2026-09-01', end: '2027-09-01', rent: 0, deposit: 0, paymentDay: 5, paymentFrequency: 'monthly' as ContractRow['paymentFrequency'], attachmentName: '' })

const selected = computed(() => contracts.value.find((item) => item.id === selectedId.value) ?? contracts.value[0])
const activeCount = computed(() => contracts.value.filter((item) => item.state === 'active' || item.state === 'expiring').length)
const expiringCount = computed(() => contracts.value.filter((item) => item.state === 'expiring').length)
const expiredCount = computed(() => contracts.value.filter((item) => item.state === 'expired').length)
const missingCount = computed(() => contracts.value.filter((item) => !item.attachmentNames.length).length)
const uploadedCount = computed(() => contracts.value.filter((item) => item.attachmentNames.length).length)
const completeness = computed(() => Math.round((uploadedCount.value / Math.max(1, contracts.value.length)) * 100))
const needsAttention = computed(() => contracts.value.filter((item) => item.state === 'expiring' || item.state === 'expired' || !item.attachmentNames.length).length)
const tabs = computed(() => [
  { value: 'all' as const, label: '全部', count: contracts.value.length }, { value: 'expiring' as const, label: '即將到期', count: expiringCount.value },
  { value: 'expired' as const, label: '已逾期', count: expiredCount.value }, { value: 'missing' as const, label: '缺附件', count: missingCount.value },
  { value: 'uploaded' as const, label: '已上傳', count: uploadedCount.value }, { value: 'archived' as const, label: '已封存', count: contracts.value.filter((item) => item.state === 'archived').length },
])
const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return contracts.value.filter((item) => {
    const tabMatch = activeTab.value === 'all' || item.state === activeTab.value || (activeTab.value === 'missing' && !item.attachmentNames.length) || (activeTab.value === 'uploaded' && item.attachmentNames.length > 0)
    return tabMatch && (propertyFilter.value === 'all' || item.property === propertyFilter.value) && (stateFilter.value === 'all' || item.state === stateFilter.value) && (attachmentFilter.value === 'all' || (attachmentFilter.value === 'missing' ? !item.attachmentNames.length : item.attachmentNames.length > 0)) && (!query || `${item.tenant} ${item.property} ${item.room} ${item.id}`.toLowerCase().includes(query))
  })
})
const stateMeta: Record<ContractState, { label: string; cls: string }> = { active: { label: '正常', cls: 'green' }, expiring: { label: '即將到期', cls: 'amber' }, expired: { label: '已逾期', cls: 'red' }, archived: { label: '已封存', cls: 'neutral' } }
const frequencyLabel = { monthly: '月繳', bimonthly: '每 2 個月', quarterly: '季繳' }
const money = (value: number) => `NT$${value.toLocaleString('zh-TW')}`
const displayDate = (value: string) => value.replaceAll('-', '/')
function contractStateFromTenant(status: LandlordTenant['lease_status']): ContractState {
  if (status === 'expiring') return 'expiring'
  if (status === 'expired') return 'expired'
  if (status === 'moved_out') return 'archived'
  return 'active'
}
function contractFromTenant(tenant: LandlordTenant): ContractRow | null {
  if (!tenant.lease_start || !tenant.lease_end) return null
  const metadata = findContractImportMetadata(tenant.id, tenant.lease_id)
  const frequency = ['monthly', 'bimonthly', 'quarterly'].includes(tenant.payment_frequency ?? '')
    ? tenant.payment_frequency as ContractRow['paymentFrequency']
    : 'monthly'
  return {
    tenantId: tenant.id,
    leaseId: tenant.lease_id,
    id: tenant.contract_id || `LEASE-${tenant.lease_id ?? tenant.id}`,
    tenant: tenant.name,
    phone: tenant.phone,
    nationalId: tenant.national_id_masked ?? '',
    contactAddress: tenant.contact_address ?? '',
    initials: tenant.name.slice(0, 1),
    property: tenant.property_name ?? '尚未指定',
    propertyAddress: '',
    room: tenant.room_number ?? '—',
    start: tenant.lease_start,
    end: tenant.lease_end,
    rent: tenant.monthly_rent,
    deposit: tenant.deposit_amount,
    paymentDay: tenant.payment_day ?? 5,
    paymentFrequency: frequency,
    state: contractStateFromTenant(tenant.lease_status),
    attachmentNames: metadata?.sourceFileName ? [metadata.sourceFileName] : [],
    createdAt: tenant.created_at.slice(0, 10),
  }
}
async function loadSharedContracts() {
  syncing.value = true
  try {
    const params = new URLSearchParams({ quick_filter: 'all', status: 'all', page: '1', page_size: '100' })
    const response = await fetchTenants(params)
    const synced = response.items.map(contractFromTenant).filter((item): item is ContractRow => item !== null)
    if (synced.length) {
      contracts.value = synced
      usingSharedData.value = true
      if (!synced.some((item) => item.id === selectedId.value)) selectedId.value = synced[0].id
    }
  } catch {
    // 未連上後端時保留頁面展示資料；租客管理本身也會顯示連線錯誤。
  } finally {
    syncing.value = false
  }
}
function handleContractsUpdated() { void loadSharedContracts() }
function notify(message: string) { toast.value = message; window.setTimeout(() => (toast.value = ''), 2600) }
function resetForm() { Object.assign(form, { id: '', tenant: '', phone: '', nationalId: '', contactAddress: '', property: '101', propertyAddress: '', room: '', start: '2026-09-01', end: '2027-09-01', rent: 0, deposit: 0, paymentDay: 5, paymentFrequency: 'monthly', attachmentName: '' }); uploadedAttachmentName.value = ''; showCreateOcr.value = false }
function openCreate() { resetForm(); formMode.value = 'create'; formOpen.value = true }
function addOneYear(value: string) { const date = new Date(`${value}T00:00:00`); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10) }
function openEdit(mode: 'edit' | 'renew' = 'edit') {
  const item = selected.value
  Object.assign(form, { id: item.id, tenant: item.tenant, phone: item.phone, nationalId: item.nationalId, contactAddress: item.contactAddress, property: item.property, propertyAddress: item.propertyAddress, room: item.room, start: mode === 'renew' ? item.end : item.start, end: mode === 'renew' ? addOneYear(item.end) : item.end, rent: item.rent, deposit: item.deposit, paymentDay: item.paymentDay, paymentFrequency: item.paymentFrequency, attachmentName: '' })
  uploadedAttachmentName.value = ''; showCreateOcr.value = false; formMode.value = mode; formOpen.value = true
}
function applyOcr(data: ContractAutofillData, fromUploadDialog = false) {
  if (fromUploadDialog) resetForm()
  Object.assign(form, { tenant: data.tenantName || form.tenant, phone: data.tenantPhone || form.phone, nationalId: data.tenantNationalId || form.nationalId, contactAddress: data.tenantAddress || form.contactAddress, propertyAddress: data.propertyAddress || form.propertyAddress, room: data.roomNumber || form.room, start: data.leaseStart || form.start, end: data.leaseEnd || form.end, rent: data.monthlyRent || form.rent, deposit: data.depositAmount || form.deposit, paymentDay: data.paymentDay || form.paymentDay, paymentFrequency: data.paymentFrequency, attachmentName: data.sourceFileName })
  uploadedAttachmentName.value = data.sourceFileName
  if (fromUploadDialog) { formMode.value = 'create'; uploadOpen.value = false; formOpen.value = true }
  notify(`AI 已帶入 ${data.fields.length} 個欄位，請確認後儲存`)
}
function onAttachment(event: Event) { const input = event.target as HTMLInputElement; uploadedAttachmentName.value = input.files?.[0]?.name ?? ''; form.attachmentName = uploadedAttachmentName.value }
function saveContract() {
  if (!form.tenant.trim() || !form.room.trim() || !form.start || !form.end) return
  if (formMode.value === 'edit') {
    Object.assign(selected.value, { tenant: form.tenant.trim(), phone: form.phone, nationalId: form.nationalId, contactAddress: form.contactAddress, property: form.property, propertyAddress: form.propertyAddress, room: form.room, start: form.start, end: form.end, rent: form.rent, deposit: form.deposit, paymentDay: form.paymentDay, paymentFrequency: form.paymentFrequency })
    if (form.attachmentName && !selected.value.attachmentNames.includes(form.attachmentName)) selected.value.attachmentNames.push(form.attachmentName)
    notify('現行合約資料已更新')
  } else {
    const id = `CT-${new Date().getFullYear()}-${String(contracts.value.length + 1).padStart(3, '0')}`
    contracts.value.unshift({ tenantId: null, leaseId: null, id, tenant: form.tenant.trim(), phone: form.phone, nationalId: form.nationalId, contactAddress: form.contactAddress, initials: form.tenant.trim().slice(0, 1), property: form.property, propertyAddress: form.propertyAddress, room: form.room, start: form.start, end: form.end, rent: form.rent, deposit: form.deposit, paymentDay: form.paymentDay, paymentFrequency: form.paymentFrequency, state: 'active', attachmentNames: form.attachmentName ? [form.attachmentName] : [], createdAt: new Date().toISOString().slice(0, 10) })
    selectedId.value = id; notify(formMode.value === 'renew' ? '新一期續約已建立，原合約仍保留' : '合約與租客資訊已一併建立')
  }
  formOpen.value = false
}
function attachToSelected(event: Event) { const input = event.target as HTMLInputElement; const name = input.files?.[0]?.name; if (!name) return; if (!selected.value.attachmentNames.includes(name)) selected.value.attachmentNames.push(name); if (selected.value.tenantId) saveContractImportMetadata({ tenantId: selected.value.tenantId, leaseId: selected.value.leaseId, contractId: selected.value.id, sourceFileName: name, importedByOcr: false, importedAt: new Date().toISOString() }); input.value = ''; notify('合約附件已上傳') }
function clearFilters() { activeTab.value = 'all'; keyword.value = ''; propertyFilter.value = 'all'; stateFilter.value = 'all'; attachmentFilter.value = 'all' }
function exportContracts() { const rows = [['合約編號','租客','房屋','房號','起租日','到期日','月租','押金','繳租日','狀態'], ...contracts.value.map((item) => [item.id,item.tenant,item.property,item.room,item.start,item.end,item.rent,item.deposit,item.paymentDay,stateMeta[item.state].label])]; const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'RentMate-合約清單.csv'; link.click(); URL.revokeObjectURL(url) }
onMounted(() => {
  void loadSharedContracts()
  window.addEventListener(CONTRACTS_UPDATED_EVENT, handleContractsUpdated)
  window.addEventListener('storage', handleContractsUpdated)
})
onBeforeUnmount(() => {
  window.removeEventListener(CONTRACTS_UPDATED_EVENT, handleContractsUpdated)
  window.removeEventListener('storage', handleContractsUpdated)
})
</script>

<template>
  <div class="mx-auto max-w-[1640px] space-y-4">
    <header class="page-header"><div><h1>合約管理</h1><p>集中管理租約、附件、到期提醒與續約進度，快速掌握每份合約狀態。</p><span class="sync-note"><RefreshCw :class="{ 'animate-spin': syncing }" />{{ syncing ? '正在同步租客租約…' : usingSharedData ? '已與租客管理資料同步' : '目前顯示展示資料' }}</span></div><div class="actions"><button class="btn secondary" @click="exportContracts"><Download />匯出合約</button><button class="btn secondary" @click="uploadOpen = true"><Upload />上傳合約</button><button class="btn primary" @click="openCreate"><FilePlus2 />新增合約</button></div></header>
    <section class="overview panel"><div class="attention"><span><FileText /></span><div><h2>目前有 {{ needsAttention }} 份合約需要處理</h2><p>{{ missingCount }} 份缺少附件，{{ expiringCount + expiredCount }} 份需要追蹤期限。</p></div></div><div class="overview-stat"><span>管理中</span><b>{{ activeCount }}<small> 份</small></b></div><div class="overview-stat"><span>30 天內到期</span><b>{{ expiringCount }}<small> 份</small></b></div><div class="overview-stat amber"><span>缺附件</span><b>{{ missingCount }}<small> 份</small></b></div><div class="overview-stat"><span>已逾期</span><b>{{ expiredCount }}<small> 份</small></b></div><div class="completion"><div><span>附件完整度</span><small>{{ uploadedCount }}/{{ contracts.length }} 份完整</small></div><b>{{ completeness }}%</b><div class="bar"><i :style="{width:`${completeness}%`}" /></div></div></section>
    <section class="workspace panel">
      <div class="toolbar"><div class="tabs"><button v-for="item in tabs" :key="item.value" :class="{active:activeTab === item.value}" @click="activeTab = item.value">{{ item.label }} <b>{{ item.count }}</b></button></div><div class="filters"><label class="search"><Search /><input v-model="keyword" placeholder="搜尋租客、房號、合約編號" /></label><select v-model="propertyFilter"><option value="all">全部棟別</option><option v-for="name in [...new Set(contracts.map(item => item.property))]" :key="name">{{ name }}</option></select><select v-model="stateFilter"><option value="all">全部狀態</option><option value="active">正常</option><option value="expiring">即將到期</option><option value="expired">已逾期</option></select><select v-model="attachmentFilter"><option value="all">附件狀態</option><option value="uploaded">已上傳</option><option value="missing">缺附件</option></select><button class="clear" @click="clearFilters"><X />清除篩選</button></div></div>
      <div class="work-grid">
        <div class="directory"><header><h2>合約名冊</h2><span>{{ filtered.length }} 筆</span></header><div class="table-wrap"><table><thead><tr><th>合約</th><th>租期</th><th>金額</th><th>到期</th><th>附件</th><th>狀態</th><th>操作</th></tr></thead><tbody><tr v-for="item in filtered" :key="item.id" :class="{selected:item.id === selectedId}" @click="selectedId = item.id"><td><div class="tenant"><span>{{ item.initials }}</span><div><b>{{ item.tenant }}</b><small>{{ item.property }}／{{ item.room }}</small></div></div></td><td><b>{{ displayDate(item.start) }} - {{ displayDate(item.end) }}</b></td><td><b>{{ money(item.rent) }}</b><small>押金 {{ money(item.deposit) }}</small></td><td><span class="badge" :class="stateMeta[item.state].cls">{{ stateMeta[item.state].label }}</span></td><td><span class="badge" :class="item.attachmentNames.length ? 'green' : 'amber'"><Paperclip />{{ item.attachmentNames.length ? `${item.attachmentNames.length} 個附件` : '缺附件' }}</span></td><td><span class="badge green">有效</span></td><td><button class="more" aria-label="更多操作" @click.stop="selectedId = item.id; openEdit()"><EllipsisVertical /></button></td></tr><tr v-if="!filtered.length"><td colspan="7" class="empty">沒有符合條件的合約。</td></tr></tbody></table></div><footer><span>顯示 1 - {{ filtered.length }} 筆，共 {{ filtered.length }} 筆</span><div><button disabled><ChevronLeft /></button><b>1</b><button disabled><ChevronRight /></button></div></footer></div>
        <aside class="detail"><header><h2>合約檔案</h2><span class="badge green">{{ selected.state === 'expired' ? '待處理' : '正常' }}</span></header><div class="detail-scroll"><section class="profile"><span>{{ selected.initials }}</span><div><h3>{{ selected.tenant }} <em>有效</em></h3><p><Home />{{ selected.property }}／{{ selected.room }}</p></div></section><section class="facts"><div><span>租期</span><b>{{ displayDate(selected.start) }} - {{ displayDate(selected.end) }}</b></div><div><span>月租</span><b>{{ money(selected.rent) }}</b></div><div><span>押金</span><b>{{ money(selected.deposit) }}</b></div><div><span>繳租日</span><b>每月 {{ selected.paymentDay }} 號</b></div><div><span>週期</span><b>{{ frequencyLabel[selected.paymentFrequency] }}</b></div><div><span>附件</span><b>{{ selected.attachmentNames.length ? `${selected.attachmentNames.length} 個` : '缺附件' }}</b></div></section><section class="lifecycle"><h3>合約生命週期</h3><div><i class="done" /><i class="done" /><i class="done" /><i :class="{done:selected.state==='expired'}" /><i /></div><ul><li><b>建立資料</b><small>{{ displayDate(selected.createdAt) }}</small></li><li><b>租約開始</b><small>{{ displayDate(selected.start) }}</small></li><li><b>今天</b><small>目前位置</small></li><li><b>續約窗口</b><small>尚未進入</small></li><li><b>合約到期</b><small>{{ displayDate(selected.end) }}</small></li></ul></section><section class="attachments"><h3>附件狀態</h3><p v-if="!selected.attachmentNames.length"><Paperclip />合約主檔 <b>缺附件</b></p><p v-for="name in selected.attachmentNames" v-else :key="name"><FileCheck2 />{{ name }} <b>已上傳</b></p></section></div><footer><button class="renew" @click="openEdit('renew')"><RefreshCw />建立續約</button><div><label><Upload />上傳合約<input type="file" class="hidden" accept=".pdf,image/*" @change="attachToSelected" /></label><button @click="openEdit()"><UserRound />編輯資料</button></div></footer></aside>
      </div>
    </section>
    <Transition name="toast"><div v-if="toast" class="toast"><Check />{{ toast }}</div></Transition>
    <Teleport to="body">
      <div v-if="uploadOpen" class="backdrop" @click.self="uploadOpen = false"><section class="dialog upload-dialog"><header><div><p>AI 將先辨識，套用前由你確認</p><h2>上傳合約並自動建檔</h2></div><button class="close" @click="uploadOpen = false"><X /></button></header><div class="p-5"><ContractOcrImport title="AI 分析合約並一鍵填寫" @apply="applyOcr($event, true)" /><button class="mt-4 w-full rounded-full py-2.5 text-sm font-bold text-[#667169] hover:bg-[#f4f1ea]" @click="uploadOpen = false">稍後再處理</button></div></section></div>
      <div v-if="formOpen" class="backdrop" @click.self="formOpen = false"><form class="dialog contract-dialog" @submit.prevent="saveContract"><header><div><p>{{ formMode === 'renew' ? '預填下一期日期並保留現行合約' : formMode === 'edit' ? '更新日期、租金條件或附件' : '一次建立租客與完整租約資料' }}</p><h2>{{ formMode === 'renew' ? '建立或編輯續約' : formMode === 'edit' ? '更新現行合約' : '新增合約' }}</h2></div><button type="button" class="close" @click="formOpen = false"><X /></button></header><div class="dialog-scroll">
        <button v-if="!showCreateOcr" type="button" class="ai-trigger" @click="showCreateOcr = true"><span><FileSearch /><b>有紙本或 PDF？使用 AI 自動填寫</b></span><ChevronRight /></button><ContractOcrImport v-else compact @apply="applyOcr($event)" />
        <section><h3>租客資料</h3><div class="form-grid"><label>租客姓名 *<input v-model="form.tenant" required placeholder="輸入租客姓名" /></label><label>聯絡電話<input v-model="form.phone" placeholder="09xx-xxx-xxx" /></label><label>身分證字號<input v-model="form.nationalId" autocomplete="off" placeholder="請確認 AI 辨識結果" /></label><label>聯絡地址<input v-model="form.contactAddress" placeholder="戶籍或通訊地址" /></label></div></section>
        <section><h3>房屋與租期</h3><div class="form-grid"><label>棟別／房屋 *<select v-model="form.property"><option>101</option><option>我的出租物件</option><option>第二棟</option></select></label><label>房號 *<input v-model="form.room" required placeholder="例如 1A-01" /></label><label class="wide">租屋地址<input v-model="form.propertyAddress" placeholder="AI 可從契約自動擷取" /></label><label>合約開始日 *<input v-model="form.start" required type="date" /></label><label>合約結束日 *<input v-model="form.end" required type="date" /></label></div></section>
        <section><h3>租金與繳納</h3><div class="form-grid"><label>每期月租 *<input v-model.number="form.rent" required min="0" type="number" /></label><label>押金 *<input v-model.number="form.deposit" required min="0" type="number" /></label><label>繳租日<input v-model.number="form.paymentDay" min="1" max="31" type="number" /></label><label>繳費週期<select v-model="form.paymentFrequency"><option value="monthly">月繳</option><option value="bimonthly">每 2 個月</option><option value="quarterly">每季</option></select></label></div></section>
        <section class="upload-box"><label><Upload />上傳合約附件<input type="file" accept=".pdf,image/*" @change="onAttachment" /></label><p>{{ uploadedAttachmentName || '可選填附件，之後也能回到列表補上或更新。' }}</p></section><div v-if="uploadedAttachmentName" class="ai-note"><Check /><p><b>AI 欄位已帶入</b><span>請逐一確認姓名、身分資料、日期、金額與房號後再儲存。</span></p></div>
      </div><footer><button class="save">{{ formMode === 'renew' ? '建立續約' : '儲存合約' }}</button><button type="button" @click="formOpen = false">關閉</button></footer></form></div>
    </Teleport>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.panel { @apply rounded-[1.4rem] border border-[#e1dbcf] bg-[#fffefa] shadow-[0_8px_24px_rgba(70,70,60,.04)]; }.page-header { @apply flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between; }.page-header h1 { @apply text-3xl font-black tracking-tight; }.page-header p { @apply mt-1.5 text-sm text-[#758078]; }.sync-note { @apply mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#5b7d62]; }.sync-note :deep(svg) { @apply h-3.5 w-3.5; }.actions { @apply flex flex-wrap gap-2; }.btn { @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-px; }.btn :deep(svg) { @apply h-4 w-4; }.btn.primary { @apply bg-[#5b8263] text-white; }.btn.secondary { @apply border border-[#ded8cc] bg-white; }
.overview { @apply grid overflow-hidden lg:grid-cols-[1.65fr_repeat(4,.7fr)_1.25fr]; }.attention { @apply flex items-center gap-4 p-5; }.attention > span { @apply grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e8f3e9] text-[#5b8263]; }.attention > span :deep(svg) { @apply h-5 w-5; }.attention h2 { @apply text-lg font-black; }.attention p { @apply mt-1 text-xs text-[#778078]; }.overview-stat,.completion { @apply border-t border-[#e5dfd4] p-5 lg:border-l lg:border-t-0; }.overview-stat span,.completion span { @apply text-xs text-[#788179]; }.overview-stat b { @apply mt-2 block text-2xl; }.overview-stat small { @apply text-xs; }.overview-stat.amber b { @apply text-[#ac7120]; }.completion > div { @apply flex justify-between; }.completion > div small { @apply text-[10px] text-[#8a918c]; }.completion > b { @apply mt-1 block text-2xl; }.bar { @apply mt-2 h-2 overflow-hidden rounded-full bg-[#e8e3da]; }.bar i { @apply block h-full rounded-full bg-[#5b8263]; }
.workspace { @apply overflow-hidden; }.toolbar { @apply flex flex-col gap-3 border-b border-[#e3ddd1] px-4 py-3 xl:flex-row xl:items-center xl:justify-between; }.tabs { @apply flex flex-wrap gap-1; }.tabs button { @apply border-b-2 border-transparent px-2 py-2 text-xs font-bold text-[#747d76]; }.tabs button.active { @apply border-[#5b8263] text-[#42674a]; }.tabs b { @apply ml-1 text-[10px]; }.filters { @apply flex flex-wrap items-center gap-2; }.filters select { @apply rounded-xl border border-[#ddd7cb] bg-white px-3 py-2.5 text-xs font-bold outline-none; }.search { @apply relative; }.search > svg { @apply absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#89918b]; }.search input { @apply w-60 rounded-xl border border-[#ddd7cb] bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:ring-4 focus:ring-[#dcebdd]; }.clear { @apply inline-flex items-center gap-1 px-2 text-xs font-bold text-[#5c8063]; }.clear :deep(svg) { @apply h-3.5 w-3.5; }
.work-grid { @apply grid xl:grid-cols-[minmax(0,1fr)_360px]; }.directory { @apply min-w-0; }.directory > header,.detail > header { @apply flex h-14 items-center justify-between border-b border-[#e4ded3] px-5; }.directory > header h2,.detail > header h2 { @apply font-black; }.directory > header span { @apply text-xs text-[#778078]; }.table-wrap { @apply min-h-[420px] overflow-x-auto; } table { @apply w-full min-w-[880px] text-left text-xs; } thead { @apply bg-[#f7f4ed] text-[#717b73]; } th,td { @apply border-b border-[#e8e2d7] px-4 py-3; } tbody tr { @apply cursor-pointer transition hover:bg-[#f5f9f4]; } tbody tr.selected { @apply border-l-[3px] border-[#5b8263] bg-[#eaf4eb]; } td small { @apply mt-1 block text-[10px] text-[#747e76]; }.tenant { @apply flex items-center gap-3; }.tenant > span,.profile > span { @apply grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e6f2e7] font-black text-[#53795b]; }.badge { @apply inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-bold; }.badge :deep(svg) { @apply h-3 w-3; }.badge.green { @apply border-[#cde2d0] bg-[#e7f3e9] text-[#507758]; }.badge.amber { @apply border-[#ecd3a8] bg-[#fff1dd] text-[#a66d20]; }.badge.red { @apply border-[#edc7c0] bg-[#fbe8e5] text-[#a75248]; }.badge.neutral { @apply border-[#dfdbd2] bg-[#f1efe9] text-[#707871]; }.more { @apply grid h-8 w-8 place-items-center rounded-full hover:bg-white; }.more :deep(svg) { @apply h-4 w-4; }.empty { @apply py-16 text-center text-[#778078]; }.directory > footer { @apply flex items-center justify-between border-t border-[#e4ded3] bg-[#faf8f2] px-5 py-4 text-xs text-[#79827b]; }.directory > footer div { @apply flex gap-2; }.directory > footer button,.directory > footer b { @apply grid h-8 w-8 place-items-center rounded-lg border border-[#e1dbcf] bg-white; }.directory > footer b { @apply border-[#5b8263] bg-[#5b8263] text-white; }
.detail { @apply border-t border-[#e1dbcf] xl:border-l xl:border-t-0; }.detail-scroll { @apply max-h-[540px] overflow-y-auto p-5; }.profile { @apply flex items-center gap-3 border-b border-[#e5dfd4] pb-4; }.profile > span { @apply h-12 w-12 text-lg; }.profile h3 { @apply text-lg font-black; }.profile h3 em { @apply ml-1 rounded-full bg-[#e6f2e8] px-2 py-1 text-[10px] font-bold not-italic text-[#54795b]; }.profile p { @apply mt-1 flex items-center gap-1 text-xs text-[#788179]; }.profile p :deep(svg) { @apply h-3.5 w-3.5; }.facts { @apply grid grid-cols-2 gap-y-3 border-b border-[#e5dfd4] py-4 text-xs; }.facts span { @apply text-[#788179]; }.facts b { @apply mt-1 block; }.lifecycle { @apply border-b border-[#e5dfd4] py-4; }.lifecycle h3,.attachments h3 { @apply text-xs font-black; }.lifecycle > div { @apply relative mt-4 flex justify-between; }.lifecycle > div::before { content:''; @apply absolute left-1 right-1 top-1/2 h-px bg-[#cfd7ce]; }.lifecycle i { @apply relative z-10 h-2.5 w-2.5 rounded-full border-2 border-[#c7cec6] bg-white; }.lifecycle i.done { @apply border-[#5b8263] bg-[#e5f1e6]; }.lifecycle ul { @apply mt-2 grid grid-cols-5 gap-1 text-center; }.lifecycle li b,.lifecycle li small { @apply block text-[9px]; }.lifecycle li small { @apply mt-1 text-[8px] text-[#7c857e]; }.attachments { @apply pt-4; }.attachments p { @apply mt-3 flex items-center gap-2 text-xs; }.attachments p :deep(svg) { @apply h-4 w-4 text-[#61796a]; }.attachments p b { @apply ml-auto text-[#a76e21]; }.detail > footer { @apply border-t border-[#e4ded3] p-4; }.detail .renew { @apply flex w-full items-center justify-center gap-2 rounded-full bg-[#5b8263] py-2.5 text-xs font-black text-white; }.detail .renew :deep(svg) { @apply h-4 w-4; }.detail footer > div { @apply mt-2 grid grid-cols-2 gap-2; }.detail footer label,.detail footer div button { @apply flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[#ded8cc] bg-white py-2.5 text-xs font-bold; }.detail footer label :deep(svg),.detail footer div button :deep(svg) { @apply h-4 w-4; }
.backdrop { @apply fixed inset-0 z-50 grid place-items-center bg-[#263229]/45 p-3 backdrop-blur-sm; }.dialog { @apply max-h-[calc(100dvh-24px)] w-full overflow-hidden rounded-[1.5rem] border border-[#ded8cc] bg-[#fffdf8] shadow-2xl; }.upload-dialog { @apply max-w-2xl; }.contract-dialog { @apply flex max-w-2xl flex-col; }.dialog > header { @apply flex shrink-0 items-center justify-between border-b border-[#e4ded2] p-5; }.dialog header p { @apply text-xs text-[#758078]; }.dialog header h2 { @apply text-xl font-black; }.close { @apply grid h-9 w-9 place-items-center rounded-full border border-[#ded8cc] bg-white; }.close :deep(svg) { @apply h-4 w-4; }.dialog-scroll { @apply min-h-0 flex-1 space-y-5 overflow-y-auto p-5; }.contract-dialog section:not(.ocr-card):not(.upload-box) { @apply space-y-3; }.contract-dialog section > h3 { @apply text-sm font-black; }.form-grid { @apply grid gap-3 sm:grid-cols-2; }.form-grid .wide { @apply sm:col-span-2; }.form-grid label { @apply text-xs font-bold; }.form-grid input,.form-grid select { @apply mt-1.5 w-full rounded-xl border border-[#ded7ca] bg-[#fffefa] px-3 py-2.5 font-normal outline-none focus:ring-4 focus:ring-[#dcebdd]; }.ai-trigger { @apply flex w-full items-center justify-between rounded-2xl border border-[#c9dbcb] bg-[#edf7ee] p-4 text-left text-[#4e7456]; }.ai-trigger span { @apply flex items-center gap-2; }.ai-trigger :deep(svg) { @apply h-5 w-5; }.upload-box { @apply rounded-2xl border border-dashed border-[#d6d0c4] p-4; }.upload-box label { @apply flex items-center gap-2 text-sm font-bold; }.upload-box label :deep(svg) { @apply h-4 w-4 text-[#5b8263]; }.upload-box input { @apply block text-xs font-normal; }.upload-box p { @apply mt-2 text-xs text-[#7a837c]; }.ai-note { @apply flex gap-2 rounded-xl bg-[#e9f4ea] p-3 text-[#4e7456]; }.ai-note > svg { @apply mt-0.5 h-4 w-4; }.ai-note b,.ai-note span { @apply block text-xs; }.ai-note span { @apply mt-1 font-normal; }.contract-dialog > footer { @apply flex shrink-0 gap-2 border-t border-[#e4ded2] p-4; }.contract-dialog > footer .save { @apply flex-1 rounded-xl bg-[#5b8263] py-3 text-sm font-black text-white; }.contract-dialog > footer button:last-child { @apply rounded-xl px-5 text-sm font-bold; }
.toast { @apply fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#254d3a] px-5 py-3 text-sm font-bold text-white shadow-xl; }.toast :deep(svg) { @apply h-4 w-4; }.toast-enter-active,.toast-leave-active { transition:.2s; }.toast-enter-from,.toast-leave-to { opacity:0; transform:translate(-50%,8px); }
@media (max-width:1279px) { .overview { @apply sm:grid-cols-3; }.attention { @apply sm:col-span-3; }.completion { @apply sm:col-span-1; } }.contract-dialog :deep(.ocr-card) { @apply bg-[#f7fbf7]; }
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { RouterLink } from 'vue-router'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-vue-next'
import {
  confirmTenantCsv,
  createTenant,
  fetchTenant,
  fetchTenantOptions,
  fetchTenantSummary,
  fetchTenants,
  inviteTenantToLine,
  moveOutTenant,
  previewTenantCsv,
  updateTenant,
  type LandlordTenant,
  type TenantPayload,
  type TenantSummary,
} from '@/src/services/landlordTenantApi'

type QuickFilter = 'all' | 'occupied' | 'expiring' | 'unbound' | 'incomplete' | 'moved_out'
const summary = ref<TenantSummary>({
  tenant_count: 0,
  active_lease_count: 0,
  expiring_count: 0,
  deposit_total: 0,
  monthly_rent_total: 0,
})
const tenants = ref<LandlordTenant[]>([])
const selected = ref<LandlordTenant | null>(null)
const properties = ref<
  Array<{ id: number; name: string; rooms: Array<{ id: number; number: string; status: string }> }>
>([])
const filterCounts = ref<Record<string, number>>({})
const loading = ref(true)
const detailLoading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const keywordInput = ref('')
const keyword = ref('')
const quickFilter = ref<QuickFilter>('all')
const propertyFilter = ref('')
const statusFilter = ref('all')
const page = ref(1)
const pageSize = 10
const total = ref(0)
const tenantDialog = ref(false)
const editingId = ref<number | null>(null)
const moveOutDialog = ref(false)
const importDialog = ref(false)
const formError = ref('')
const importResult = ref('')
const csvPreview = ref<Awaited<ReturnType<typeof previewTenantCsv>> | null>(null)
const moveOutForm = reactive({
  move_out_date: new Date().toISOString().slice(0, 10),
  reason: '',
  final_rent: 0,
  utility_fee: 0,
  deposit_refund: 0,
  deposit_deduction: 0,
  deduction_reason: '',
  inspection_status: 'pending',
  notes: '',
})
const form = reactive({
  name: '',
  phone: '',
  email: '',
  national_id: '',
  birth_date: '',
  contact_address: '',
  emergency_name: '',
  emergency_phone: '',
  notes: '',
  property_name: '',
  room_number: '',
  lease_start: '',
  lease_end: '',
  monthly_rent: 0,
  deposit_amount: 0,
  payment_day: 5,
  payment_frequency: 'monthly',
  contract_id: '',
  lease_status: 'active' as 'active' | 'pending',
})

const quickFilters = computed(() => [
  { value: 'all' as const, label: '全部', count: filterCounts.value.all ?? 0 },
  { value: 'occupied' as const, label: '已入住', count: filterCounts.value.occupied ?? 0 },
  { value: 'expiring' as const, label: '即將到期', count: filterCounts.value.expiring ?? 0 },
  { value: 'unbound' as const, label: '未綁 LINE', count: filterCounts.value.unbound ?? 0 },
  { value: 'incomplete' as const, label: '資料待補', count: filterCounts.value.incomplete ?? 0 },
  { value: 'moved_out' as const, label: '已退租', count: filterCounts.value.moved_out ?? 0 },
])
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const money = (value: number) => `NT$${value.toLocaleString('zh-TW')}`
const dateRange = (tenant: LandlordTenant) =>
  tenant.lease_start && tenant.lease_end
    ? `${tenant.lease_start} ～ ${tenant.lease_end}`
    : '尚未建立租約'
const leaseLabel: Record<string, string> = {
  occupied: '已入住',
  expiring: '即將到期',
  expired: '已到期',
  moved_out: '已退租',
  pending: '待入住',
  incomplete: '待補資料',
}
const lineLabel: Record<string, string> = {
  unbound: '未綁定',
  invited: '邀請已發送',
  bound: '已綁定',
  expired: '綁定失效',
}
const completenessItems = computed(() =>
  selected.value
    ? ([
        ['基本資料', selected.value.completeness.basic],
        ['聯絡資訊', selected.value.completeness.contact],
        ['房間指派', selected.value.completeness.room],
        ['租約資料', selected.value.completeness.lease],
        ['收款資料', selected.value.completeness.payment],
        ['LINE 綁定', selected.value.completeness.line],
      ] as Array<[string, boolean]>)
    : [],
)

function queryParams() {
  const params = new URLSearchParams({
    keyword: keyword.value,
    quick_filter: quickFilter.value,
    status: statusFilter.value,
    page: String(page.value),
    page_size: String(pageSize),
  })
  if (propertyFilter.value) params.set('property_id', propertyFilter.value)
  return params
}
async function loadList(preferredId?: number) {
  loading.value = true
  error.value = ''
  try {
    const result = await fetchTenants(queryParams())
    tenants.value = result.items
    total.value = result.total
    filterCounts.value = result.filter_counts
    const nextId =
      preferredId ??
      (selected.value && tenants.value.some((item) => item.id === selected.value?.id)
        ? selected.value.id
        : tenants.value[0]?.id)
    if (nextId) await selectTenant(nextId)
    else selected.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '租客資料讀取失敗。'
  } finally {
    loading.value = false
  }
}
async function loadSummary() {
  try {
    summary.value = await fetchTenantSummary()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '統計資料讀取失敗。'
  }
}
async function loadOptions() {
  try {
    const options = await fetchTenantOptions()
    properties.value = options.properties
  } catch {
    // 列表與摘要會顯示主要 API 錯誤；選項失敗時保留可手動輸入的表單。
  }
}
async function loadAll(preferredId?: number) {
  await Promise.all([loadList(preferredId), loadSummary(), loadOptions()])
}
async function selectTenant(id: number) {
  detailLoading.value = true
  try {
    selected.value = await fetchTenant(id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '租客詳情讀取失敗。'
  } finally {
    detailLoading.value = false
  }
}

const updateSearch = useDebounceFn(() => {
  keyword.value = keywordInput.value
  page.value = 1
}, 300)
watch(keywordInput, updateSearch)
watch([keyword, quickFilter, propertyFilter, statusFilter, page], () => loadList())

function resetForm() {
  Object.assign(form, {
    name: '',
    phone: '',
    email: '',
    national_id: '',
    birth_date: '',
    contact_address: '',
    emergency_name: '',
    emergency_phone: '',
    notes: '',
    property_name: '',
    room_number: '',
    lease_start: '',
    lease_end: '',
    monthly_rent: 0,
    deposit_amount: 0,
    payment_day: 5,
    payment_frequency: 'monthly',
    contract_id: '',
    lease_status: 'active',
  })
  formError.value = ''
}
function openCreate() {
  editingId.value = null
  resetForm()
  tenantDialog.value = true
}
function openEdit(tenant = selected.value) {
  if (!tenant) return
  editingId.value = tenant.id
  Object.assign(form, {
    name: tenant.name,
    phone: tenant.phone,
    email: tenant.email ?? '',
    national_id: '',
    birth_date: tenant.birth_date ?? '',
    contact_address: tenant.contact_address ?? '',
    emergency_name: tenant.emergency_name ?? '',
    emergency_phone: tenant.emergency_phone ?? '',
    notes: tenant.notes ?? '',
    property_name: tenant.property_name ?? '',
    room_number: tenant.room_number ?? '',
    lease_start: tenant.lease_start ?? '',
    lease_end: tenant.lease_end ?? '',
    monthly_rent: tenant.monthly_rent,
    deposit_amount: tenant.deposit_amount,
    payment_day: tenant.payment_day ?? 5,
    payment_frequency: tenant.payment_frequency ?? 'monthly',
    contract_id: tenant.contract_id ?? '',
    lease_status: tenant.lease_status === 'pending' ? 'pending' : 'active',
  })
  formError.value = ''
  tenantDialog.value = true
}
function payload(): TenantPayload {
  return {
    ...form,
    email: form.email || undefined,
    national_id: form.national_id || undefined,
    birth_date: form.birth_date || undefined,
    contact_address: form.contact_address || undefined,
    emergency_name: form.emergency_name || undefined,
    emergency_phone: form.emergency_phone || undefined,
    notes: form.notes || undefined,
    contract_id: form.contract_id || undefined,
  }
}
async function saveTenant() {
  saving.value = true
  formError.value = ''
  try {
    const saved = editingId.value
      ? await updateTenant(editingId.value, payload())
      : await createTenant(payload())
    tenantDialog.value = false
    success.value = editingId.value ? '租客資料已更新。' : '租客已新增。'
    await loadAll(saved.id)
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : '儲存失敗。'
  } finally {
    saving.value = false
  }
}
async function completeMoveOut() {
  if (!selected.value) return
  saving.value = true
  formError.value = ''
  try {
    const saved = await moveOutTenant(selected.value.id, { ...moveOutForm })
    moveOutDialog.value = false
    success.value = '退租已完成，歷史紀錄已保留。'
    await loadAll(saved.id)
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : '退租處理失敗。'
  } finally {
    saving.value = false
  }
}
async function openMoveOut(tenant: LandlordTenant) {
  await selectTenant(tenant.id)
  moveOutDialog.value = true
}
async function sendLineInvite() {
  if (!selected.value) return
  try {
    const result = await inviteTenantToLine(selected.value.id)
    success.value = result.mock ? '已產生測試邀請；LINE API 尚未正式串接。' : 'LINE 邀請已發送。'
    await selectTenant(selected.value.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '邀請產生失敗。'
  }
}
function clearFilters() {
  keywordInput.value = ''
  keyword.value = ''
  quickFilter.value = 'all'
  propertyFilter.value = ''
  statusFilter.value = 'all'
  page.value = 1
}
function setQuickFilter(value: QuickFilter) {
  quickFilter.value = value
  page.value = 1
}
function downloadSample() {
  const csv =
    '\ufeffname,phone,email,property_name,room_number,lease_start,lease_end,monthly_rent,deposit_amount,payment_day\n王小明,0912345678,wang@example.com,松庭公寓,3A,2026-09-01,2027-08-31,12000,24000,5'
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = 'rentmate-tenant-import-sample.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}
function downloadCsvErrors() {
  if (!csvPreview.value) return
  const rows = csvPreview.value.rows.filter((row) => !row.valid)
  const csv = `\ufeffrow,name,phone,errors\n${rows
    .map(
      (row) =>
        `${row.row},"${row.data.name || ''}","${row.data.phone || ''}","${row.errors.join('；').replaceAll('"', '""')}"`,
    )
    .join('\n')}`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = 'rentmate-tenant-import-errors.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}
async function handleCsv(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  importResult.value = ''
  try {
    csvPreview.value = await previewTenantCsv(file)
  } catch (cause) {
    importResult.value = cause instanceof Error ? cause.message : 'CSV 預覽失敗。'
  }
}
async function confirmImport() {
  if (!csvPreview.value) return
  saving.value = true
  try {
    const result = await confirmTenantCsv(csvPreview.value.preview_token)
    importResult.value = `匯入完成：成功 ${result.created_count} 筆，失敗 ${result.error_count} 筆。`
    await loadAll()
  } catch (cause) {
    importResult.value = cause instanceof Error ? cause.message : 'CSV 匯入失敗。'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadAll()
})
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#68846d]">
          Tenant directory
        </p>
        <h1 class="text-3xl font-black tracking-tight sm:text-4xl">租客管理</h1>
        <p class="mt-2 text-sm text-[#778078]">
          集中管理租客資料、租約狀態、房間、租金與 LINE 綁定狀態。
        </p>
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary" @click="importDialog = true">
          <Upload class="h-4 w-4" />CSV 匯入</button
        ><button class="btn-primary" @click="openCreate"><Plus class="h-4 w-4" />新增租客</button>
      </div>
    </header>
    <div
      v-if="success"
      class="flex items-center justify-between rounded-xl border border-[#c9dfcd] bg-[#edf7ef] px-4 py-3 text-sm font-bold text-[#4f7657]"
    >
      <span><Check class="mr-2 inline h-4 w-4" />{{ success }}</span
      ><button aria-label="關閉" @click="success = ''"><X class="h-4 w-4" /></button>
    </div>
    <div
      v-if="error"
      class="flex items-center justify-between rounded-xl border border-[#edc9c2] bg-[#fceeea] px-4 py-3 text-sm text-[#9d4f43]"
    >
      <span><AlertCircle class="mr-2 inline h-4 w-4" />{{ error }}</span
      ><button class="font-bold" @click="loadAll()">重新載入</button>
    </div>

    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <article
        v-for="card in [
          {
            label: '租客總數',
            value: String(summary.tenant_count),
            note: '目前所有租客',
            icon: Users,
          },
          {
            label: '有效租約',
            value: String(summary.active_lease_count),
            note: '今日有效租約',
            icon: FileText,
          },
          {
            label: '30 天內到期',
            value: String(summary.expiring_count),
            note: '有效租約即將到期',
            icon: Clock3,
          },
          {
            label: '押金總額',
            value: money(summary.deposit_total),
            note: '有效租約押金',
            icon: CircleDollarSign,
          },
          {
            label: '每月租金合計',
            value: money(summary.monthly_rent_total),
            note: '有效租約月租',
            icon: CircleDollarSign,
          },
        ]"
        :key="card.label"
        class="metric"
      >
        <div>
          <p>{{ card.label }}</p>
          <strong>{{ card.value }}</strong
          ><span>{{ card.note }}</span>
        </div>
        <i><component :is="card.icon" /></i>
      </article>
    </section>

    <section class="rounded-[1.35rem] border border-[#e2ddcf] bg-white/90 p-3 shadow-sm">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex gap-1 overflow-x-auto">
          <button
            v-for="item in quickFilters"
            :key="item.value"
            :class="[
              'whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold',
              quickFilter === item.value
                ? 'border-[#bed7c2] bg-[#e8f4ea] text-[#4f7657]'
                : 'border-[#e4ded2] bg-white text-[#5f6962]',
            ]"
            @click="setQuickFilter(item.value)"
          >
            {{ item.label }} {{ item.count }}
          </button>
        </div>
        <div class="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_150px]">
          <label class="search"
            ><Search /><input
              v-model="keywordInput"
              class="field h-10 pl-9"
              placeholder="搜尋姓名、手機、Email、棟別或房號" /></label
          ><select v-model="propertyFilter" class="field h-10 py-0" @change="page = 1">
            <option value="">全部棟別</option>
            <option v-for="item in properties" :key="item.id" :value="String(item.id)">
              {{ item.name }}
            </option></select
          ><select v-model="statusFilter" class="field h-10 py-0" @change="page = 1">
            <option value="all">全部狀態</option>
            <option value="occupied">已入住</option>
            <option value="expiring">即將到期</option>
            <option value="pending">待入住</option>
            <option value="moved_out">已退租</option>
          </select>
        </div>
      </div>
      <button
        v-if="keyword || quickFilter !== 'all' || propertyFilter || statusFilter !== 'all'"
        class="mt-2 text-xs font-bold text-[#587a60]"
        @click="clearFilters"
      >
        清除所有篩選
      </button>
    </section>

    <section class="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,.8fr)]">
      <article
        class="overflow-hidden rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 shadow-sm"
      >
        <div class="border-b border-[#e8e2d6] p-5">
          <h2 class="text-xl font-black">租客資料庫</h2>
          <p class="mt-1 text-xs text-[#7a827c]">目前符合條件 {{ total }} 位</p>
        </div>
        <div v-if="loading" class="grid min-h-80 place-items-center">
          <RefreshCw class="h-7 w-7 animate-spin text-[#5b8263]" />
        </div>
        <div v-else-if="!tenants.length" class="grid min-h-80 place-items-center p-6 text-center">
          <div>
            <Users class="mx-auto h-10 w-10 text-[#9aa19c]" />
            <p class="mt-3 font-bold">找不到符合條件的租客</p>
            <p class="mt-1 text-sm text-[#7a827c]">可以清除篩選，或建立第一位租客。</p>
            <button class="btn-secondary mt-4" @click="clearFilters">清除篩選</button>
          </div>
        </div>
        <div v-else>
          <div class="hidden overflow-x-auto lg:block">
            <table class="w-full min-w-[860px] text-left text-sm">
              <thead class="bg-[#fbfaf6] text-xs text-[#747d76]">
                <tr>
                  <th>租客</th>
                  <th>房號</th>
                  <th>租約期間</th>
                  <th>月租／押金</th>
                  <th>LINE</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#ebe5da]">
                <tr
                  v-for="tenant in tenants"
                  :key="tenant.id"
                  tabindex="0"
                  :class="[
                    'cursor-pointer transition-colors hover:bg-[#f6f8f3]',
                    selected?.id === tenant.id ? 'bg-[#edf6ee] shadow-[inset_4px_0_0_#5b8263]' : '',
                  ]"
                  @click="selectTenant(tenant.id)"
                  @keydown.enter="selectTenant(tenant.id)"
                >
                  <td>
                    <div class="flex items-center gap-3">
                      <span class="avatar">{{ tenant.name.slice(0, 1) }}</span>
                      <div>
                        <p class="font-bold">{{ tenant.name }}</p>
                        <p class="text-xs text-[#7d857f]">{{ tenant.phone }}</p>
                        <p class="max-w-40 truncate text-xs text-[#969c97]">
                          {{ tenant.email || '未填寫 Email' }}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td class="font-semibold">
                    {{ tenant.property_name || '—' }}／{{ tenant.room_number || '—' }}
                  </td>
                  <td>
                    <p class="text-xs">{{ dateRange(tenant) }}</p>
                    <p
                      v-if="tenant.lease_status === 'expiring'"
                      class="mt-1 text-xs font-bold text-[#b47726]"
                    >
                      剩 {{ tenant.days_left }} 天
                    </p>
                  </td>
                  <td>
                    <p class="font-bold">{{ money(tenant.monthly_rent) }}</p>
                    <p class="text-xs text-[#838b85]">押金 {{ money(tenant.deposit_amount) }}</p>
                  </td>
                  <td>
                    <span class="badge-neutral">{{ lineLabel[tenant.line_status] }}</span>
                  </td>
                  <td>
                    <span
                      :class="[
                        'badge',
                        tenant.lease_status === 'moved_out'
                          ? 'badge-red'
                          : tenant.lease_status === 'expiring'
                            ? 'badge-amber'
                            : 'badge-green',
                      ]"
                      >{{ leaseLabel[tenant.lease_status] }}</span
                    >
                  </td>
                  <td>
                    <div class="flex gap-2">
                      <button class="action" @click.stop="selectTenant(tenant.id)">查看</button
                      ><button class="action" @click.stop="openEdit(tenant)">編輯</button
                      ><button
                        v-if="tenant.lease_status !== 'moved_out'"
                        class="action text-[#a55247]"
                        @click.stop="openMoveOut(tenant)"
                      >
                        退租
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="space-y-3 p-3 lg:hidden">
            <button
              v-for="tenant in tenants"
              :key="tenant.id"
              :class="[
                'w-full rounded-2xl border p-4 text-left',
                selected?.id === tenant.id ? 'border-[#bcd5c0] bg-[#edf6ee]' : 'border-[#e5ded2]',
              ]"
              @click="selectTenant(tenant.id)"
            >
              <div class="flex items-center gap-3">
                <span class="avatar">{{ tenant.name.slice(0, 1) }}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex justify-between gap-2">
                    <p class="font-bold">{{ tenant.name }}</p>
                    <span class="badge badge-green">{{ leaseLabel[tenant.lease_status] }}</span>
                  </div>
                  <p class="mt-1 text-xs text-[#79817b]">
                    {{ tenant.property_name }}／{{ tenant.room_number }} · {{ tenant.phone }}
                  </p>
                  <p class="mt-2 font-bold">{{ money(tenant.monthly_rent) }}／月</p>
                </div>
              </div>
            </button>
          </div>
          <footer
            class="flex items-center justify-between border-t border-[#e8e2d6] px-4 py-3 text-xs text-[#747d76]"
          >
            <span>顯示 {{ tenants.length }}／共 {{ total }} 筆</span>
            <div class="flex items-center gap-2">
              <button class="page-btn" :disabled="page <= 1" @click="page--"><ChevronLeft /></button
              ><span>第 {{ page }}／{{ totalPages }} 頁</span
              ><button class="page-btn" :disabled="page >= totalPages" @click="page++">
                <ChevronRight />
              </button>
            </div>
          </footer>
        </div>
      </article>

      <aside
        class="self-start rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 shadow-sm xl:sticky xl:top-5"
      >
        <div class="border-b border-[#e8e2d6] p-5">
          <h2 class="text-xl font-black">租客詳情</h2>
        </div>
        <div v-if="detailLoading" class="grid min-h-72 place-items-center">
          <RefreshCw class="h-6 w-6 animate-spin text-[#5b8263]" />
        </div>
        <div v-else-if="selected" class="space-y-5 p-5">
          <div class="flex items-center gap-3">
            <span class="avatar !h-12 !w-12 !text-lg">{{ selected.name.slice(0, 1) }}</span>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-black">{{ selected.name }}</h3>
                <span class="badge badge-green">{{ leaseLabel[selected.lease_status] }}</span>
              </div>
              <p class="text-sm text-[#737d76]">
                {{ selected.property_name }}／{{ selected.room_number }}
              </p>
            </div>
          </div>
          <div class="info-card">
            <dl>
              <dt>手機</dt>
              <dd>{{ selected.phone }}</dd>
              <dt>Email</dt>
              <dd>{{ selected.email || '尚未填寫' }}</dd>
              <dt>緊急聯絡</dt>
              <dd>{{ selected.emergency_name || '尚未填寫' }} {{ selected.emergency_phone }}</dd>
              <dt>租期</dt>
              <dd>{{ dateRange(selected) }}</dd>
              <dt>月租</dt>
              <dd>{{ money(selected.monthly_rent) }}</dd>
              <dt>押金</dt>
              <dd>{{ money(selected.deposit_amount) }}</dd>
              <dt>繳租日</dt>
              <dd>每月 {{ selected.payment_day || '—' }} 號</dd>
            </dl>
          </div>
          <section>
            <div class="flex items-center justify-between">
              <h4 class="font-black">資料完整度</h4>
              <span class="text-sm font-black text-[#5b8263]"
                >{{ selected.completeness.percent }}%</span
              >
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-[#e4e0d6]">
              <div
                class="h-full rounded-full bg-[#5b8263]"
                :style="{ width: `${selected.completeness.percent}%` }"
              />
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <div
                v-for="item in completenessItems"
                :key="item[0]"
                :class="[
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold',
                  item[1]
                    ? 'border-[#d3e5d6] bg-[#f0f7f1] text-[#56775d]'
                    : 'border-[#eed8b9] bg-[#fff7e9] text-[#9c6a25]',
                ]"
              >
                <Check v-if="item[1]" class="h-3.5 w-3.5" /><AlertCircle
                  v-else
                  class="h-3.5 w-3.5"
                />{{ item[0] }}
              </div>
            </div>
          </section>
          <section>
            <h4 class="font-black">近期活動</h4>
            <div class="mt-3 space-y-3">
              <div
                v-for="activity in selected.activity_timeline?.slice(0, 4)"
                :key="activity.occurred_at"
                class="border-l-2 border-[#c7dccb] pl-3"
              >
                <p class="text-sm font-semibold">{{ activity.detail }}</p>
                <p class="text-xs text-[#8a918c]">{{ activity.occurred_at.slice(0, 10) }}</p>
              </div>
            </div>
          </section>
          <div class="grid grid-cols-2 gap-2">
            <button class="btn-primary" @click="openEdit()">
              <Pencil class="h-4 w-4" />編輯資料</button
            ><RouterLink
              :to="{
                path: '/landlord/contracts',
                query: { tenant_id: selected.id, contract_id: selected.contract_id || undefined },
              }"
              class="btn-secondary"
              ><FileText class="h-4 w-4" />查看合約</RouterLink
            ><RouterLink
              :to="{
                path: '/landlord/maintenance',
                query: {
                  tenant_id: selected.id,
                  property_id: selected.property_id || undefined,
                  room_id: selected.room_id || undefined,
                  tenant_name: selected.name,
                  contact: selected.phone,
                },
              }"
              class="btn-secondary"
              ><Wrench class="h-4 w-4" />新增報修</RouterLink
            ><button
              v-if="selected.line_status !== 'bound'"
              class="btn-secondary"
              @click="sendLineInvite"
            >
              <Link2 class="h-4 w-4" />LINE 邀請</button
            ><button
              v-if="selected.lease_status !== 'moved_out'"
              class="col-span-2 rounded-full border border-[#e4bcb4] px-4 py-2.5 text-sm font-bold text-[#a55247]"
              @click="moveOutDialog = true"
            >
              辦理退租
            </button>
          </div>
        </div>
        <div v-else class="grid min-h-80 place-items-center p-6 text-center text-sm text-[#7a827c]">
          <div>
            <UserRound class="mx-auto h-9 w-9" />
            <p class="mt-3">選擇租客後查看完整資料</p>
          </div>
        </div>
      </aside>
    </section>

    <Teleport to="body"
      ><div v-if="tenantDialog" class="backdrop" @click.self="tenantDialog = false">
        <section class="dialog max-h-[92vh] max-w-3xl overflow-y-auto">
          <header class="dialog-head">
            <div>
              <h2>{{ editingId ? '編輯租客' : '新增租客' }}</h2>
              <p>基本資料、房間與租約會一併儲存</p>
            </div>
            <button class="icon-btn" @click="tenantDialog = false"><X /></button>
          </header>
          <form class="space-y-5 p-5" @submit.prevent="saveTenant">
            <p v-if="formError" class="error-box">{{ formError }}</p>
            <fieldset>
              <legend>基本資料</legend>
              <div class="form-grid">
                <label>姓名 *<input v-model="form.name" required class="field" /></label
                ><label>手機 *<input v-model="form.phone" required class="field" /></label
                ><label>Email<input v-model="form.email" type="email" class="field" /></label
                ><label
                  >身分證字號<input
                    v-model="form.national_id"
                    class="field"
                    autocomplete="off" /></label
                ><label>生日<input v-model="form.birth_date" type="date" class="field" /></label
                ><label>聯絡地址<input v-model="form.contact_address" class="field" /></label
                ><label>緊急聯絡人<input v-model="form.emergency_name" class="field" /></label
                ><label>緊急聯絡電話<input v-model="form.emergency_phone" class="field" /></label>
              </div>
              <label class="mt-3 block"
                >備註<textarea v-model="form.notes" class="field mt-1 min-h-20" />
              </label>
            </fieldset>
            <fieldset>
              <legend>房間指派</legend>
              <div class="form-grid">
                <label
                  >棟別 *<input
                    v-model="form.property_name"
                    required
                    class="field"
                    list="property-list" /><datalist id="property-list">
                    <option
                      v-for="item in properties"
                      :key="item.id"
                      :value="item.name"
                    /></datalist></label
                ><label>房號 *<input v-model="form.room_number" required class="field" /></label>
              </div>
              <p class="mt-2 text-xs text-[#7a827c]">
                若棟別或房號尚不存在，後端會在此房東帳號下建立；租期衝突仍會被拒絕。
              </p>
            </fieldset>
            <fieldset>
              <legend>租約資料</legend>
              <div class="form-grid">
                <label
                  >開始日 *<input
                    v-model="form.lease_start"
                    required
                    type="date"
                    class="field" /></label
                ><label
                  >結束日 *<input
                    v-model="form.lease_end"
                    required
                    type="date"
                    class="field" /></label
                ><label
                  >月租 *<input
                    v-model.number="form.monthly_rent"
                    required
                    min="0"
                    type="number"
                    class="field" /></label
                ><label
                  >押金 *<input
                    v-model.number="form.deposit_amount"
                    required
                    min="0"
                    type="number"
                    class="field" /></label
                ><label
                  >每月繳租日 *<input
                    v-model.number="form.payment_day"
                    required
                    min="1"
                    max="31"
                    type="number"
                    class="field" /></label
                ><label
                  >入住狀態<select v-model="form.lease_status" class="field">
                    <option value="active">已入住</option>
                    <option value="pending">待入住</option>
                  </select></label
                >
              </div>
            </fieldset>
            <button class="btn-primary w-full" :disabled="saving">
              {{ saving ? '儲存中…' : '儲存租客' }}
            </button>
          </form>
        </section>
      </div>
      <div v-if="moveOutDialog && selected" class="backdrop" @click.self="moveOutDialog = false">
        <section class="dialog max-w-xl">
          <header class="dialog-head">
            <div>
              <h2>辦理退租</h2>
              <p>{{ selected.name }} · {{ selected.property_name }}／{{ selected.room_number }}</p>
            </div>
            <button class="icon-btn" @click="moveOutDialog = false"><X /></button>
          </header>
          <form class="space-y-4 p-5" @submit.prevent="completeMoveOut">
            <p v-if="formError" class="error-box">{{ formError }}</p>
            <div class="form-grid">
              <label
                >實際退租日 *<input
                  v-model="moveOutForm.move_out_date"
                  required
                  type="date"
                  class="field" /></label
              ><label
                >點交狀態<select v-model="moveOutForm.inspection_status" class="field">
                  <option value="pending">待點交</option>
                  <option value="completed">已完成</option>
                </select></label
              ><label
                >最終租金<input
                  v-model.number="moveOutForm.final_rent"
                  min="0"
                  type="number"
                  class="field" /></label
              ><label
                >水電及其他費用<input
                  v-model.number="moveOutForm.utility_fee"
                  min="0"
                  type="number"
                  class="field" /></label
              ><label
                >押金應退<input
                  v-model.number="moveOutForm.deposit_refund"
                  min="0"
                  type="number"
                  class="field" /></label
              ><label
                >押金扣除<input
                  v-model.number="moveOutForm.deposit_deduction"
                  min="0"
                  type="number"
                  class="field"
              /></label>
            </div>
            <label class="block"
              >提前退租原因<textarea
                v-model="moveOutForm.reason"
                class="field mt-1 min-h-16"
              /></label
            ><label class="block"
              >扣除原因<textarea
                v-model="moveOutForm.deduction_reason"
                class="field mt-1 min-h-16"
              />
            </label>
            <div class="rounded-xl bg-[#f4f1e8] p-4 text-sm">
              <p class="font-bold">結算摘要</p>
              <p class="mt-2">
                應退押金：{{
                  money(Math.max(0, moveOutForm.deposit_refund - moveOutForm.deposit_deduction))
                }}
              </p>
              <p>待收費用：{{ money(moveOutForm.final_rent + moveOutForm.utility_fee) }}</p>
            </div>
            <button
              class="w-full rounded-full bg-[#a75549] py-3 font-bold text-white"
              :disabled="saving"
            >
              確認完成退租
            </button>
          </form>
        </section>
      </div>
      <div v-if="importDialog" class="backdrop" @click.self="importDialog = false">
        <section class="dialog max-w-2xl">
          <header class="dialog-head">
            <div>
              <h2>CSV 匯入租客</h2>
              <p>先預覽與驗證，確認後才會寫入資料庫</p>
            </div>
            <button class="icon-btn" @click="importDialog = false"><X /></button>
          </header>
          <div class="space-y-4 p-5">
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary" @click="downloadSample">下載範例格式</button
              ><label class="btn-primary cursor-pointer"
                >選擇 CSV<input
                  class="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  @change="handleCsv"
              /></label>
            </div>
            <p v-if="importResult" class="error-box">{{ importResult }}</p>
            <div v-if="csvPreview">
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-xl bg-[#edf7ef] p-3 text-sm font-bold text-[#55775d]">
                  可匯入 {{ csvPreview.valid_count }} 筆
                </div>
                <div class="rounded-xl bg-[#fceeea] p-3 text-sm font-bold text-[#a05246]">
                  錯誤 {{ csvPreview.error_count }} 筆
                </div>
              </div>
              <div class="mt-3 max-h-64 overflow-auto rounded-xl border border-[#e2dbcf]">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th>列</th>
                      <th>姓名</th>
                      <th>房間</th>
                      <th>驗證結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in csvPreview.rows" :key="row.row">
                      <td>{{ row.row }}</td>
                      <td>{{ row.data.name }}</td>
                      <td>{{ row.data.property_name }}／{{ row.data.room_number }}</td>
                      <td :class="row.valid ? 'text-[#55775d]' : 'text-[#a05246]'">
                        {{ row.valid ? '可匯入' : row.errors.join('、') }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button
                v-if="csvPreview.error_count"
                class="btn-secondary mt-4 w-full"
                @click="downloadCsvErrors"
              >
                下載錯誤資料報告
              </button>
              <button
                class="btn-primary mt-4 w-full"
                :disabled="saving || !csvPreview.valid_count"
                @click="confirmImport"
              >
                確認匯入有效資料
              </button>
            </div>
          </div>
        </section>
      </div></Teleport
    >
  </div>
</template>

<style scoped>
@reference "../../index.css";
.btn-primary,
.btn-secondary {
  @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50;
}
.btn-primary {
  @apply bg-[#5b8263] text-white shadow-sm hover:bg-[#4f7557];
}
.btn-secondary {
  @apply border border-[#dfd9cc] bg-white hover:bg-[#f8f6ef];
}
.metric {
  @apply flex min-h-28 items-start justify-between rounded-[1.35rem] border border-[#e2ddcf] border-t-[3px] border-t-[#63856a] bg-white/90 p-4 shadow-sm;
}
.metric p {
  @apply text-xs font-bold text-[#737d76];
}
.metric strong {
  @apply mt-2 block text-2xl font-black;
}
.metric span {
  @apply mt-1 block text-xs text-[#858d87];
}
.metric i {
  @apply grid h-10 w-10 place-items-center rounded-full bg-[#e6f1e8] text-[#5b8263] not-italic;
}
.metric i :deep(svg) {
  @apply h-5 w-5;
}
.field {
  @apply w-full rounded-xl border border-[#ded7ca] bg-[#fffefa] px-3 py-2.5 text-sm outline-none focus:border-[#7a9a80] focus:ring-4 focus:ring-[#dcebdd];
}
.search {
  @apply relative block;
}
.search > svg {
  @apply absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#879087];
}
.avatar {
  @apply grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e4f1e6] text-sm font-black text-[#5a7d61];
}
.badge,
.badge-neutral {
  @apply inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-bold;
}
.badge-green {
  @apply border-[#cde2d0] bg-[#e8f4e9] text-[#4f7958];
}
.badge-amber {
  @apply border-[#efd6ae] bg-[#fff3df] text-[#a46d22];
}
.badge-red {
  @apply border-[#eccbc4] bg-[#fbe9e5] text-[#a65e50];
}
.badge-neutral {
  @apply border-[#e1dbcf] bg-[#f4f1e9] text-[#6f7771];
}
.action {
  @apply text-xs font-bold text-[#55775d] hover:underline;
}
.page-btn {
  @apply grid h-8 w-8 place-items-center rounded-full border border-[#ddd7cb] disabled:opacity-40;
}
.page-btn :deep(svg) {
  @apply h-4 w-4;
}
.info-card {
  @apply rounded-2xl border border-[#e5ded2] bg-[#fdfbf6] p-4;
}
.info-card dl {
  @apply grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-sm;
}
.info-card dt {
  @apply text-[#7a827c];
}
.info-card dd {
  @apply font-semibold;
}
.backdrop {
  @apply fixed inset-0 z-50 grid place-items-center bg-[#263229]/45 p-3 backdrop-blur-[2px];
}
.dialog {
  @apply w-full overflow-hidden rounded-[1.5rem] border border-[#e1dbce] bg-[#fffdf8] shadow-2xl;
}
.dialog-head {
  @apply flex items-center justify-between border-b border-[#e5ded2] px-5 py-4;
}
.dialog-head h2 {
  @apply text-lg font-black;
}
.dialog-head p {
  @apply text-xs text-[#7a827c];
}
.icon-btn {
  @apply grid h-9 w-9 place-items-center rounded-full border border-[#e2dcd0] bg-white;
}
.icon-btn :deep(svg) {
  @apply h-4 w-4;
}
fieldset {
  @apply rounded-2xl border border-[#e5ded2] p-4;
}
legend {
  @apply px-2 font-black;
}
.form-grid {
  @apply grid gap-3 sm:grid-cols-2;
}
.form-grid label,
fieldset > label {
  @apply text-sm font-bold;
}
.form-grid .field {
  @apply mt-1;
}
.error-box {
  @apply rounded-xl border border-[#edc9c2] bg-[#fceeea] px-4 py-3 text-sm text-[#9d4f43];
}
th,
td {
  @apply px-4 py-3;
}
</style>

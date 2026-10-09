<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Download,
  Droplets,
  FileSpreadsheet,
  Plus,
  ReceiptText,
  Search,
  Undo2,
  WalletCards,
  Wrench,
  X,
} from 'lucide-vue-next'
import {
  useLandlordFinance,
  type LandlordPayment,
  type PaymentKind,
  type PaymentStatus,
} from '@/src/composables/useLandlordFinance'
import { useLandlordWorkspace } from '@/src/composables/useLandlordWorkspace'
import type { PaymentMethod } from '@/src/services/landlordWorkspaceApi'
import ElectricityRecords from '@/src/components/landlord/ElectricityRecords.vue'
const financeSection = ref<'finance' | 'electricity'>('finance')

const {
  month,
  setMonth,
  payments,
  expenses,
  trend,
  total,
  received,
  awaiting,
  overdue,
  partialReceived,
  rate,
  monthLabel,
  loading,
  error: loadError,
  recordPayment,
  reversePayment,
  markPaymentReminded,
  addUtilityCharge,
  refresh,
  addExpense: saveExpense,
} = useLandlordFinance()
const { activeTenants } = useLandlordWorkspace()

const emptyPayment: LandlordPayment = {
  id: '', chargeId: 0, leaseId: 0, tenantId: null, tenantBound: false, group: '尚無收款資料', room: '—', tenant: '—', kind: 'rent',
  title: '尚無收款任務', period: '', amount: 0, paid: 0, due: '—', status: 'pending', partial: false, overdue: false,
  carried: false, reminded: false, remindedAt: null, tenantReport: null, payments: [],
  activities: ['新增有效租約後，系統會依租約自動產生每期應收帳款。'],
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const tab = ref<'all' | PaymentStatus | PaymentKind>('pending')
const keyword = ref('')
const groupKeyword = ref('')
const statusFilter = ref('all')
const groupFilter = ref('all')
const selectedId = ref('')
const toast = ref('')
const toastTone = ref<'ok' | 'error'>('ok')
const busy = ref(false)
const paymentOpen = ref(false)
const expenseOpen = ref(false)
const utilityOpen = ref(false)
const paymentForm = ref<{ amount: number; method: PaymentMethod; paidOn: string; note: string }>({ amount: 0, method: 'bank-transfer', paidOn: todayKey(), note: '' })
const expenseForm = ref({ title: '', category: '維修', amount: 0, date: todayKey(), note: '' })
const utilityForm = ref<{ leaseId: number | null; kind: 'water' | 'electricity' | 'other'; title: string; amount: number; dueDate: string; periodStart: string; periodEnd: string }>({
  leaseId: null, kind: 'electricity', title: '', amount: 0, dueDate: todayKey(), periodStart: '', periodEnd: '',
})

const selected = computed(() => payments.value.find((item) => item.id === selectedId.value) ?? payments.value[0] ?? emptyPayment)
const todayCount = computed(() => payments.value.filter((item) => item.status !== 'paid' && item.due <= todayKey()).length)
const expenseTotal = computed(() => expenses.value.reduce((sum, item) => sum + item.amount, 0))
const leaseOptions = computed(() => activeTenants.value.filter((tenant) => tenant.lease_id))

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return payments.value.filter((item) => {
    const tabMatch = tab.value === 'all'
      || (tab.value === 'pending' ? item.status !== 'paid' : tab.value === 'overdue' ? item.overdue : tab.value === 'partial' ? item.partial : item.status === tab.value || item.kind === tab.value)
    const statusMatch = statusFilter.value === 'all' || (statusFilter.value === 'overdue' ? item.overdue : statusFilter.value === 'partial' ? item.partial : item.status === statusFilter.value)
    const groupMatch = groupFilter.value === 'all' || item.group === groupFilter.value
    const keywordMatch = !query || `${item.room} ${item.tenant} ${item.title}`.toLowerCase().includes(query)
    return tabMatch && statusMatch && groupMatch && keywordMatch
  })
})

const groups = computed(() => [...new Set(payments.value.map((item) => item.group))])
const groupSummaries = computed(() => groups.value
  .filter((group) => !groupKeyword.value.trim() || group.toLowerCase().includes(groupKeyword.value.trim().toLowerCase()))
  .map((group) => {
    const rows = payments.value.filter((item) => item.group === group)
    const open = rows.filter((item) => item.status !== 'paid')
    return {
      group,
      count: open.length,
      rooms: new Set(open.map((item) => item.room)).size,
      amount: rows.reduce((sum, item) => sum + item.amount - item.paid, 0),
      rent: open.filter((item) => item.kind === 'rent').length,
      overdue: rows.filter((item) => item.overdue).length,
      water: open.filter((item) => item.kind === 'water').length,
    }
  }))

const expenseColors = ['#5c8163', '#78997e', '#4e8290', '#c3882c', '#8261a3', '#9a8f7c']
const expenseBreakdown = computed(() => {
  const sums = new Map<string, number>()
  for (const item of expenses.value) sums.set(item.category, (sums.get(item.category) ?? 0) + item.amount)
  return [...sums.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount], index) => ({ label, amount, color: expenseColors[index % expenseColors.length] }))
})
const trendBars = computed(() => trend.value.map((point) => ({ ...point, height: point.rate ?? 0 })))

const statusMeta: Record<PaymentStatus, { label: string; cls: string }> = {
  pending: { label: '待收', cls: 'green' }, overdue: { label: '逾期', cls: 'red' }, paid: { label: '已確認', cls: 'blue' }, partial: { label: '部分收款', cls: 'amber' },
}
const methodLabels: Record<PaymentMethod, string> = { 'bank-transfer': '銀行轉帳', cash: '現金', 'line-pay': 'LINE Pay', other: '其他' }
const money = (value: number) => `NT$${value.toLocaleString('zh-TW')}`

function notify(message: string, tone: 'ok' | 'error' = 'ok'): void {
  toast.value = message
  toastTone.value = tone
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, tone === 'error' ? 5200 : 2600)
}

async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '操作失敗，請稍後重試', 'error')
  } finally {
    busy.value = false
  }
}

function openPayment(): void {
  if (!selected.value.chargeId) return
  paymentForm.value = { amount: Math.max(0, selected.value.amount - selected.value.paid), method: 'bank-transfer', paidOn: todayKey(), note: '' }
  paymentOpen.value = true
}

function confirmPayment(): Promise<void> {
  const item = selected.value
  return run(async () => {
    await recordPayment(item.id, paymentForm.value.amount, paymentForm.value.method, paymentForm.value.paidOn, paymentForm.value.note.trim() || undefined)
    paymentOpen.value = false
    notify(`已確認 ${item.room} ${money(paymentForm.value.amount)} 收款`)
  })
}

function reverse(paymentId: number, amount: number): Promise<void> {
  const reason = window.prompt(`沖銷這筆 ${money(amount)} 的收款紀錄，請輸入原因：`)?.trim()
  if (!reason) return Promise.resolve()
  return run(async () => {
    await reversePayment(selected.value.id, paymentId, reason)
    notify('已沖銷，原紀錄保留在活動紀錄中')
  })
}

function sendReminder(): Promise<void> {
  const item = selected.value
  return run(async () => {
    await markPaymentReminded(item.id)
    notify(`已送出站內提醒給 ${item.tenant}`)
  })
}

function addExpense(): Promise<void> {
  if (!expenseForm.value.title.trim() || expenseForm.value.amount <= 0) return Promise.resolve()
  return run(async () => {
    await saveExpense({ ...expenseForm.value, title: expenseForm.value.title.trim(), note: expenseForm.value.note.trim() || undefined })
    expenseOpen.value = false
    notify('已新增支出紀錄')
    expenseForm.value = { title: '', category: '維修', amount: 0, date: todayKey(), note: '' }
  })
}

function openUtility(): void {
  utilityForm.value = { leaseId: leaseOptions.value[0]?.lease_id ?? null, kind: 'electricity', title: '', amount: 0, dueDate: todayKey(), periodStart: '', periodEnd: '' }
  utilityOpen.value = true
}

function saveUtility(): Promise<void> {
  const form = utilityForm.value
  if (!form.leaseId || form.amount <= 0) return Promise.resolve()
  const label = { water: '水費', electricity: '電費', other: '其他費用' }[form.kind]
  return run(async () => {
    await addUtilityCharge({
      lease_id: form.leaseId!, kind: form.kind, title: form.title.trim() || label, amount: form.amount,
      due_date: form.dueDate, period_start: form.periodStart || undefined, period_end: form.periodEnd || undefined,
    })
    utilityOpen.value = false
    tab.value = 'water'
    notify(`已新增${label}帳款`)
  })
}

function changeMonth(event: Event): void {
  void setMonth((event.target as HTMLInputElement).value)
}

watch(payments, (items) => {
  if (items.some((item) => item.id === selectedId.value)) return
  selectedId.value = items[0]?.id ?? ''
}, { immediate: true, flush: 'sync' })

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function exportReport(): void {
  const rows = [['棟別', '房號', '租客', '項目', '期間', '應收', '已收', '未收', '到期日', '狀態'], ...payments.value.map((item) => [item.group, item.room, item.tenant, item.title, item.period, item.amount, item.paid, item.amount - item.paid, item.due, statusMeta[item.status].label])]
  rows.push([], ['支出日期', '項目', '分類', '金額', '來源'], ...expenses.value.map((item) => [item.date, item.title, item.category, item.amount, item.source === 'repair' ? '報修' : '手動']))
  const url = URL.createObjectURL(new Blob([`﻿${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `RentMate-${month.value}財務報表.csv`; anchor.click(); URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="mx-auto max-w-[1640px] space-y-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 class="text-3xl font-black tracking-tight">財務管理</h1><p class="mt-1.5 text-sm text-[#758078]">掌握收支狀況與現金流，集中處理待收、逾期與水電帳單。</p></div>
      <div class="flex flex-wrap gap-2"><label class="btn secondary month-picker"><CalendarDays />{{ monthLabel }}<input type="month" :value="month" aria-label="選擇月份" @change="changeMonth" /></label><button class="btn secondary" @click="exportReport"><Download />匯出報表</button><button class="btn secondary" :disabled="!leaseOptions.length" @click="openUtility"><Droplets />新增水電費</button><button class="btn primary" @click="expenseOpen = true"><Plus />新增支出</button></div>
    </header>

    <nav class="flex gap-2" aria-label="帳務分頁">
      <button class="btn secondary" :aria-pressed="financeSection === 'finance'" @click="financeSection = 'finance'">收支總覽</button>
      <button class="btn secondary" :aria-pressed="financeSection === 'electricity'" @click="financeSection = 'electricity'">電費記錄</button>
    </nav>
    <ElectricityRecords v-if="financeSection === 'electricity'" @saved="refresh" />
    <div v-show="financeSection === 'finance'" class="space-y-5">

    <p v-if="loadError" class="load-error"><AlertTriangle />{{ loadError }}</p>
    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" :aria-busy="loading">
      <article class="metric neutral"><span>應收總額</span><strong>{{ money(total) }}</strong><small>{{ monthLabel }}到期帳款</small><i><ReceiptText /></i></article>
      <article class="metric green"><span>已收總額</span><strong>{{ money(received) }}</strong><small>收款率 {{ rate }}%</small><i><CheckCircle2 /></i></article>
      <article class="metric amber"><span>待收款項</span><strong>{{ money(awaiting) }}</strong><small>{{ payments.filter(p => p.status !== 'paid').length }} 筆待確認（含前期未收）</small><i><WalletCards /></i></article>
      <article class="metric red"><span>逾期款項</span><strong>{{ money(overdue) }}</strong><small>含已部分收款的逾期餘額</small><i><AlertTriangle /></i></article>
      <article class="metric blue"><span>今日需處理</span><strong>{{ todayCount }} 筆</strong><small>到期或已逾期</small><i><CalendarDays /></i></article>
      <article class="metric purple"><span>本月支出</span><strong>{{ money(expenseTotal) }}</strong><small>{{ expenses.length }} 筆（含報修費用）</small><i><Wrench /></i></article>
    </section>

    <section class="grid gap-5 xl:grid-cols-[280px_minmax(500px,1fr)_340px]">
      <aside class="panel overflow-hidden">
        <header class="panel-head"><div><h2>收款群組</h2><p>依棟別查看待處理款項。</p></div></header>
        <div class="p-3"><label class="search"><Search /><input v-model="groupKeyword" placeholder="搜尋棟別" /></label>
          <button v-for="group in groupSummaries" :key="group.group" class="group-card" :class="{ active: groupFilter === group.group }" @click="groupFilter = group.group">
            <div><strong>{{ group.group }}</strong><span>{{ group.count }} 筆</span></div><b>{{ money(group.amount) }}</b><small>{{ group.rooms }} 間房需處理</small>
            <p><em>租金 {{ group.rent }}</em><em class="red">逾期 {{ group.overdue }}</em><em class="blue">水電 {{ group.water }}</em></p>
          </button>
          <p v-if="!groupSummaries.length" class="py-8 text-center text-xs text-[#778078]">{{ loading ? '正在讀取帳務資料…' : '目前沒有帳款。' }}</p>
          <button v-if="groupFilter !== 'all'" class="clear" @click="groupFilter = 'all'">顯示全部群組</button>
        </div>
      </aside>

      <article class="panel overflow-hidden">
        <header class="panel-head"><div><h2>收款任務</h2><p>選取一筆帳款，在右側快速完成操作。</p></div></header>
        <div class="border-b border-[#e7e1d6] p-4"><div class="flex flex-wrap gap-1.5"><button v-for="item in [{v:'all',l:'全部'},{v:'pending',l:'待收'},{v:'rent',l:'租金'},{v:'water',l:'水電'},{v:'overdue',l:'逾期'},{v:'partial',l:'部分收款'},{v:'paid',l:'已確認'}]" :key="item.v" class="tab" :class="{ active: tab === item.v }" @click="tab = item.v as typeof tab">{{ item.l }}</button></div>
          <div class="mt-3 flex gap-2"><label class="search flex-1"><Search /><input v-model="keyword" class="w-full" placeholder="搜尋房號或租客" /></label><select v-model="statusFilter" class="select"><option value="all">全部狀態</option><option value="pending">待收</option><option value="overdue">逾期</option><option value="partial">部分收款</option><option value="paid">已確認</option></select></div>
        </div>
        <div class="max-h-[510px] overflow-auto"><table class="w-full min-w-[680px] text-left text-sm"><thead><tr><th>房號</th><th>租客</th><th>項目</th><th>應收金額</th><th>到期日</th><th>狀態</th><th>操作</th></tr></thead><tbody>
          <tr v-for="item in filtered" :key="item.id" :class="{ selected: item.id === selectedId }" @click="selectedId = item.id"><td><b>{{ item.room }}</b></td><td><b>{{ item.tenant }}</b><small>{{ item.group }}</small></td><td><b>{{ item.title }}</b><small>{{ item.period }}</small></td><td><b>{{ money(item.amount - item.paid) }}</b><small v-if="item.paid">已收 {{ money(item.paid) }}</small></td><td>{{ item.due.replaceAll('-', '/') }}</td><td><span class="badge" :class="statusMeta[item.status].cls">{{ statusMeta[item.status].label }}</span><small v-if="item.overdue && item.partial">已部分收款</small><small v-if="item.tenantReport" class="reported">租客回報已繳</small></td><td><button class="mini" @click.stop="selectedId = item.id; item.status === 'paid' ? notify('此筆款項已完成') : openPayment()"><Check />{{ item.status === 'paid' ? '已完成' : '確認收款' }}</button></td></tr>
          <tr v-if="!filtered.length"><td colspan="7" class="py-12 text-center text-[#778078]">{{ loading ? '正在讀取帳務資料…' : '沒有符合條件的帳款。' }}</td></tr>
        </tbody></table></div>
      </article>

      <aside class="panel overflow-hidden">
        <header class="panel-head"><div><h2>收款摘要／快速操作</h2><p>{{ selected.group }}／{{ selected.room }}</p></div><span class="badge" :class="statusMeta[selected.status].cls">{{ statusMeta[selected.status].label }}</span></header>
        <div class="space-y-4 p-4">
          <div><h3 class="text-xl font-black">{{ selected.room }}／{{ selected.tenant === '—' ? '未填寫' : selected.tenant }}</h3><p class="mt-1 text-sm text-[#768078]">{{ selected.group }}</p></div>
          <div class="grid grid-cols-3 gap-2"><div class="money-box"><span>應收</span><b>{{ money(selected.amount) }}</b></div><div class="money-box"><span>已收</span><b>{{ money(selected.paid) }}</b></div><div class="money-box accent"><span>待收</span><b>{{ money(selected.amount - selected.paid) }}</b></div></div>
          <section v-if="selected.tenantReport" class="report-note"><h4>租客回報已繳款</h4><p>{{ selected.tenantReport.detail }}</p><small>{{ new Date(selected.tenantReport.at).toLocaleString('zh-TW') }}・對完帳後按「確認收款」入帳</small></section>
          <section class="soft"><h4>項目明細</h4><p><span>{{ selected.title }}</span><b>{{ money(selected.amount) }}</b></p><small>{{ selected.period }}</small></section>
          <dl><div><dt>租客資料</dt><dd>{{ selected.tenant === '—' ? '未填寫' : `${selected.tenant}／${selected.tenantBound ? '已綁定帳號' : '未綁定帳號'}` }}</dd></div><div><dt>到期日</dt><dd>{{ selected.due.replaceAll('-', '/') }}</dd></div><div><dt>通知狀態</dt><dd>{{ selected.remindedAt ? `已提醒（${new Date(selected.remindedAt).toLocaleDateString('zh-TW')}）` : selected.tenantBound ? '尚未提醒' : '租客未綁定帳號，無法站內提醒' }}</dd></div></dl>
          <div class="grid gap-2"><button class="btn primary" :disabled="selected.status === 'paid' || !selected.chargeId || busy" @click="openPayment"><CheckCircle2 />確認收款</button><button class="btn secondary" :disabled="selected.status === 'paid' || !selected.chargeId || busy" :title="selected.tenantBound ? '' : '租客接受邀請、綁定帳號後才能收到站內提醒'" @click="sendReminder"><Bell />發送提醒</button><button class="btn secondary" @click="exportReport"><FileSpreadsheet />匯出此月報表</button></div>
          <section v-if="selected.payments.length" class="soft"><h4>入帳紀錄</h4><p v-for="payment in selected.payments" :key="payment.id" class="mt-2"><span>{{ payment.paid_on.replaceAll('-', '/') }} · {{ methodLabels[payment.method] ?? payment.method }}<small v-if="payment.note">{{ payment.note }}</small></span><span class="flex items-center gap-2"><b>{{ money(payment.amount) }}</b><button v-if="payment.amount > 0 && !selected.payments.some((other) => other.note?.startsWith(`沖銷 #${payment.id}`))" class="mini" :disabled="busy" @click="reverse(payment.id, payment.amount)"><Undo2 />沖銷</button></span></p></section>
          <section class="activity"><h4>收款活動紀錄</h4><p v-for="(line, index) in selected.activities" :key="`${index}-${line}`"><i />{{ line }}</p></section>
        </div>
      </aside>
    </section>

    <section class="grid gap-5 lg:grid-cols-3">
      <article class="panel p-5 lg:col-span-2"><div class="flex items-center justify-between"><div><h2 class="text-xl font-black">近 6 個月收款趨勢</h2><p class="mt-1 text-sm text-[#778078]">{{ monthLabel }}收款率 {{ rate }}%，柱高為各月到期帳款的收款率。</p></div><span class="pill">近 6 個月</span></div><div class="chart"><div v-for="point in trendBars" :key="point.month" :title="point.total ? `${point.label}：應收 ${money(point.total)}，已收 ${money(point.received)}` : `${point.label}：沒有到期帳款`"><span :style="{height:`${Math.max(point.rate === null ? 0 : 2, point.height)}%`}" /><small>{{ point.label }}{{ point.rate === null ? '' : ` ${point.rate}%` }}</small></div></div></article>
      <article class="panel p-5"><div class="flex items-center justify-between"><div><h2 class="text-xl font-black">支出分類</h2><p class="mt-1 text-sm text-[#778078]">本月成本結構。</p></div><button class="text-link" @click="expenseOpen = true">新增 <ChevronRight /></button></div><p v-if="!expenseBreakdown.length" class="mt-5 text-sm text-[#778078]">{{ monthLabel }}還沒有支出紀錄。</p><div class="mt-5 space-y-4"><div v-for="row in expenseBreakdown" :key="row.label"><div class="flex justify-between text-sm"><b>{{ row.label }}</b><span>{{ money(row.amount) }}</span></div><div class="mt-1.5 h-2 rounded-full bg-[#e7e1d6]"><i class="block h-full rounded-full" :style="{width:`${Math.max(3,Math.round(row.amount/expenseTotal*100))}%`,background:row.color}" /></div></div></div><p class="mt-5 text-xs text-[#788179]">部分收款已入帳 {{ money(partialReceived) }}；報修由房東負擔的費用會自動列入「維修」。</p></article>
    </section>

    <Transition name="toast"><div v-if="toast" class="toast" :class="{ error: toastTone === 'error' }" role="status"><component :is="toastTone === 'error' ? AlertTriangle : Check" />{{ toast }}</div></Transition>
    <Teleport to="body">
      <div v-if="paymentOpen" class="backdrop" @click.self="paymentOpen = false"><form class="dialog" @submit.prevent="confirmPayment"><header><div><p>{{ selected.room }}／{{ selected.tenant }}</p><h2>確認收款</h2></div><button type="button" class="close" @click="paymentOpen = false"><X /></button></header><div class="space-y-4 p-5"><div class="soft"><p><span>本筆待收金額</span><b>{{ money(selected.amount - selected.paid) }}</b></p></div><label class="field">本次入帳金額<input v-model.number="paymentForm.amount" required min="1" :max="selected.amount - selected.paid" type="number" /></label><div class="grid grid-cols-2 gap-3"><label class="field">入帳方式<select v-model="paymentForm.method"><option v-for="(label, key) in methodLabels" :key="key" :value="key">{{ label }}</option></select></label><label class="field">收款日期<input v-model="paymentForm.paidOn" required type="date" :max="todayKey()" /></label></div><label class="field">備註<input v-model="paymentForm.note" maxlength="200" placeholder="例如：轉帳末五碼 12345" /></label><p class="notice">確認後會保留入帳時間與操作紀錄；部分入帳不會自動結清剩餘款項。記錯了可以沖銷，原紀錄會保留。</p></div><footer><button type="button" class="btn secondary" @click="paymentOpen = false">取消</button><button class="btn primary" :disabled="busy">確認入帳</button></footer></form></div>
      <div v-if="expenseOpen" class="backdrop" @click.self="expenseOpen = false"><form class="dialog" @submit.prevent="addExpense"><header><div><p>保存房務支出與憑證</p><h2>新增支出</h2></div><button type="button" class="close" @click="expenseOpen = false"><X /></button></header><div class="grid gap-4 p-5 sm:grid-cols-2"><label class="field sm:col-span-2">支出項目<input v-model="expenseForm.title" required placeholder="例如：冷氣清洗" /></label><label class="field">分類<select v-model="expenseForm.category"><option>維修</option><option>管理費</option><option>網路</option><option>保險</option><option>其他</option></select></label><label class="field">金額<input v-model.number="expenseForm.amount" required min="1" type="number" /></label><label class="field">付款日期<input v-model="expenseForm.date" required type="date" /></label><label class="field">備註<input v-model="expenseForm.note" maxlength="200" placeholder="例如：發票號碼" /></label></div><footer><button type="button" class="btn secondary" @click="expenseOpen = false">取消</button><button class="btn primary" :disabled="busy">儲存支出</button></footer></form></div>
      <div v-if="utilityOpen" class="backdrop" @click.self="utilityOpen = false"><form class="dialog" @submit.prevent="saveUtility"><header><div><p>依帳單金額向租客收取</p><h2>新增水電費</h2></div><button type="button" class="close" @click="utilityOpen = false"><X /></button></header><div class="grid gap-4 p-5 sm:grid-cols-2"><label class="field sm:col-span-2">租客／房間<select v-model.number="utilityForm.leaseId" required><option v-for="tenant in leaseOptions" :key="tenant.lease_id!" :value="tenant.lease_id">{{ tenant.property_name }} {{ tenant.room_number }}・{{ tenant.name }}</option></select></label><label class="field">費用類別<select v-model="utilityForm.kind"><option value="electricity">電費</option><option value="water">水費</option><option value="other">其他費用</option></select></label><label class="field">金額<input v-model.number="utilityForm.amount" required min="1" type="number" /></label><label class="field sm:col-span-2">項目名稱<input v-model="utilityForm.title" maxlength="100" placeholder="例如：9-10 月電費（120 度）" /></label><label class="field">計費起日<input v-model="utilityForm.periodStart" type="date" /></label><label class="field">計費迄日<input v-model="utilityForm.periodEnd" type="date" :min="utilityForm.periodStart" /></label><label class="field">繳費期限<input v-model="utilityForm.dueDate" required type="date" /></label></div><footer><button type="button" class="btn secondary" @click="utilityOpen = false">取消</button><button class="btn primary" :disabled="busy">建立帳款</button></footer></form></div>
    </Teleport>
    </div>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.panel { @apply rounded-[1.4rem] border border-[#e2dccf] bg-white/90 shadow-[0_10px_28px_rgba(65,70,61,.05)]; }.panel-head { @apply flex items-center justify-between border-b border-[#e7e1d6] p-4; }.panel-head h2 { @apply text-lg font-black; }.panel-head p { @apply mt-1 text-xs text-[#778078]; }
.btn { @apply inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50; }.btn :deep(svg) { @apply h-4 w-4; }.btn.primary { @apply bg-[#5b8263] text-white; }.btn.secondary { @apply border border-[#ded8cc] bg-white; }
.metric { @apply relative min-h-30 overflow-hidden rounded-[1.25rem] border border-[#e2dccf] border-t-[3px] bg-white/90 p-4; }.metric > span,.metric > small { @apply block text-xs font-bold text-[#727c74]; }.metric > strong { @apply my-2 block text-xl font-black; }.metric i { @apply absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full not-italic; }.metric i :deep(svg) { @apply h-4 w-4; }.metric.neutral { @apply border-t-[#8c8b7e]; }.metric.neutral i { @apply bg-[#f0eee8]; }.metric.green { @apply border-t-[#5b8263]; }.metric.green i { @apply bg-[#e7f3e9] text-[#5b8263]; }.metric.amber { @apply border-t-[#c88a2c]; }.metric.amber i { @apply bg-[#fff1dc] text-[#b87920]; }.metric.red { @apply border-t-[#be594c]; }.metric.red i { @apply bg-[#fbe8e5] text-[#b45549]; }.metric.blue { @apply border-t-[#4b8293]; }.metric.blue i { @apply bg-[#e7f2f6] text-[#3f7c8e]; }.metric.purple { @apply border-t-[#8261a3]; }.metric.purple i { @apply bg-[#efe8f7] text-[#7b58a1]; }
.search { @apply relative block; }.search > svg { @apply absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#879087]; }.search input { @apply w-full rounded-full border border-[#dfd8cc] bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-4 focus:ring-[#dcebdd]; }.select { @apply rounded-full border border-[#dfd8cc] bg-white px-4 py-2 text-sm outline-none; }
.group-card { @apply mt-3 block w-full rounded-2xl border border-[#e4ded2] p-4 text-left transition hover:bg-[#f7faf6]; }.group-card.active { @apply border-l-[4px] border-[#6a936f] bg-[#edf7ee]; }.group-card div { @apply flex justify-between; }.group-card div span { @apply rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#5b8263]; }.group-card > b { @apply mt-2 block; }.group-card > small { @apply block text-xs text-[#788179]; }.group-card p { @apply mt-3 flex flex-wrap gap-1; }.group-card em { @apply rounded-full bg-[#e8f3e9] px-2 py-1 text-[10px] font-bold not-italic text-[#56795d]; }.group-card em.red { @apply bg-[#fbe8e5] text-[#a9574d]; }.group-card em.blue { @apply bg-[#e6f2f6] text-[#3f7d8e]; }.clear { @apply mt-3 w-full text-xs font-bold text-[#5b8263] hover:underline; }
.tab { @apply rounded-full px-3 py-2 text-xs font-bold text-[#737c75]; }.tab.active { @apply bg-[#5b8263] text-white; } table thead { @apply sticky top-0 bg-[#fbf9f3] text-xs text-[#747d76]; } th,td { @apply border-b border-[#e9e3d8] px-3 py-3; } tbody tr { @apply cursor-pointer transition hover:bg-[#f7faf6]; } tbody tr.selected { @apply bg-[#eaf5eb]; } td small { @apply block text-xs text-[#788179]; }.badge { @apply inline-flex rounded-full border px-2 py-1 text-[11px] font-bold; }.badge.green { @apply border-[#cce1cf] bg-[#e7f3e9] text-[#54795a]; }.badge.red { @apply border-[#edc9c3] bg-[#fbe9e6] text-[#a7564b]; }.badge.blue { @apply border-[#cbdfe7] bg-[#e7f2f6] text-[#3d788a]; }.badge.amber { @apply border-[#ecd4ae] bg-[#fff1dd] text-[#a56c21]; }.mini { @apply inline-flex items-center gap-1 rounded-full border border-[#c8ddcb] bg-white px-3 py-1.5 text-xs font-bold text-[#55795d]; }.mini :deep(svg) { @apply h-3.5 w-3.5; }
.money-box { @apply rounded-xl border border-[#e4ded2] p-3; }.money-box span { @apply block text-xs text-[#788179]; }.money-box b { @apply mt-1 block text-sm; }.money-box.accent { @apply border-[#ecd3a8] bg-[#fff8eb]; }.soft { @apply rounded-2xl border border-[#e4ded2] bg-[#fbf9f3] p-4; }.soft h4 { @apply font-black; }.soft p { @apply flex items-center justify-between text-sm; }.soft small { @apply mt-1 block text-xs text-[#788179]; } dl { @apply rounded-2xl border border-[#e4ded2] p-4; } dl div { @apply flex justify-between gap-3 py-1.5 text-sm; } dt { @apply text-[#788179]; } dd { @apply text-right font-bold; }.activity h4 { @apply mb-3 font-black; }.activity p { @apply relative ml-1 border-l border-[#cfd9d0] py-2 pl-4 text-xs text-[#657169]; }.activity i { @apply absolute -left-1 top-3 h-2 w-2 rounded-full bg-[#5b8263]; }
.text-link { @apply inline-flex items-center text-xs font-bold text-[#5b8263]; }.text-link :deep(svg) { @apply h-4 w-4; }.pill { @apply rounded-full bg-[#f1eee6] px-3 py-1 text-xs font-bold; }.chart { @apply mt-6 flex h-36 items-end gap-3 border-b border-[#ddd7cb] px-3; }.chart div { @apply flex h-full flex-1 flex-col items-center justify-end gap-2; }.chart span { @apply block w-full max-w-14 rounded-t-xl bg-[linear-gradient(180deg,#7a9c7e,#56795d)]; }.chart small { @apply text-[10px] text-[#788179]; }
.backdrop { @apply fixed inset-0 z-50 grid place-items-center bg-[#24332a]/45 p-3 backdrop-blur-sm; }.dialog { @apply w-full max-w-lg overflow-hidden rounded-[1.5rem] border border-[#e1dacd] bg-[#fffdf8] shadow-2xl; }.dialog > header { @apply flex items-center justify-between border-b border-[#e4ded2] p-5; }.dialog > header p { @apply text-xs text-[#7b847d]; }.dialog > header h2 { @apply text-xl font-black; }.dialog > footer { @apply flex justify-end gap-2 border-t border-[#e4ded2] p-4; }.close { @apply grid h-9 w-9 place-items-center rounded-full border border-[#ded8cc] bg-white; }.close :deep(svg) { @apply h-4 w-4; }.field { @apply block text-sm font-bold; }.field input,.field select { @apply mt-1.5 w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 font-normal outline-none focus:ring-4 focus:ring-[#dcebdd]; }.notice { @apply rounded-xl bg-[#fff3df] p-3 text-xs leading-5 text-[#8f6428]; }
.toast { @apply fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#234c39] px-5 py-3 text-sm font-bold text-white shadow-xl; }.toast :deep(svg) { @apply h-4 w-4; }.toast-enter-active,.toast-leave-active { transition: .2s; }.toast-enter-from,.toast-leave-to { opacity: 0; transform: translate(-50%,8px); }
.month-picker { @apply relative cursor-pointer; }.month-picker input { @apply absolute inset-0 cursor-pointer opacity-0; }
.load-error { @apply flex items-center gap-2 rounded-2xl border border-[#edc9c3] bg-[#fbe9e6] px-4 py-3 text-sm font-bold text-[#a7564b]; }.load-error :deep(svg) { @apply h-4 w-4; }
.toast.error { @apply bg-[#8f3b31]; }
td small.reported { @apply font-bold text-[#3d788a]; }
.report-note { @apply rounded-2xl border border-[#cbdfe7] bg-[#eef6f9] p-4 text-sm text-[#2f6577]; }.report-note h4 { @apply font-black; }.report-note p { @apply mt-1; }.report-note small { @apply mt-1 block text-xs text-[#5b8291]; }
</style>

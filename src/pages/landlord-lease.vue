<script setup lang="ts">
/**
 * 租客看房東平台上的租約：/app/landlord-lease/:leaseId（唯讀）。
 *
 * 這份租約由房東建立與維護；要修改租期、租金請找房東。合約附件是房東上傳的檔案。
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { AlertTriangle, ArrowLeft, FileText } from 'lucide-vue-next'
import { getAuthSession } from '@/src/composables/useAuth'

interface LeaseDetail {
  lease_id: number
  landlord: string
  property: string
  address: string
  room: string
  tenant: string
  start: string
  end: string
  moved_out_at: string | null
  rent: number
  deposit: number
  payment_day: number
  payment_frequency: string
  contract_id: string | null
  status: string
  files: Array<{ id: number; name: string; content_type: string; size: number; uploaded_at: string }>
}

const route = useRoute()
const leaseId = computed(() => String(route.params.leaseId || ''))
const lease = ref<LeaseDetail | null>(null)
const error = ref('')
const loading = ref(true)
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')
const frequency: Record<string, string> = { monthly: '月繳', bimonthly: '每 2 個月', quarterly: '季繳' }
const statusLabel: Record<string, string> = { occupied: '租約生效中', expiring: '即將到期', expired: '已到期', pending: '尚未起租', moved_out: '已退租' }
const money = (value: number) => `NT$${value.toLocaleString('zh-TW')}`
const date = (value: string | null) => (value ? value.replaceAll('-', '/') : '—')

async function request(path: string): Promise<Response> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入租客帳號。')
  const response = await fetch(`${base}/api/tenant/landlord-leases/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : '讀取失敗，請稍後重試。')
  }
  return response
}

onMounted(async () => {
  try {
    lease.value = await (await request(leaseId.value)).json()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '讀取失敗'
  } finally {
    loading.value = false
  }
})

async function download(file: LeaseDetail['files'][number]): Promise<void> {
  try {
    const url = URL.createObjectURL(await (await request(`${leaseId.value}/files/${file.id}`)).blob())
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '下載失敗'
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4 py-4">
    <RouterLink to="/app" class="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
      <ArrowLeft class="h-4 w-4" />回到首頁
    </RouterLink>

    <p v-if="loading" class="text-sm text-muted-foreground">正在讀取租約…</p>
    <p v-if="error" class="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
      <AlertTriangle class="h-4 w-4" />{{ error }}
    </p>

    <template v-if="lease">
      <header>
        <h1 class="text-2xl font-bold tracking-tight">{{ lease.property }} {{ lease.room }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">由 {{ lease.landlord }} 在房東平台上建立與維護。要修改租期或租金，請直接聯絡房東。</p>
      </header>

      <section class="rounded-2xl border bg-card p-5">
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt class="text-muted-foreground">狀態</dt><dd class="font-semibold">{{ statusLabel[lease.status] ?? lease.status }}</dd></div>
          <div><dt class="text-muted-foreground">地址</dt><dd class="font-semibold">{{ lease.address || '房東未填寫' }}</dd></div>
          <div><dt class="text-muted-foreground">租期</dt><dd class="font-semibold">{{ date(lease.start) }} ～ {{ date(lease.end) }}</dd></div>
          <div v-if="lease.moved_out_at"><dt class="text-muted-foreground">退租日</dt><dd class="font-semibold">{{ date(lease.moved_out_at) }}</dd></div>
          <div><dt class="text-muted-foreground">月租</dt><dd class="font-semibold">{{ money(lease.rent) }}</dd></div>
          <div><dt class="text-muted-foreground">押金</dt><dd class="font-semibold">{{ money(lease.deposit) }}</dd></div>
          <div><dt class="text-muted-foreground">繳租</dt><dd class="font-semibold">{{ frequency[lease.payment_frequency] ?? lease.payment_frequency }}，每期 {{ lease.payment_day }} 號</dd></div>
          <div v-if="lease.contract_id"><dt class="text-muted-foreground">合約編號</dt><dd class="font-semibold">{{ lease.contract_id }}</dd></div>
        </dl>
      </section>

      <section class="rounded-2xl border bg-card p-5">
        <h2 class="font-semibold">合約附件</h2>
        <p v-if="!lease.files.length" class="mt-2 text-sm text-muted-foreground">房東還沒有上傳合約檔案。</p>
        <ul v-else class="mt-3 space-y-2">
          <li v-for="file in lease.files" :key="file.id">
            <button type="button" class="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" @click="download(file)">
              <FileText class="h-4 w-4" />{{ file.name }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

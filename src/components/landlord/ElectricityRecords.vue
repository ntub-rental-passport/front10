<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { landlordRequest } from '@/src/services/landlordApiClient'
import ElectricityEntryEditor from '@/src/components/dashboard/ElectricityEntryEditor.vue'
import { cleanUtilityEntry, utilityPreview, utilityReceivable, type UtilityEntry, type UtilityContext } from '@/src/utils/utility-billing'
import { formatIso, startOfToday, formatCurrency } from '@/src/utils/rent-format'
interface Row extends UtilityContext { lease_id: number; property_id: number; property: string; room: string; tenant: string; exists: boolean; saved: UtilityEntry | null; amount: number | null }
const emit = defineEmits<{ saved: [] }>()
const month = ref(formatIso(startOfToday()).slice(0, 7)), propertyId = ref(''), rows = ref<Row[]>([])
const entries = ref<Record<number, UtilityEntry>>({}), selected = ref<Record<number, boolean>>({})
const loading = ref(false), saving = ref(false), error = ref(''), message = ref(''), adding = ref(false)
const dueDate = ref(formatIso(startOfToday())), ocrBusy = ref<Record<number, boolean>>({})
const properties = computed(() => [...new Map(rows.value.map(row => [row.property_id, { id: row.property_id, name: row.property }])).values()])
const visible = computed(() => rows.value.filter(row => String(row.property_id) === propertyId.value))
const selectedRows = computed(() => visible.value.filter(row => selected.value[row.lease_id] && !row.exists))
const total = computed(() => selectedRows.value.reduce((sum, row) => sum + (utilityReceivable(entries.value[row.lease_id]!) ?? 0), 0))
const blocked = computed(() => loading.value || saving.value || Object.values(ocrBusy.value).some(Boolean) || !selectedRows.value.length || selectedRows.value.some(row => utilityPreview(entries.value[row.lease_id]!).error))
let version = 0
async function load() {
  const active = ++version
  loading.value = true; error.value = ''; adding.value = false
  try {
    const result = await landlordRequest<Row[]>(`/landlord/finance/electricity?month=${encodeURIComponent(month.value)}`)
    if (version !== active) return
    rows.value = result; entries.value = {}; selected.value = {}; ocrBusy.value = {}
    if (!result.some(row => String(row.property_id) === propertyId.value)) propertyId.value = String(result[0]?.property_id ?? '')
    for (const row of result) {
      entries.value[row.lease_id] = row.saved || { method: 'meter', payer: 'landlord_collect', previous: row.previous,
        ...(row.rate != null ? { rate: row.rate } : {}), recorded_on: formatIso(startOfToday()) }
      selected.value[row.lease_id] = !row.exists
    }
  } catch (cause) { if (version === active) { rows.value = []; error.value = cause instanceof Error ? cause.message : '讀取失敗' } }
  finally { if (version === active) loading.value = false }
}
watch(month, load, { immediate: true })
async function save() {
  if (blocked.value) return
  saving.value = true; error.value = ''; message.value = ''
  try {
    const result = await landlordRequest<{ saved: number }>('/landlord/finance/electricity', 'POST', {
      property_id: Number(propertyId.value), month: month.value, due_date: dueDate.value,
      rows: selectedRows.value.map(row => ({ lease_id: row.lease_id, entry: cleanUtilityEntry(entries.value[row.lease_id]!) })),
    })
    message.value = `已保存 ${result.saved} 筆電費記錄。`
    emit('saved')
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失敗，請重試。' }
  finally { saving.value = false }
}
</script>
<template>
  <section class="space-y-4 rounded-2xl border bg-white p-4 sm:p-6">
    <div class="flex flex-wrap items-end gap-3">
      <label class="text-sm">帳單月份<input v-model="month" type="month" required :disabled="saving" class="mt-1 block rounded-md border p-2"></label>
      <label class="min-w-48 flex-1 text-sm">房屋<select v-model="propertyId" :disabled="saving || loading" class="mt-1 block w-full rounded-md border bg-white p-2"><option v-for="property in properties" :key="property.id" :value="String(property.id)">{{ property.name }}</option></select></label>
      <button type="button" :disabled="loading || saving || !visible.some(row => !row.exists)" class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" @click="adding = true">新增記錄</button>
    </div>
    <p v-if="loading" role="status">讀取中…</p>
    <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }} <button type="button" class="underline" :disabled="saving" @click="load">重新載入</button></p>
    <p v-if="message" role="status" class="text-sm text-emerald-700">{{ message }}</p>
    <p v-if="!loading && !rows.length" class="text-sm text-slate-500">本月沒有可記錄的租約，請先建立房屋、戶別與租約。</p>
    <form v-if="adding" class="space-y-4" @submit.prevent="save">
      <label class="block text-sm">繳費期限<input v-model="dueDate" type="date" required :disabled="saving" class="mt-1 rounded-md border p-2"></label>
      <article v-for="row in visible" :key="row.lease_id" class="space-y-2">
        <label class="flex items-center gap-2 font-semibold"><input v-model="selected[row.lease_id]" type="checkbox" :disabled="row.exists || saving">{{ row.room }} · {{ row.tenant }}<span class="text-xs text-slate-500">{{ row.exists ? '已記錄' : '待記錄' }}</span></label>
        <ElectricityEntryEditor v-if="selected[row.lease_id] || row.exists" v-model="entries[row.lease_id]!" :context="row" landlord :disabled="row.exists || saving" @busy="ocrBusy[row.lease_id] = $event" />
      </article>
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <span>選取 {{ selectedRows.length }} 戶 · 應收電費 {{ formatCurrency(total) }}</span>
        <button :disabled="blocked" type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </form>
    <div v-else class="space-y-3">
      <article v-for="row in visible" :key="row.lease_id" class="rounded-xl border p-3">
        <p class="font-semibold">{{ row.room }} · {{ row.tenant }} <span class="text-sm text-slate-500">{{ row.exists ? `已記錄 · ${formatCurrency(row.amount || 0)}` : '待記錄' }}</span></p>
        <details v-if="row.saved" class="mt-2"><summary class="cursor-pointer text-sm text-blue-700">查看明細</summary><ElectricityEntryEditor :model-value="row.saved" :context="row" landlord disabled /></details>
      </article>
    </div>
  </section>
</template>

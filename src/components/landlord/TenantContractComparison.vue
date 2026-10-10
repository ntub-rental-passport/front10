<script setup lang="ts">
/**
 * 房東端：租客簽約合約與你登記的租約的對照（只有條件，不含租客合約上的個資）。
 * 有差異時可以修正租約，或寫下說明給租客看；你在對應之後改的條件會留下紀錄。
 */
import { ref, watch } from 'vue'
import {
  fetchLandlordContractLink,
  saveLandlordLinkNote,
  type ContractLink,
} from '@/src/services/utilityEvidenceApi'

const props = defineProps<{ leaseId: number; propertyId?: number }>()
const link = ref<ContractLink | null>(null)
const note = ref('')
const busy = ref(false)
const error = ref('')

async function load() {
  error.value = ''
  try {
    link.value = await fetchLandlordContractLink(props.leaseId)
    note.value = link.value.landlord_note ?? ''
  } catch {
    link.value = null
  }
}
watch(() => props.leaseId, load, { immediate: true })

async function save() {
  if (!note.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    link.value = await saveLandlordLinkNote(props.leaseId, note.value.trim())
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '儲存失敗'
  } finally {
    busy.value = false
  }
}
const fmt = (value: unknown) => (typeof value === 'number' ? value.toLocaleString('zh-TW') : String(value ?? '—'))
</script>

<template>
  <section class="attachments">
    <h3>租客簽約合約對照</h3>
    <p v-if="!link?.linked" class="text-xs text-[#788179]">租客還沒有把自己存的合約對應到這份租約。對應後會逐項比對條件。</p>
    <template v-else>
      <p :class="['text-xs font-bold', link.differences?.length ? 'text-[#a56c21]' : 'text-[#54795a]']">
        {{ link.differences?.length ? `${link.differences.length} 處與租客的合約不同` : '條件與租客的合約一致' }}
      </p>
      <table v-if="link.differences?.length" class="mt-2 w-full text-xs">
        <thead><tr class="text-left text-[#788179]"><th>項目</th><th>租客合約</th><th>你登記的</th></tr></thead>
        <tbody>
          <tr v-for="item in link.differences" :key="item.field" class="border-t border-[#ece6dc]">
            <td class="py-1 font-bold">{{ item.label }}</td><td>{{ fmt(item.contract) }}</td><td>{{ fmt(item.landlord) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="link.differences?.some((item) => item.field === 'address')" class="mt-2 text-xs text-[#6f685d]">
        租屋地址跟著棟別走（同一棟的房間共用），要改請到
        <RouterLink :to="{ path: '/landlord/properties', query: props.propertyId ? { property: props.propertyId, edit: '1' } : {} }" class="font-bold text-[#55795d] underline">房務管理修改棟別地址</RouterLink>。
      </p>
      <div v-if="link.differences?.length" class="mt-2 space-y-1">
        <textarea v-model="note" rows="2" maxlength="2000" class="w-full rounded-lg border border-[#ded7ca] p-2 text-xs" placeholder="說明差異的原因（租客看得到），或直接修改租約讓兩邊一致" />
        <button type="button" class="rounded-full border border-[#c8ddcb] px-3 py-1 text-xs font-bold text-[#55795d] disabled:opacity-50" :disabled="busy || !note.trim()" @click="save">儲存說明</button>
      </div>
      <details v-if="link.term_history?.length" class="mt-2 text-xs">
        <summary class="cursor-pointer">對應後修改條件的紀錄（租客看得到）</summary>
        <p v-for="(entry, index) in link.term_history" :key="index" class="mt-1">
          {{ new Date(entry.at).toLocaleString('zh-TW') }}：{{ entry.changes.map((c) => `${c.label} ${fmt(c.before)} → ${fmt(c.after)}`).join('、') }}
        </p>
      </details>
      <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
    </template>
  </section>
</template>

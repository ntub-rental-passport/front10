<script setup lang="ts">
/**
 * 房東財務頁：一筆帳款跟租客合約不符的地方、租客附的繳款證明、租客的金額異議。
 * 異議可以採用（更正金額）或維持原金額並回覆，兩種都會通知租客。
 */
import { ref } from 'vue'
import {
  landlordEvidencePhotoUrl,
  resolveTenantReading,
  type ChargeMismatch,
  type UtilityEvidence,
} from '@/src/services/utilityEvidenceApi'

const props = defineProps<{ evidence: UtilityEvidence[]; mismatches: ChargeMismatch[] }>()
const emit = defineEmits<{ changed: [] }>()
const busy = ref(false)
const error = ref('')
const replies = ref<Record<number, string>>({})
const money = (value: number | null) => `NT$${(value ?? 0).toLocaleString('zh-TW')}`
const statusLabel = { open: '待你處理', accepted: '已採用', kept: '已維持原金額' }

async function openFile(item: UtilityEvidence) {
  try {
    window.open(await landlordEvidencePhotoUrl(item.id), '_blank', 'noopener')
  } catch {
    error.value = '檔案讀取失敗'
  }
}

async function resolve(item: UtilityEvidence, action: 'accept' | 'keep') {
  const reply = (replies.value[item.id] ?? '').trim()
  if (action === 'keep' && !reply) {
    error.value = '維持原金額時請填寫回覆，讓租客知道原因。'
    return
  }
  if (action === 'accept' && !window.confirm(`把這筆帳款改成租客主張的 ${money(item.amount)}？原金額會留在紀錄中。`)) return
  busy.value = true
  error.value = ''
  try {
    await resolveTenantReading(item.id, action, reply)
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失敗'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="mismatches.length || evidence.some((e) => e.kind !== 'meter_photo' && e.kind !== 'tenant_reading')" class="space-y-2">
    <div v-if="mismatches.length" class="rounded-2xl border border-[#ecd4ae] bg-[#fff6e8] p-3 text-xs text-[#8a5c1c]">
      <b>與租客的簽約合約不符</b>
      <p v-for="item in mismatches" :key="item.label">{{ item.label }}：合約 {{ item.contract }}，你開立 {{ item.landlord }}</p>
    </div>
    <article v-for="item in evidence.filter((e) => e.kind === 'payment_proof')" :key="item.id" class="rounded-2xl border border-[#e4ded2] p-3 text-xs">
      <b>租客附的繳款證明</b>
      <p class="text-[#788179]">{{ new Date(item.created_at).toLocaleString('zh-TW') }}<template v-if="item.note">・{{ item.note }}</template></p>
      <button type="button" class="mt-1 font-bold text-[#3f6e4a] underline" @click="openFile(item)">開啟檔案</button>
    </article>
    <article v-for="item in evidence.filter((e) => e.kind === 'charge_dispute')" :key="item.id" class="rounded-2xl border border-[#e4ded2] p-3 text-xs">
      <b>租客異議：主張 {{ money(item.amount) }}</b>
      <span :class="item.status === 'open' ? 'text-[#a56c21]' : 'text-[#788179]'">・{{ statusLabel[item.status] }}</span>
      <p>理由：{{ item.note }}</p>
      <p v-if="item.response">你的回覆：{{ item.response }}</p>
      <div v-if="item.status === 'open'" class="mt-2 space-y-1">
        <input v-model="replies[item.id]" maxlength="1000" class="w-full rounded-lg border border-[#ded7ca] p-2" placeholder="回覆租客（維持原金額時必填）" />
        <div class="flex gap-2">
          <button type="button" class="rounded-full bg-[#5b8263] px-3 py-1 font-bold text-white disabled:opacity-50" :disabled="busy" @click="resolve(item, 'accept')">採用租客金額</button>
          <button type="button" class="rounded-full border border-[#ded8cc] px-3 py-1 font-bold disabled:opacity-50" :disabled="busy" @click="resolve(item, 'keep')">維持原金額</button>
        </div>
      </div>
    </article>
    <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
  </section>
</template>

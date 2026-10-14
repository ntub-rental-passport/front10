<script setup lang="ts">
/**
 * 房東端：一筆電費的佐證與對帳。
 * - 附電表照片（租客在首頁看得到同一張）
 * - 租客回報的讀數：採用（更正這筆電費）或維持原讀數並回覆
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { readFileAsDataUrl } from '@/src/services/landlordApiClient'
import {
  addMeterPhoto,
  landlordEvidencePhotoUrl,
  resolveTenantReading,
  type UtilityEvidence,
} from '@/src/services/utilityEvidenceApi'

const props = defineProps<{ chargeId: number; evidence: UtilityEvidence[]; landlordReading: string | number | null }>()
const emit = defineEmits<{ changed: [] }>()

const photos = ref<Record<number, string>>({})
const busy = ref(false)
const error = ref('')
const replies = ref<Record<number, string>>({})

async function loadPhotos() {
  for (const item of props.evidence) {
    if (!item.has_photo || photos.value[item.id]) continue
    try {
      photos.value[item.id] = await landlordEvidencePhotoUrl(item.id)
    } catch {
      // 照片讀不到就只顯示文字
    }
  }
}
watch(() => props.evidence, loadPhotos, { immediate: true })
onBeforeUnmount(() => Object.values(photos.value).forEach((url) => URL.revokeObjectURL(url)))

async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失敗，請稍後重試。'
  } finally {
    busy.value = false
  }
}

function attachPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  return run(async () => addMeterPhoto(props.chargeId, file.name, await readFileAsDataUrl(file)))
}

function resolve(item: UtilityEvidence, action: 'accept' | 'keep') {
  const reply = (replies.value[item.id] ?? '').trim()
  if (action === 'keep' && !reply) {
    error.value = '維持原讀數時請填寫回覆，讓租客知道原因。'
    return
  }
  if (action === 'accept' && !window.confirm(`採用租客的讀數 ${item.reading} 度？這筆電費的金額會重新計算，原本的讀數會留在紀錄中。`)) return
  return run(() => resolveTenantReading(item.id, action, reply))
}

const statusLabel = { open: '待你處理', accepted: '已採用', kept: '已維持原讀數' }
</script>

<template>
  <div class="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <strong>電表照片與對帳</strong>
      <label class="cursor-pointer rounded-md border bg-white px-3 py-1 text-xs" :class="{ 'opacity-50': busy }">
        {{ busy ? '處理中…' : '附電表照片' }}
        <input type="file" accept="image/*" class="hidden" :disabled="busy" @change="attachPhoto" />
      </label>
    </div>
    <p v-if="!evidence.length" class="text-xs text-slate-500">還沒有電表照片。附上照片後租客在首頁看得到，可以減少讀數爭議。</p>
    <article v-for="item in evidence" :key="item.id" class="rounded-md border bg-white p-2">
      <div class="flex gap-3">
        <img v-if="photos[item.id]" :src="photos[item.id]" alt="電表照片" class="h-20 w-20 shrink-0 rounded object-cover" />
        <div class="min-w-0 flex-1 text-xs">
          <p class="font-semibold">
            {{ item.kind === 'meter_photo' ? '你附的電表照片' : `租客回報讀數 ${item.reading} 度` }}
            <span v-if="item.kind === 'tenant_reading'" :class="item.status === 'open' ? 'text-amber-700' : 'text-slate-500'">・{{ statusLabel[item.status] }}</span>
          </p>
          <p v-if="item.kind === 'tenant_reading'" class="text-slate-500">你記錄的是 {{ landlordReading ?? '—' }} 度</p>
          <p v-if="item.note" class="text-slate-600">備註：{{ item.note }}</p>
          <p v-if="item.response" class="text-slate-600">你的回覆：{{ item.response }}</p>
          <p class="text-slate-400">{{ new Date(item.created_at).toLocaleString('zh-TW') }}</p>
        </div>
      </div>
      <div v-if="item.kind === 'tenant_reading' && item.status === 'open'" class="mt-2 space-y-2">
        <input v-model="replies[item.id]" maxlength="1000" class="w-full rounded-md border p-2 text-xs" placeholder="回覆租客（維持原讀數時必填）" />
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-md bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50" :disabled="busy" @click="resolve(item, 'accept')">採用租客讀數</button>
          <button type="button" class="rounded-md border px-3 py-1 text-xs disabled:opacity-50" :disabled="busy" @click="resolve(item, 'keep')">維持原讀數</button>
        </div>
      </div>
    </article>
    <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
  </div>
</template>

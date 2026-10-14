<script setup lang="ts">
/**
 * 租客端：房東平台租約的電費明細與對帳。
 * 電費以房東的紀錄為準；租客看得到房東抄的讀數與電表照片，覺得不對可以回報自己的讀數（可附照片）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog/index'
import { Button } from '@/components/ui/button/index'
import type { CycleView } from '@/src/utils/dashboard-contract'
import { formatCurrency, formatDate } from '@/src/utils/rent-format'
import {
  reportMeterReading,
  tenantEvidencePhotoUrl,
  type UtilityEvidence,
} from '@/src/services/utilityEvidenceApi'

const props = defineProps<{ open: boolean; targetCycle: CycleView | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; changed: [] }>()

const photos = ref<Record<number, string>>({})
const reading = ref<number | null>(null)
const note = ref('')
const photoFile = ref<File | null>(null)
const busy = ref(false)
const error = ref('')
const done = ref('')

const cycle = computed(() => props.targetCycle?.cycle ?? null)
const details = computed(() => (cycle.value?.utilityDetails?.electricity ?? null) as Record<string, unknown> | null)
const evidence = computed<UtilityEvidence[]>(() =>
  ((cycle.value?.utilityEvidence ?? []) as UtilityEvidence[]).filter((item) => item.kind === 'meter_photo' || item.kind === 'tenant_reading'),
)
const openReport = computed(() => evidence.value.find((item) => item.kind === 'tenant_reading' && item.status === 'open'))
const methodLabel: Record<string, string> = { meter: '依度數計費', master: '總表分攤', amount: '依台電帳單金額', shared: '依人數分攤', included: '含在租金內', no_bill: '本期無帳單', pending: '尚未記錄' }
const statusLabel = { open: '等待房東處理', accepted: '房東已採用你的讀數', kept: '房東維持原讀數' }

async function loadPhotos() {
  for (const item of evidence.value) {
    if (!item.has_photo || photos.value[item.id]) continue
    try {
      photos.value[item.id] = await tenantEvidencePhotoUrl(item.id)
    } catch {
      // 讀不到就只顯示文字
    }
  }
}
watch(() => [props.open, evidence.value], () => {
  if (!props.open) return
  error.value = ''
  done.value = ''
  void loadPhotos()
}, { immediate: true })
onBeforeUnmount(() => Object.values(photos.value).forEach((url) => URL.revokeObjectURL(url)))

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('照片讀取失敗'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function submit() {
  const chargeId = cycle.value?.electricityChargeId
  if (!chargeId || reading.value === null || reading.value < 0 || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await reportMeterReading(chargeId, {
      reading: reading.value,
      note: note.value.trim(),
      ...(photoFile.value ? { photo: { name: photoFile.value.name, data: await readFile(photoFile.value) } } : {}),
    })
    done.value = '已送出，房東會收到通知。處理結果會出現在通知與這裡。'
    reading.value = null
    note.value = ''
    photoFile.value = null
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '送出失敗，請稍後重試。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[1.5rem]">
      <DialogHeader>
        <DialogTitle>電費明細與對帳</DialogTitle>
        <DialogDescription>
          {{ targetCycle ? `${targetCycle.contractTitle} · 第 ${targetCycle.cycle.periodIndex} 期` : '' }}
          · 由房東在平台上記錄，以房東的紀錄為準
        </DialogDescription>
      </DialogHeader>

      <section class="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
        <p><span class="text-slate-500">本期電費：</span><b>{{ formatCurrency(cycle?.electricityAmount ?? 0) }}</b></p>
        <template v-if="details">
          <p><span class="text-slate-500">計費方式：</span>{{ methodLabel[String(details.method)] ?? details.method }}</p>
          <p v-if="details.previous !== undefined"><span class="text-slate-500">上期讀數：</span>{{ details.previous }} 度</p>
          <p v-if="details.current !== undefined"><span class="text-slate-500">本期讀數：</span>{{ details.current }} 度</p>
          <p v-if="details.rate !== undefined"><span class="text-slate-500">每度：</span>{{ details.rate }} 元</p>
          <p v-if="details.recorded_on"><span class="text-slate-500">抄表日：</span>{{ formatDate(String(details.recorded_on)) }}</p>
        </template>
        <p v-else class="text-slate-500">房東還沒記錄這期電費的計算方式。</p>
      </section>

      <section v-if="evidence.length" class="space-y-2">
        <h3 class="text-sm font-semibold">照片與回報紀錄</h3>
        <article v-for="item in evidence" :key="item.id" class="flex gap-3 rounded-lg border p-2 text-xs">
          <img v-if="photos[item.id]" :src="photos[item.id]" alt="電表照片" class="h-20 w-20 shrink-0 rounded object-cover" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">
              {{ item.kind === 'meter_photo' ? '房東附的電表照片' : `你回報的讀數 ${item.reading} 度` }}
            </p>
            <p v-if="item.kind === 'tenant_reading'" :class="item.status === 'open' ? 'text-amber-700' : 'text-slate-600'">{{ statusLabel[item.status] }}</p>
            <p v-if="item.response" class="text-slate-600">房東回覆：{{ item.response }}</p>
            <p class="text-slate-400">{{ new Date(item.created_at).toLocaleString('zh-TW') }}</p>
          </div>
        </article>
      </section>

      <form v-if="cycle?.electricityChargeId && !openReport" class="space-y-2 border-t pt-3" @submit.prevent="submit">
        <h3 class="text-sm font-semibold">讀數跟你抄的不一樣？</h3>
        <label class="block text-sm">你抄到的本期讀數（度）
          <input v-model.number="reading" type="number" min="0" step="0.1" required class="mt-1 w-full rounded-md border p-2" />
        </label>
        <label class="block text-sm">備註
          <input v-model="note" maxlength="1000" class="mt-1 w-full rounded-md border p-2" placeholder="例如：抄表日期、電表位置" />
        </label>
        <label class="block text-sm">電表照片（選填，房東看得到）
          <input type="file" accept="image/*" class="mt-1 block w-full text-xs" @change="photoFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
        </label>
        <Button type="submit" class="w-full rounded-xl" :disabled="busy || reading === null">{{ busy ? '送出中…' : '回報給房東' }}</Button>
      </form>
      <p v-else-if="openReport" class="text-xs text-slate-500">你回報的讀數房東還在處理，處理完會通知你。</p>
      <p v-else class="text-xs text-slate-500">房東還沒有開立這期的電費，無法回報讀數。</p>
      <p v-if="done" role="status" class="text-sm text-emerald-700">{{ done }}</p>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
    </DialogContent>
  </Dialog>
</template>

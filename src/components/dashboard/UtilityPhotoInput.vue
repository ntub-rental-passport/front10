<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps<{ mode: 'meter' | 'bill'; disabled?: boolean }>()
const emit = defineEmits<{ recognized: [fields: { current?: number; amount?: number }]; busy: [value: boolean] }>()
const busy = ref(false), message = ref(''), preview = ref('')
let controller: AbortController | null = null
let generation = 0
function clear() {
  generation++; controller?.abort(); controller = null
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''; busy.value = false; emit('busy', false); message.value = ''
}
watch(() => props.mode, clear)
onBeforeUnmount(clear)
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]; input.value = ''
  if (!file || props.disabled) return
  clear()
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    message.value = '請選擇 10MB 以下的 JPG、PNG 或 WebP 照片。'; return
  }
  preview.value = URL.createObjectURL(file)
  controller = new AbortController()
  const active = generation
  const timeout = window.setTimeout(() => controller?.abort(), 55000)
  const body = new FormData(); body.append('file', file); body.append('mode', props.mode)
  busy.value = true; emit('busy', true)
  try {
    const response = await fetch('/api/ocr/utility', { method: 'POST', credentials: 'include', body, signal: controller.signal })
    const result = await response.json()
    if (active !== generation) return
    if (!response.ok) throw new Error(result.error || '照片辨識失敗，請稍後再試。')
    emit('recognized', result.fields)
    message.value = result.message
  } catch (error) {
    if (active === generation) message.value = error instanceof Error && error.name !== 'AbortError' ? error.message : '辨識逾時，請重試或手動填寫。'
  } finally {
    window.clearTimeout(timeout)
    if (active === generation) { busy.value = false; emit('busy', false) }
  }
}
</script>
<template>
  <div class="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
    <label class="block text-sm font-medium">{{ mode === 'meter' ? '電表照片' : '台電帳單照片' }}（選填）
      <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="disabled || busy" class="mt-2 block w-full text-xs" @change="upload">
    </label>
    <img v-if="preview" :src="preview" alt="本次辨識照片預覽" class="max-h-32 rounded-md object-contain">
    <p class="text-xs text-slate-500">照片會送交 Google OCR 辨識；此處不保存照片，保存時僅記錄確認後的數值。</p>
    <p role="status" class="text-sm text-sky-700">{{ busy ? '照片辨識中…' : message }}</p>
  </div>
</template>

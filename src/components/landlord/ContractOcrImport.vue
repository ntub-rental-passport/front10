<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertCircle,
  Bot,
  Check,
  FileSearch,
  FileText,
  LoaderCircle,
  Sparkles,
  Upload,
  X,
} from 'lucide-vue-next'
import {
  normalizeContractOcrResult,
  type ContractOcrResult,
} from '@/src/utils/contract-ocr'
import {
  buildContractAutofillData,
  type ContractAutofillData,
} from '@/src/utils/landlord-contract-import'

withDefaults(defineProps<{ compact?: boolean; title?: string }>(), {
  compact: false,
  title: 'AI 契約 OCR 自動填寫',
})

const emit = defineEmits<{
  apply: [data: ContractAutofillData]
  recognized: [result: ContractOcrResult]
}>()

const input = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const result = ref<ContractOcrResult | null>(null)
const extracted = ref<ContractAutofillData | null>(null)
const recognizing = ref(false)
const error = ref('')
const applied = ref(false)

const fileSize = computed(() => {
  const bytes = selectedFile.value?.size ?? 0
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
})
const confidenceLabel = { high: '高信心', medium: '請確認', low: '需校對' }

function chooseFile(): void {
  input.value?.click()
}

function onFile(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  if (!file) return
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(extension ?? '')) {
    error.value = '僅支援 PDF、PNG、JPG、WEBP、BMP 或 TIFF。'
    target.value = ''
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    error.value = '單一檔案不可超過 20MB。'
    target.value = ''
    return
  }
  selectedFile.value = file
  result.value = null
  extracted.value = null
  error.value = ''
  applied.value = false
  target.value = ''
}

function clear(): void {
  selectedFile.value = null
  result.value = null
  extracted.value = null
  error.value = ''
  applied.value = false
}

async function recognize(): Promise<void> {
  if (!selectedFile.value || recognizing.value) return
  recognizing.value = true
  error.value = ''
  const body = new FormData()
  body.append('files', selectedFile.value)
  body.append('languageHints', JSON.stringify(['zh-TW', 'en']))

  try {
    const response = await fetch('/api/ocr', { method: 'POST', body })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || 'OCR 服務暫時無法使用，請稍後再試。')
    const normalized = normalizeContractOcrResult(payload)
    if (!normalized) throw new Error('契約中沒有辨識到可用文字，請改用清晰的掃描檔。')
    normalized.fileName = selectedFile.value.name
    result.value = normalized
    extracted.value = buildContractAutofillData(normalized)
    emit('recognized', normalized)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'OCR 辨識失敗，請稍後再試。'
  } finally {
    recognizing.value = false
  }
}

function applyAll(): void {
  if (!extracted.value) return
  emit('apply', extracted.value)
  applied.value = true
}
</script>

<template>
  <section class="ocr-card" :class="{ compact }">
    <header>
      <span class="ai-icon"><Bot /></span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2"><h3>{{ title }}</h3><em><Sparkles />沿用租客端 OCR</em></div>
        <p>上傳租賃契約，自動擷取租客與租約欄位；套用前可先檢查辨識結果。</p>
      </div>
    </header>

    <input ref="input" class="hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff" @change="onFile" />
    <button v-if="!selectedFile" type="button" class="dropzone" @click="chooseFile">
      <Upload /><span><b>選擇契約 PDF 或照片</b><small>單檔最多 20MB；原始檔僅供本次辨識</small></span>
    </button>
    <div v-else class="selected-file">
      <span><FileText /></span><div class="min-w-0 flex-1"><b>{{ selectedFile.name }}</b><small>{{ fileSize }}</small></div>
      <button v-if="!recognizing" type="button" aria-label="移除檔案" @click="clear"><X /></button>
    </div>

    <div v-if="selectedFile && !extracted" class="mt-3">
      <button type="button" class="recognize" :disabled="recognizing" @click="recognize">
        <LoaderCircle v-if="recognizing" class="animate-spin" /><FileSearch v-else />
        {{ recognizing ? 'AI 正在辨識與抽取欄位…' : '開始 AI OCR 辨識' }}
      </button>
      <div v-if="recognizing" class="progress"><i /></div>
    </div>

    <div v-if="error" class="error"><AlertCircle />{{ error }}</div>

    <div v-if="extracted" class="result">
      <div class="result-head"><div><span><Check />辨識完成</span><b>找到 {{ extracted.fields.length }} 個可帶入欄位</b></div><small v-if="extracted.reviewCount">{{ extracted.reviewCount }} 個欄位建議人工確認</small><small v-else>主要欄位信心良好</small></div>
      <div class="field-list">
        <div v-for="field in extracted.fields" :key="field.key"><span>{{ field.label }}</span><b>{{ typeof field.value === 'number' ? field.value.toLocaleString('zh-TW') : field.value }}</b><em :class="field.confidence">{{ confidenceLabel[field.confidence] }}</em></div>
      </div>
      <p v-if="extracted.missingLabels.length" class="missing">尚未辨識：{{ extracted.missingLabels.join('、') }}。套用後仍可手動補充。</p>
      <button type="button" class="apply" @click="applyAll"><Check />{{ applied ? '已帶入，可繼續修改' : `一鍵帶入 ${extracted.fields.length} 個欄位` }}</button>
      <p class="disclaimer">AI 辨識可能有誤，身分資料、金額、日期與房號請在儲存前再次確認。</p>
    </div>
  </section>
</template>

<style scoped>
@reference "../../index.css";
.ocr-card { @apply overflow-hidden rounded-[1.25rem] border border-[#c8dacb] bg-[linear-gradient(145deg,#f5fbf5,#fffdf8)] p-4; }.ocr-card > header { @apply flex gap-3; }.ai-icon { @apply grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#5b8263] text-white shadow-sm; }.ai-icon :deep(svg) { @apply h-5 w-5; }.ocr-card h3 { @apply text-sm font-black; }.ocr-card header em { @apply inline-flex items-center gap-1 rounded-full bg-[#e3f0e5] px-2 py-1 text-[10px] font-bold not-italic text-[#4f7657]; }.ocr-card header em :deep(svg) { @apply h-3 w-3; }.ocr-card header p { @apply mt-1 text-xs leading-5 text-[#6f7971]; }
.dropzone { @apply mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-dashed border-[#9cb6a0] bg-white/70 px-4 py-4 text-left text-[#54785b] transition hover:bg-white; }.dropzone > svg { @apply h-5 w-5; }.dropzone b,.dropzone small { @apply block; }.dropzone b { @apply text-xs; }.dropzone small { @apply mt-0.5 text-[10px] font-normal text-[#7b847d]; }.selected-file { @apply mt-3 flex items-center gap-3 rounded-xl border border-[#dfe5dc] bg-white px-3 py-2.5; }.selected-file > span { @apply grid h-8 w-8 place-items-center rounded-lg bg-[#e8f3e9] text-[#5b8263]; }.selected-file span :deep(svg) { @apply h-4 w-4; }.selected-file b,.selected-file small { @apply block truncate text-xs; }.selected-file small { @apply mt-0.5 text-[10px] font-normal text-[#7a837c]; }.selected-file button { @apply p-1 text-[#778078]; }.selected-file button :deep(svg) { @apply h-4 w-4; }
.recognize,.apply { @apply flex w-full items-center justify-center gap-2 rounded-full bg-[#294f3d] px-4 py-2.5 text-xs font-black text-white shadow-sm disabled:opacity-60; }.recognize :deep(svg),.apply :deep(svg) { @apply h-4 w-4; }.progress { @apply mt-2 h-1.5 overflow-hidden rounded-full bg-[#dce6dd]; }.progress i { @apply block h-full w-1/2 animate-pulse rounded-full bg-[#5b8263]; }.error { @apply mt-3 flex items-start gap-2 rounded-xl border border-[#edc8c1] bg-[#fff0ed] p-3 text-xs leading-5 text-[#9e4c42]; }.error :deep(svg) { @apply mt-0.5 h-4 w-4 shrink-0; }
.result { @apply mt-3 rounded-xl border border-[#dbe5dc] bg-white p-3; }.result-head { @apply flex flex-wrap items-end justify-between gap-2 border-b border-[#e8e5dc] pb-3; }.result-head > div span { @apply flex items-center gap-1 text-[10px] font-black text-[#4d7655]; }.result-head > div span :deep(svg) { @apply h-3.5 w-3.5; }.result-head b { @apply mt-1 block text-sm; }.result-head > small { @apply text-[10px] text-[#a06a25]; }.field-list { @apply mt-2 grid gap-x-4 sm:grid-cols-2; }.field-list > div { @apply grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[#eeeae1] py-2 text-[11px]; }.field-list span { @apply text-[#7b847d]; }.field-list b { @apply truncate; }.field-list em { @apply rounded-full px-1.5 py-0.5 text-[9px] font-bold not-italic; }.field-list em.high { @apply bg-[#e6f2e8] text-[#52765a]; }.field-list em.medium { @apply bg-[#fff0d8] text-[#a46c21]; }.field-list em.low { @apply bg-[#fbe8e5] text-[#a85349]; }.missing,.disclaimer { @apply mt-2 text-[10px] leading-4 text-[#7a837c]; }.apply { @apply mt-3 bg-[#5b8263]; }.disclaimer { @apply text-center; }
.compact { @apply p-3; }.compact .dropzone { @apply py-3; }
</style>

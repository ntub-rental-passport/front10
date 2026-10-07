<script setup lang="ts">
/**
 * 檢視契約：把校對過的欄位回拼成住宅租賃契約書。
 *
 * 專案刻意不儲存合約原始檔，也不把 OCR 全文明文落地，所以這一頁是使用者
 * 看到「自己的契約」的唯一途徑。兩個資料來源，同一個渲染器：
 *   - 沒有 ?rental= 參數：讀 sessionStorage 的校對結果（同一工作階段，
 *     終版與非終版都看得到，因為欄位就在瀏覽器裡）
 *   - 有 ?rental=<id>：向後端取已存檔的終版契約（個資欄位後端解密）
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadContractOcrResult } from '@/src/utils/contract-ocr'
import {
  buildContractDocument,
  documentValuesFromFieldReviews,
  documentValuesFromRental,
  type ContractDocument,
} from '@/src/utils/contract-document'
import { readStoredContract, encryptContractPdf } from '@/src/services/contractApi'
import { contractPdfPassword, createContractPdf } from '@/src/utils/contract-pdf'
import { Button } from '@/components/ui/button/index'
import { AlertTriangle, ArrowLeft, Loader2, LockKeyhole } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const document_ = ref<ContractDocument | null>(null)
const loading = ref(false)
const loadError = ref('')
const heading = ref('契約內容（由校對欄位回拼）')
const sourceNote = ref('')

const tenantId = ref('')
const exporting = ref(false)
const exportError = ref('')
const exportSuccess = ref(false)
const passwordError = computed(() => {
  try { contractPdfPassword(tenantId.value); return '' } catch (error) { return (error as Error).message }
})

async function downloadEncryptedPdf(): Promise<void> {
  if (!document_.value || exporting.value || passwordError.value) return
  exporting.value = true
  exportError.value = ''
  exportSuccess.value = false
  try {
    const password = contractPdfPassword(tenantId.value)
    const pdf = await createContractPdf(document_.value, heading.value, sourceNote.value)
    const encrypted = await encryptContractPdf(pdf, password)
    const url = URL.createObjectURL(encrypted)
    const link = document.createElement('a')
    link.href = url
    link.download = 'RentMate_住宅租賃契約書_加密.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    exportSuccess.value = true
  } catch (error) {
    exportError.value = error instanceof Error && error.name !== 'TimeoutError'
      ? error.message : '加密等待逾時，尚未下載檔案，請稍後再試。'
  } finally { exporting.value = false }
}

const rentalId = computed(() => {
  const raw = route.query.rental
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})

onMounted(async () => {
  if (rentalId.value === null) {
    const ocrResult = loadContractOcrResult()
    if (!ocrResult?.fieldReviews) {
      loadError.value =
        '這個工作階段沒有校對結果。契約內容不會被存成全文，請回到契約辨識重新上傳，或從已存檔的終版契約開啟。'
      return
    }
    const values = documentValuesFromFieldReviews(ocrResult.fieldReviews)
    tenantId.value = values.tenant_id || ''
    document_.value = buildContractDocument(values)
    sourceNote.value = `來源：本次校對結果（${ocrResult.fileName || '未命名檔案'}），未存入資料庫`
    return
  }

  loading.value = true
  try {
    const stored = await readStoredContract(rentalId.value)
    const values = documentValuesFromRental(stored.rental)
    tenantId.value = values.tenant_id || ''
    document_.value = buildContractDocument(values)
    heading.value = stored.contract_tag
      ? `契約內容：${stored.contract_tag}`
      : `契約內容（租約 #${stored.rental_id}）`
    sourceNote.value = stored.confirmed_at
      ? `來源：已存檔的終版契約，確認於 ${new Date(stored.confirmed_at).toLocaleString('zh-TW')}`
      : '來源：已存檔的終版契約'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '讀取契約失敗，請稍後重試。'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="contract-document-page">
    <header class="doc-toolbar">
      <Button variant="ghost" size="sm" @click="router.back()">
        <ArrowLeft :size="15" data-icon="inline-start" />
        返回
      </Button>
      <div class="doc-toolbar-spacer" />
      <Button
        v-if="document_"
        variant="outline"
        size="sm"
        :disabled="exporting || Boolean(passwordError)"
        @click="downloadEncryptedPdf"
      >
        <Loader2 v-if="exporting" :size="15" class="animate-spin" data-icon="inline-start" />
        <LockKeyhole v-else :size="15" data-icon="inline-start" />
        {{ exporting ? '正在產生加密 PDF…' : '下載加密 PDF' }}
      </Button>
    </header>

    <div v-if="document_" class="doc-export-note" role="status">
      <template v-if="passwordError">{{ passwordError }} <button type="button" @click="router.back()">返回核對資料</button></template>
      <template v-else>{{ exportSuccess ? '已下載加密 PDF。' : '' }}開啟密碼為租客的完整身分證字號，英文字母請輸入大寫。</template>
    </div>
    <p v-if="exportError" class="doc-error" role="alert">{{ exportError }}</p>

    <p v-if="loading" class="doc-status">
      <Loader2 :size="16" class="animate-spin" />
      正在讀取並解密契約欄位…
    </p>

    <div v-else-if="loadError" class="doc-error" role="alert">
      <AlertTriangle :size="18" class="shrink-0" />
      <span>{{ loadError }}</span>
    </div>

    <article v-else-if="document_" class="doc-sheet">
      <div class="doc-sheet-head">
        <p class="doc-sheet-kicker">內政部 113 年 7 月 8 日台內地字第 11302639334 號函修正</p>
        <h1>住宅租賃契約書</h1>
        <p class="doc-sheet-title">{{ heading }}</p>
      </div>

      <!-- 這份文件是欄位還原稿，不是簽署正本。講清楚，避免被當成正式契約使用。 -->
      <aside class="doc-disclaimer">
        本頁由辨識並校對後的欄位回拼而成，僅供核對內容之用，<strong>不等於雙方簽署的契約正本</strong>。
        <template v-if="document_.blankCount">
          其中 {{ document_.blankCount }} 個欄位尚未填寫，以
          <span class="doc-blank">＿＿＿＿</span> 標示：{{ document_.blankLabels.join('、') }}。
        </template>
        <span v-if="sourceNote" class="doc-source">{{ sourceNote }}</span>
      </aside>

      <section v-for="section in document_.sections" :key="section.id" class="doc-section">
        <h2>{{ section.title }}</h2>
        <template v-for="(line, lineIndex) in section.lines" :key="lineIndex">
          <h3 v-if="line.kind === 'aside' && line.subtitle" class="doc-subtitle">
            {{ line.subtitle }}
          </h3>
          <p v-else-if="line.kind === 'aside'" class="doc-note">{{ line.note }}</p>
          <p v-else class="doc-line">
            <template v-for="(segment, segmentIndex) in line.segments" :key="segmentIndex">
              <span v-if="segment.kind === 'literal'">{{ segment.text }}</span>
              <span
                v-else-if="segment.kind === 'value'"
                class="doc-value"
                :class="{ 'doc-value--blank': !segment.filled }"
                :title="segment.label"
              >{{ segment.text }}</span>
              <span v-else class="doc-choice" :title="segment.label">
                <span
                  v-for="option in segment.options"
                  :key="option.text"
                  class="doc-checkbox"
                  :class="{ 'doc-checkbox--checked': option.checked }"
                >{{ option.checked ? '☑' : '☐' }} {{ option.text }}</span>
              </span>
            </template>
          </p>
        </template>
      </section>
    </article>
  </div>
</template>

<style scoped src="./document.css"></style>
<style src="./document-print.css"></style>

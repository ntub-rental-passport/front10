<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  loadContractOcrResult,
  saveContractOcrResult,
  type ContractOcrResult,
} from '@/src/utils/contract-ocr'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import { Separator } from '@/components/ui/separator/index'
import {
  FileText,
  Save,
  AlertTriangle,
  CheckCircle,
  Edit3,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  PenLine,
} from 'lucide-vue-next'

interface ContractField {
  id: string
  label: string
  value: string
  confidence: 'high' | 'medium' | 'low'
  editing: boolean
}

const storedOcrResult = ref<ContractOcrResult | null>(loadContractOcrResult())
const initialPageTexts = storedOcrResult.value?.pageTexts.length
  ? storedOcrResult.value.pageTexts
  : storedOcrResult.value?.text
    ? [storedOcrResult.value.text]
    : []
const ocrPages = ref<string[]>([...initialPageTexts])
const currentPageIndex = ref(0)
const pageCount = computed(() => ocrPages.value.length)
const currentPageNumber = computed(() => currentPageIndex.value + 1)
const ocrFullText = computed(() => ocrPages.value.filter(Boolean).join('\n\n'))
const currentPageText = computed({
  get: () => ocrPages.value[currentPageIndex.value] ?? '',
  set: (value: string) => {
    if (currentPageIndex.value < ocrPages.value.length) {
      ocrPages.value[currentPageIndex.value] = value
    }
  },
})
const hasOcrData = computed(() => Boolean(ocrFullText.value.trim()))

function cleanCapturedValue(value?: string): string {
  return value?.replace(/^[\s:：。．、-]+|[\s。；;]+$/g, '').replace(/\s+/g, ' ').trim() ?? ''
}

function captureFirst(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = cleanCapturedValue(match?.[1])
    if (value) return value
  }
  return ''
}

function makeField(
  id: string,
  label: string,
  value: string,
  confidence: ContractField['confidence'] = 'high',
): ContractField {
  return {
    id,
    label,
    value: value || '尚未辨識',
    confidence: value ? confidence : 'low',
    editing: false,
  }
}

function extractContractFields(text: string): ContractField[] {
  const landlord = captureFirst(text, [
    /出租人\s*[（(][^\r\n）)]*[）)]\s*[：:]\s*([^\r\n]+)/,
    /出租人姓名\s*[：:]\s*([^\r\n]+)/,
    /出租人[^\r\n]*[\r\n]+(?:[^\r\n]*[\r\n]+){0,2}\s*(?:[o○•]\s*)?姓名\s*[：:]\s*([^\r\n]+)/,
  ])
  const tenant = captureFirst(text, [
    /承租人\s*[（(][^\r\n）)]*[）)]\s*[：:]\s*([^\r\n]+)/,
    /承租人姓名\s*[：:]\s*([^\r\n]+)/,
    /承租人[^\r\n]*[\r\n]+(?:[^\r\n]*[\r\n]+){0,2}\s*(?:[o○•]\s*)?姓名\s*[：:]\s*([^\r\n]+)/,
  ])
  const address = captureFirst(text, [
    /租賃住宅地址[\s\S]{0,100}?(?:位置\s*)?[：:]\s*([^\r\n]+)/,
    /(?:租屋地址|房屋地址|租賃標的地址)\s*[：:]\s*([^\r\n]+)/,
    /坐落於\s*([^\r\n，。]+?)(?:之房屋|，|。)/,
  ])
  const dateRange = text.match(
    /租期自\s*(?:民國\s*)?([^\r\n]+?)\s*起至\s*(?:民國\s*)?([^\r\n]+?)\s*止/,
  ) ?? text.match(
    /自\s*(?:民國\s*)?([0-9０-９]{2,3}\s*年\s*[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日)\s*起至\s*(?:民國\s*)?([0-9０-９]{2,3}\s*年\s*[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日)\s*止/,
  )
  const rent = captureFirst(text, [
    /月租金\s*[：:為]?\s*(?:新臺幣|新台幣|NT\$?)?\s*([0-9０-９,，]+)\s*元/,
  ])
  const dueDay = captureFirst(text, [
    /租金\s*每月\s*([0-9０-９]{1,2})\s*日\s*前/,
    /每月\s*([0-9０-９]{1,2})\s*日\s*前\s*繳納/,
  ])
  const deposit = captureFirst(text, [
    /押金[^\r\n]{0,60}?(?:新臺幣|新台幣|NT\$?)\s*([0-9０-９,，]+)\s*元/,
  ])
  const penalty = captureFirst(text, [
    /(?:違約金[^\r\n：:]{0,20}[：:]?|支付相當於)\s*([^\r\n。；;]{1,40}?(?:個月租金|元整|元))/,
  ])

  return [
    makeField('landlord', '出租人（甲方）', landlord),
    makeField('tenant', '承租人（乙方）', tenant),
    makeField('address', '租屋地址', address),
    makeField('start_date', '租期起始', cleanCapturedValue(dateRange?.[1])),
    makeField('end_date', '租期結束', cleanCapturedValue(dateRange?.[2])),
    makeField('rent', '每月租金', rent ? `NT$${rent.replace('，', ',')}` : ''),
    makeField('due_day', '繳租日', dueDay ? `每月 ${dueDay} 日前` : '', 'medium'),
    makeField('deposit', '押金', deposit ? `NT$${deposit.replace('，', ',')}` : '', 'medium'),
    makeField('penalty', '違約金', penalty, 'medium'),
  ]
}

const fields = ref<ContractField[]>(extractContractFields(ocrFullText.value))

const isEditing = ref(false)
const isSaved = ref(false)

const uncertainCount = computed(() =>
  fields.value.filter(f => f.confidence !== 'high').length
)

const confidenceStyle = (level: string) => {
  switch (level) {
    case 'high':   return 'border-green-200 bg-green-50'
    case 'medium': return 'border-amber-300 bg-amber-50'
    case 'low':    return 'border-red-300 bg-red-50'
    default:       return ''
  }
}

const confidenceBadge = (level: string) => {
  switch (level) {
    case 'high':   return { text: '辨識正常',   class: 'bg-green-100 text-green-700' }
    case 'medium': return { text: '待確認',     class: 'bg-amber-100 text-amber-700' }
    case 'low':    return { text: '模糊不確定', class: 'bg-red-100 text-red-700' }
    default:       return { text: '', class: '' }
  }
}

function toggleEdit(field: ContractField) {
  field.editing = !field.editing
}

function handleSave() {
  if (!storedOcrResult.value || !ocrFullText.value.trim()) return

  storedOcrResult.value = {
    ...storedOcrResult.value,
    text: ocrFullText.value,
    pageCount: pageCount.value,
    pageTexts: [...ocrPages.value],
  }
  saveContractOcrResult(storedOcrResult.value)
  isSaved.value = true
}

function goToPage(pageIndex: number): void {
  if (pageIndex < 0 || pageIndex >= pageCount.value) return
  currentPageIndex.value = pageIndex
}

function goToPreviousPage(): void {
  goToPage(currentPageIndex.value - 1)
}

function goToNextPage(): void {
  goToPage(currentPageIndex.value + 1)
}

const router = useRouter()
function goToAnalysis() {
  router.push('/app/contract-analysis')
}

function returnToOcr(): void {
  router.push('/app/contract')
}
</script>

<template>
  <div class="contract-editor-page">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText class="text-primary" />
          契約電子檔編輯
        </h1>
      </div>
      <div class="flex items-center gap-3">
        <Button variant="outline" :disabled="!hasOcrData" @click="isEditing = !isEditing">
          <PenLine v-if="!isEditing" data-icon="inline-start" />
          <Eye v-else data-icon="inline-start" />
          {{ isEditing ? '預覽模式' : '編輯模式' }}
        </Button>
        <Button @click="handleSave" :disabled="isSaved || !hasOcrData">
          <Save data-icon="inline-start" />
          確認儲存
        </Button>
      </div>
    </div>

    <div
      v-if="!hasOcrData"
      class="flex items-center justify-between gap-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
    >
      <div class="flex items-center gap-3">
        <AlertTriangle class="shrink-0 text-red-600" :size="20" />
        <span class="text-sm text-red-800">找不到 OCR 辨識結果，請返回契約辨識頁重新上傳文件。</span>
      </div>
      <Button size="sm" variant="outline" @click="returnToOcr">返回 OCR</Button>
    </div>

    <div
      v-if="uncertainCount > 0 && !isSaved"
      class="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <AlertTriangle class="text-amber-600 shrink-0" :size="20" />
      <span class="text-amber-800 text-sm">
        系統偵測到 <strong>{{ uncertainCount }}</strong> 個欄位辨識結果可能不準確，已以顏色標示，請逐一確認或修正。
      </span>
    </div>

    <div
      v-if="isSaved"
      class="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 px-4 py-3"
    >
      <div class="flex items-center gap-3">
        <CheckCircle class="text-green-600 shrink-0" :size="20" />
        <span class="text-green-800 text-sm">
          契約資料已儲存成功，您可以繼續進行條文風險分析。
        </span>
      </div>
      <Button size="sm" @click="goToAnalysis">
        條文風險分析
        <ArrowRight data-icon="inline-end" />
      </Button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <Card class="contract-document-card lg:col-span-3">
        <CardHeader class="document-reader-heading">
          <CardTitle class="flex items-center gap-2 text-lg">
            <FileText :size="18" />
            契約 PDF 閱讀器
          </CardTitle>
          <CardDescription>一次顯示一頁 OCR 內容，可使用頁碼切換與逐頁修改</CardDescription>
        </CardHeader>
        <CardContent class="document-reader-content">
          <div v-if="pageCount" class="pdf-reader-toolbar">
            <div class="pdf-file-info">
              <strong>{{ storedOcrResult?.fileName || 'OCR 契約文件' }}</strong>
              <span>第 {{ currentPageNumber }} 頁，共 {{ pageCount }} 頁</span>
            </div>

            <nav class="pdf-pagination" aria-label="契約頁面切換">
              <button
                type="button"
                class="page-nav-button"
                :disabled="currentPageIndex === 0"
                aria-label="上一頁"
                @click="goToPreviousPage"
              >
                <ChevronLeft :size="17" />
              </button>
              <button
                v-for="(_, pageIndex) in ocrPages"
                :key="pageIndex"
                type="button"
                class="page-number-button"
                :class="{ 'is-active': pageIndex === currentPageIndex }"
                :aria-current="pageIndex === currentPageIndex ? 'page' : undefined"
                :aria-label="`前往第 ${pageIndex + 1} 頁`"
                @click="goToPage(pageIndex)"
              >
                {{ pageIndex + 1 }}
              </button>
              <button
                type="button"
                class="page-nav-button"
                :disabled="currentPageIndex === pageCount - 1"
                aria-label="下一頁"
                @click="goToNextPage"
              >
                <ChevronRight :size="17" />
              </button>
            </nav>
          </div>

          <div v-if="pageCount" class="pdf-reader-canvas">
            <section class="pdf-page" :aria-label="`契約第 ${currentPageNumber} 頁`">
              <div class="pdf-page-marker">{{ currentPageNumber }}</div>
              <textarea
                v-if="isEditing"
                v-model="currentPageText"
                class="pdf-page-editor"
                :aria-label="`編輯契約第 ${currentPageNumber} 頁`"
              />
              <div v-else class="pdf-page-text">
                {{ currentPageText || '此頁沒有辨識到文字，請切換至編輯模式手動補充。' }}
              </div>
            </section>
          </div>
        </CardContent>
      </Card>

      <div class="lg:col-span-2 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-lg">
              <Edit3 :size="18" />
              關鍵欄位
            </CardTitle>
            <CardDescription>系統自動擷取的欄位，點擊可修改</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-col gap-3">
            <div
              v-for="field in fields"
              :key="field.id"
              class="rounded-lg border p-3 transition-colors"
              :class="confidenceStyle(field.confidence)"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ field.label }}
                </span>
                <Badge
                  variant="secondary"
                  class="text-xs"
                  :class="confidenceBadge(field.confidence).class"
                >
                  {{ confidenceBadge(field.confidence).text }}
                </Badge>
              </div>

              <div v-if="field.editing" class="flex items-center gap-2">
                <input
                  v-model="field.value"
                  class="flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  @keyup.enter="field.editing = false"
                />
                <Button size="sm" variant="ghost" @click="field.editing = false">
                  <CheckCircle :size="16" class="text-green-600" />
                </Button>
              </div>
              <div
                v-else
                class="flex items-center justify-between cursor-pointer group"
                @click="toggleEdit(field)"
              >
                <span class="text-sm font-semibold text-foreground">
                  {{ field.value }}
                </span>
                <PenLine
                  :size="14"
                  class="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="pt-4">
            <p class="text-xs font-medium text-muted-foreground mb-3">辨識信心度圖例</p>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <span class="inline-block size-3 rounded-full bg-green-500" />
                <span class="text-xs text-muted-foreground">辨識正常 — 無需修改</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="inline-block size-3 rounded-full bg-amber-500" />
                <span class="text-xs text-muted-foreground">待確認 — 建議核對原件</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="inline-block size-3 rounded-full bg-red-500" />
                <span class="text-xs text-muted-foreground">模糊不確定 — 請手動修正</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped src="./editor.css"></style>

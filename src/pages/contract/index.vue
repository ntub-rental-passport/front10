<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Progress } from '@/components/ui/progress/index'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import { useRouter } from 'vue-router'
import {
  clearContractOcrResult,
  saveContractOcrResult,
  type ContractOcrResult,
} from '@/src/utils/contract-ocr'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileSearch,
  FileText,
  Globe,
  ImageIcon,
  Languages,
  LockKeyhole,
  PenLine,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
  X,
  Zap,
} from 'lucide-vue-next'

const router = useRouter()

type RecognitionMode = 'quick' | 'standard' | 'precise'

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isUploading = ref(false)
const isDragOver = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('尚未選擇檔案')
const uploadError = ref('')
const copySuccess = ref(false)
const activeTab = ref('preview')
const recognitionMode = ref<RecognitionMode>('standard')
const ocrResult = ref<ContractOcrResult | null>(null)

const defaultLanguageHints = ['zh-TW', 'en']
const maxFileSize = 80 * 1024 * 1024
const supportedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif']

type RecognitionModeOption = {
  id: RecognitionMode
  title: string
  description: string
  meta: string
  dpi: number
}

const standardRecognitionMode: RecognitionModeOption = {
  id: 'standard',
  title: '標準',
  description: '兼顧速度與辨識品質，推薦使用',
  meta: '約 10–20 秒／頁',
  dpi: 180,
}

const recognitionModes: RecognitionModeOption[] = [
  {
    id: 'quick',
    title: '快速',
    description: '適合頁數少、文字清晰的契約',
    meta: '約 5–10 秒／頁',
    dpi: 150,
  },
  standardRecognitionMode,
  {
    id: 'precise',
    title: '精細',
    description: '適合小字、表格或掃描品質較差的文件',
    meta: '約 30–60 秒／頁',
    dpi: 300,
  },
]

const usageSteps = [
  '上傳租賃契約圖片或 PDF 檔案',
  '依文件清晰度選擇辨識品質',
  '系統將契約轉換為可分析文字',
  '檢視結果並進入條款風險分析',
]

const faqItems = [
  {
    question: '哪些檔案格式可以上傳？',
    answer: '目前支援 PDF、PNG、JPG、JPEG、WEBP、BMP 與 TIFF，單一檔案上限為 80MB。PDF 建議先以 5 頁內的租賃契約進行辨識。',
  },
  {
    question: '應該選擇哪一種辨識品質？',
    answer: '一般手機拍攝或掃描的租約可使用「標準」。文件非常清晰且頁數少時可選「快速」；若有小字、表格、印章或低畫質內容，建議使用「精細」。',
  },
  {
    question: '上傳後會立刻進行 OCR 嗎？',
    answer: '不會。選擇檔案後，你仍可檢查檔名與辨識品質，按下「開始 OCR 辨識」後才會送出檔案。',
  },
  {
    question: '辨識結果可以做什麼？',
    answer: 'OCR 結果可供你預覽、複製與進入契約編輯，後續也能銜接條文切段、租賃法規比對、風險標註與 AI 溝通建議。',
  },
  {
    question: '可以辨識手寫文字嗎？',
    answer: '系統可嘗試辨識掃描文件中的手寫內容，但實際結果仍會受到字跡、光線、傾斜與影像清晰度影響。重要欄位請在辨識後再次確認。',
  },
]

const benefits = [
  {
    icon: Scale,
    title: '租賃情境導向',
    description: '辨識後可直接銜接押金、修繕、電費與終止條款等租約風險分析。',
  },
  {
    icon: Languages,
    title: '繁中優先',
    description: '預設以繁體中文與英文作為語言提示，更貼近台灣租賃契約內容。',
  },
  {
    icon: LockKeyhole,
    title: '送出前可確認',
    description: '檔案不會在選取後立即上傳，使用者可先確認檔案與辨識模式。',
  },
  {
    icon: WandSparkles,
    title: '銜接 AI 解析',
    description: 'OCR 文字可繼續進行條款切段、白話說明、法源比對與談判建議。',
  },
]

const selectedMode = computed(() => (
  recognitionModes.find(mode => mode.id === recognitionMode.value) ?? standardRecognitionMode
))

const uploadButtonLabel = computed(() => (
  selectedFile.value ? '更換檔案' : '選擇檔案'
))

const startButtonLabel = computed(() => {
  if (isUploading.value) return 'OCR 辨識中...'
  return '開始 OCR 辨識'
})

const canAnalyze = computed(() => Boolean(ocrResult.value?.text))
const canStartRecognition = computed(() => Boolean(selectedFile.value) && !isUploading.value)

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function openFilePicker(): void {
  fileInput.value?.click()
}

function resetOcrState(keepFile = true): void {
  clearContractOcrResult()
  ocrResult.value = null
  uploadError.value = ''
  uploadProgress.value = 0
  uploadStatus.value = keepFile && selectedFile.value
    ? '檔案已就緒，選擇辨識品質後即可開始'
    : '尚未選擇檔案'
  copySuccess.value = false
}

function removeSelectedFile(): void {
  selectedFile.value = null
  resetOcrState(false)
  if (fileInput.value) fileInput.value.value = ''
}

function validateFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (!supportedExtensions.includes(extension)) {
    return '不支援此檔案格式，請上傳 PDF、PNG、JPG、WEBP、BMP 或 TIFF。'
  }

  if (file.size > maxFileSize) {
    return '檔案大小超過 80MB，請壓縮或拆分文件後再試。'
  }

  return null
}

function prepareFile(file: File): void {
  const validationError = validateFile(file)

  if (validationError) {
    selectedFile.value = null
    uploadError.value = validationError
    uploadStatus.value = '檔案無法使用'
    uploadProgress.value = 0
    return
  }

  selectedFile.value = file
  resetOcrState(true)
}

async function copyRecognizedText(): Promise<void> {
  if (!ocrResult.value?.text) return

  await navigator.clipboard.writeText(ocrResult.value.text)
  copySuccess.value = true
  window.setTimeout(() => {
    copySuccess.value = false
  }, 1800)
}

async function sendToOcr(file: File): Promise<void> {
  uploadError.value = ''
  ocrResult.value = null
  copySuccess.value = false
  isUploading.value = true
  uploadProgress.value = 15
  uploadStatus.value = '檔案已送出，正在準備 OCR 辨識'

  const formData = new FormData()
  formData.append('file', file)
  formData.append('languageHints', JSON.stringify(defaultLanguageHints))
  formData.append('recognitionMode', recognitionMode.value)
  formData.append('dpi', String(selectedMode.value.dpi))

  try {
    uploadProgress.value = 45
    uploadStatus.value = file.type === 'application/pdf'
      ? '正在辨識 PDF 文件與頁面文字'
      : '正在辨識圖片文字與版面'

    const response = await fetch('/api/ocr', {
      method: 'POST',
      body: formData,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.error || 'OCR 服務發生錯誤，請稍後再試。')
    }

    uploadProgress.value = 100
    uploadStatus.value = '辨識完成，可以檢視契約文字與進入後續分析'
    const result = payload as ContractOcrResult
    ocrResult.value = result
    saveContractOcrResult(result)
    activeTab.value = 'preview'
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : 'OCR 服務發生未知錯誤。'
    uploadStatus.value = '辨識失敗，請確認檔案後重新嘗試'
  } finally {
    isUploading.value = false
  }
}

async function startOcrRecognition(): Promise<void> {
  if (!selectedFile.value || isUploading.value) return
  await sendToOcr(selectedFile.value)
}

async function enterContractEditor(): Promise<void> {
  if (!ocrResult.value?.text) return

  if (!saveContractOcrResult(ocrResult.value)) {
    uploadError.value = '無法暫存 OCR 結果，請確認瀏覽器允許工作階段儲存後再試。'
    return
  }

  await router.push('/app/contract/editor')
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return
  prepareFile(file)
  input.value = ''
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = false

  const file = event.dataTransfer?.files?.[0]
  if (!file) return

  prepareFile(file)
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = true
}

function onDragLeave(): void {
  isDragOver.value = false
}
</script>

<template>
  <div class="contract-index-page">
    <header class="contract-hero">
      <div class="hero-copy">
        <div class="hero-icon" aria-hidden="true">
          <FileSearch />
        </div>
        <div>
          <p class="eyebrow">RENTMATE SMART CONTRACT</p>
          <h1>契約分析</h1>
          <p class="hero-description">
            上傳租賃契約圖片或 PDF，先將文件轉成可分析文字，再進行條文切段、風險標註與白話解析。
          </p>
        </div>
      </div>
      <div class="hero-trust-badge">
        <ShieldCheck />
        <span>辨識前可先確認檔案</span>
      </div>
    </header>

    <section class="capability-grid" aria-label="OCR 支援能力">
      <article class="capability-card">
        <div class="capability-icon capability-icon--image"><ImageIcon /></div>
        <div>
          <h2>圖片辨識</h2>
          <p>PNG / JPG / WEBP</p>
        </div>
      </article>

      <article class="capability-card">
        <div class="capability-icon capability-icon--pdf"><FileText /></div>
        <div>
          <h2>PDF 支援</h2>
          <p>多頁文件辨識</p>
        </div>
      </article>

      <article class="capability-card">
        <div class="capability-icon capability-icon--language"><Globe /></div>
        <div>
          <h2>多語言</h2>
          <p>繁中 / 簡中 / 日文 / 英文</p>
        </div>
      </article>

      <article class="capability-card">
        <div class="capability-icon capability-icon--handwriting"><PenLine /></div>
        <div>
          <h2>手寫辨識</h2>
          <p>支援掃描手寫內容</p>
        </div>
      </article>
    </section>

    <section class="ocr-workspace">
      <div class="section-heading">
        <div>
          <p class="section-kicker">UPLOAD & RECOGNIZE</p>
          <h2>上傳租屋契約</h2>
          <p>選擇檔案與辨識品質後，再由 Google Cloud Vision OCR 進行文字擷取。</p>
        </div>
        <Badge variant="outline" class="workspace-badge">單檔上限 80MB</Badge>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif"
        class="sr-only"
        @change="onFileChange"
      >

      <div
        class="upload-dropzone"
        :class="{
          'upload-dropzone--active': isDragOver,
          'upload-dropzone--selected': selectedFile,
        }"
        role="button"
        tabindex="0"
        @click="openFilePicker"
        @keydown.enter.prevent="openFilePicker"
        @keydown.space.prevent="openFilePicker"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
      >
        <template v-if="selectedFile">
          <div class="selected-file-icon"><FileCheck2 /></div>
          <div class="selected-file-copy">
            <p class="selected-file-name">{{ selectedFile.name }}</p>
            <p>{{ selectedFile.type || '未知格式' }} ・ {{ formatFileSize(selectedFile.size) }}</p>
          </div>
          <div class="selected-file-actions" @click.stop>
            <Button variant="outline" size="sm" :disabled="isUploading" @click="openFilePicker">
              <RefreshCcw />
              更換檔案
            </Button>
            <button
              type="button"
              class="remove-file-button"
              :disabled="isUploading"
              aria-label="移除已選擇的檔案"
              @click="removeSelectedFile"
            >
              <X />
            </button>
          </div>
        </template>

        <template v-else>
          <div class="upload-icon"><Upload /></div>
          <div class="upload-copy">
            <h3>拖放檔案到這裡，或點擊選擇</h3>
            <p>支援 PDF、PNG、JPG、WEBP、BMP、TIFF，單一檔案最大 80MB</p>
          </div>
          <Button type="button" variant="outline" class="select-file-button" @click.stop="openFilePicker">
            <Upload />
            {{ uploadButtonLabel }}
          </Button>
        </template>
      </div>

      <div class="quality-section">
        <div class="quality-heading">
          <div>
            <h3>辨識品質</h3>
            <p>依文件清晰度選擇，通常建議使用「標準」。</p>
          </div>
          <span>{{ selectedMode.dpi }} DPI</span>
        </div>

        <div class="quality-grid" role="radiogroup" aria-label="辨識品質">
          <button
            v-for="mode in recognitionModes"
            :key="mode.id"
            type="button"
            class="quality-option"
            :class="{ 'quality-option--selected': recognitionMode === mode.id }"
            role="radio"
            :aria-checked="recognitionMode === mode.id"
            :disabled="isUploading"
            @click="recognitionMode = mode.id"
          >
            <span v-if="recognitionMode === mode.id" class="quality-check"><Check /></span>
            <strong>{{ mode.title }}</strong>
            <small>{{ mode.description }}</small>
            <span class="quality-meta"><Clock3 />{{ mode.meta }}</span>
          </button>
        </div>
      </div>

      <div class="recognition-summary">
        <div>
          <Sparkles />
          <span>
            <strong>{{ selectedMode.title }}模式</strong>
            ・ DPI {{ selectedMode.dpi }} ・ 語言提示：繁體中文、英文
          </span>
        </div>
        <p>選取檔案不會立即上傳，按下開始辨識後才會送出。</p>
      </div>

      <div v-if="selectedFile || uploadError || isUploading || ocrResult" class="recognition-status" aria-live="polite">
        <div class="status-heading">
          <div>
            <p>{{ uploadStatus }}</p>
            <small v-if="selectedFile">{{ selectedFile.name }}</small>
          </div>
          <strong>{{ uploadProgress }}%</strong>
        </div>
        <Progress :model-value="uploadProgress" />

        <div v-if="uploadError" class="status-message status-message--error">
          <AlertTriangle />
          <span>{{ uploadError }}</span>
        </div>

        <div v-for="warning in ocrResult?.warnings || []" :key="warning" class="status-message status-message--warning">
          <AlertTriangle />
          <span>{{ warning }}</span>
        </div>
      </div>

      <Button
        class="recognize-button"
        size="lg"
        :disabled="!canStartRecognition"
        @click="startOcrRecognition"
      >
        <Zap />
        {{ startButtonLabel }}
      </Button>
    </section>

    <Tabs v-if="canAnalyze" v-model="activeTab" class="result-tabs">
      <TabsList class="result-tab-list">
        <TabsTrigger value="preview">契約預覽</TabsTrigger>
        <TabsTrigger value="analysis">分析準備</TabsTrigger>
        <TabsTrigger value="negotiation">AI 談判輔助</TabsTrigger>
      </TabsList>

      <TabsContent value="preview" class="result-tab-content">
        <Card class="result-card">
          <CardHeader>
            <CardTitle class="result-title">
              <FileSearch />
              OCR 辨識結果
            </CardTitle>
            <CardDescription>請先確認重要金額、日期、地址與手寫欄位，再進入後續契約分析。</CardDescription>
          </CardHeader>
          <CardContent class="result-content">
            <div class="result-metrics">
              <div>
                <span>檔案名稱</span>
                <strong>{{ ocrResult?.fileName }}</strong>
              </div>
              <div>
                <span>檔案格式</span>
                <strong>{{ ocrResult?.mimeType }}</strong>
              </div>
              <div>
                <span>辨識頁數</span>
                <strong>{{ ocrResult?.pageCount }} 頁</strong>
              </div>
              <div>
                <span>OCR 引擎</span>
                <strong>{{ ocrResult?.engine }}</strong>
              </div>
            </div>

            <div class="recognized-text">
              {{ ocrResult?.text }}
            </div>
          </CardContent>
          <CardFooter class="result-footer">
            <Button variant="outline" @click="openFilePicker">重新選擇檔案</Button>
            <div>
              <Button variant="outline" @click="copyRecognizedText">
                {{ copySuccess ? '已複製文字' : '複製辨識結果' }}
              </Button>
              <Button @click="enterContractEditor">
                進入契約編輯
                <ArrowRight />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="analysis" class="result-tab-content">
        <div class="analysis-grid">
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="result-title">
                <CheckCircle2 class="success-icon" />
                已具備後續分析基礎
              </CardTitle>
            </CardHeader>
            <CardContent class="analysis-copy">
              <p>目前系統已將契約轉成可分析文字，下一步可進行條號切段、法規比對、風險標註與摘要說明。</p>
              <div>
                <strong>建議流程</strong>
                <span>1. 依條號切段</span>
                <span>2. 對照租賃規範與高風險規則</span>
                <span>3. 產生白話解析與調整建議</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="result-title">
                <AlertTriangle class="warning-icon" />
                辨識後仍需人工確認
              </CardTitle>
            </CardHeader>
            <CardContent class="analysis-copy">
              印章、手寫欄位、模糊影像與表格內容可能存在誤差。進入 AI 分析前，請優先確認租金、押金、日期與地址。
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="negotiation" class="result-tab-content">
        <Card>
          <CardHeader>
            <CardTitle class="result-title">
              <Bot />
              AI 談判輔助
            </CardTitle>
            <CardDescription>依照辨識後的高風險條款，產生可直接調整的溝通話術。</CardDescription>
          </CardHeader>
          <CardContent class="analysis-copy">
            <div>
              <strong>預計輸出內容</strong>
              <span>1. 高風險條款白話解析</span>
              <span>2. 房東溝通腳本與修改方向</span>
              <span>3. 對應法規依據與注意事項</span>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <section class="usage-card">
      <div class="guide-heading">
        <CircleHelp />
        <div>
          <h2>如何使用 RentMate 契約辨識</h2>
          <p>從文件上傳到風險分析，只需要四個步驟。</p>
        </div>
      </div>
      <ol class="usage-steps">
        <li v-for="(step, index) in usageSteps" :key="step">
          <span>{{ index + 1 }}</span>
          <p>{{ step }}</p>
        </li>
      </ol>
    </section>

    <section class="faq-card">
      <div class="guide-heading">
        <CircleHelp />
        <div>
          <h2>常見問題</h2>
          <p>上傳前先了解檔案格式、辨識品質與後續用途。</p>
        </div>
      </div>
      <div class="faq-list">
        <details v-for="item in faqItems" :key="item.question" class="faq-item">
          <summary>
            <span>{{ item.question }}</span>
            <ChevronDown />
          </summary>
          <p>{{ item.answer }}</p>
        </details>
      </div>
    </section>

    <section class="benefits-card">
      <div class="benefits-heading">
        <p class="section-kicker">WHY RENTMATE OCR</p>
        <h2>為租賃契約而設計，不只把文字掃出來</h2>
        <p>保留 RentMate 的租屋管理特色，讓 OCR 成為契約風險分析的第一步。</p>
      </div>
      <div class="benefits-grid">
        <article v-for="benefit in benefits" :key="benefit.title">
          <div><component :is="benefit.icon" /></div>
          <span>
            <strong>{{ benefit.title }}</strong>
            <small>{{ benefit.description }}</small>
          </span>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped src="./index.css"></style>

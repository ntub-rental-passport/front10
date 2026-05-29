<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Progress } from '@/components/ui/progress/index'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileSearch,
  FileText,
  Globe,
  ImageIcon,
  PenLine,
  RefreshCcw,
  Upload,
} from 'lucide-vue-next'

const router = useRouter()

type OcrResult = {
  engine: string
  fileName: string
  mimeType: string
  size: number
  text: string
  pageCount: number
  pageTexts: string[]
  languageHints: string[]
  warnings: string[]
}

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isUploading = ref(false)
const isDragOver = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('尚未開始辨識')
const uploadError = ref('')
const copySuccess = ref(false)
const activeTab = ref('preview')
const ocrResult = ref<OcrResult | null>(null)

const defaultLanguageHints = ['zh-TW', 'en']

const uploadButtonLabel = computed(() => {
  if (isUploading.value) return '辨識中...'
  return ocrResult.value ? '重新辨識檔案' : '選擇檔案'
})

const canAnalyze = computed(() => Boolean(ocrResult.value?.text))

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function openFilePicker(): void {
  fileInput.value?.click()
}

function resetOcrState(): void {
  ocrResult.value = null
  uploadError.value = ''
  uploadProgress.value = 0
  uploadStatus.value = '尚未開始辨識'
  copySuccess.value = false
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
  selectedFile.value = file
  uploadError.value = ''
  ocrResult.value = null
  copySuccess.value = false
  isUploading.value = true
  uploadProgress.value = 15
  uploadStatus.value = '檔案已送出，準備呼叫 Google Cloud Vision OCR'

  const formData = new FormData()
  formData.append('file', file)
  formData.append('languageHints', JSON.stringify(defaultLanguageHints))

  try {
    uploadProgress.value = 45
    uploadStatus.value = file.type === 'application/pdf'
      ? '正在辨識 PDF 文件，Vision API 同步模式適合 5 頁內內容'
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
    uploadStatus.value = '辨識完成，可以進入契約預覽與後續分析'
    ocrResult.value = payload as OcrResult
    activeTab.value = 'preview'
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : 'OCR 服務發生未知錯誤。'
    uploadStatus.value = '辨識失敗'
  } finally {
    isUploading.value = false
  }
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return
  await sendToOcr(file)
  input.value = ''
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  isDragOver.value = false

  const file = event.dataTransfer?.files?.[0]
  if (!file) return

  await sendToOcr(file)
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
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">契約分析</h1>
      <p class="text-muted-foreground">上傳租賃契約圖片或 PDF，先由 Google Cloud Vision OCR 轉成可分析文字，再作為後續條文切段與 AI 解析的基礎。</p>
    </div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardContent class="flex min-h-32 flex-col items-center justify-center gap-3 p-4 text-center sm:min-h-40 sm:gap-4 sm:p-5 xl:min-h-48 xl:p-6">
          <div class="rounded-full bg-primary/10 p-2.5 text-primary sm:p-3 xl:p-4">
            <ImageIcon class="h-4 w-4 sm:h-5 sm:w-5 xl:h-6 xl:w-6" />
          </div>
          <div>
            <p class="text-lg font-semibold xl:text-xl">圖片辨識</p>
            <p class="mt-2 text-sm text-muted-foreground xl:text-base">PNG / JPG / WEBP</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="flex min-h-32 flex-col items-center justify-center gap-3 p-4 text-center sm:min-h-40 sm:gap-4 sm:p-5 xl:min-h-48 xl:p-6">
          <div class="rounded-full bg-destructive/10 p-2.5 text-destructive sm:p-3 xl:p-4">
            <FileText class="h-4 w-4 sm:h-5 sm:w-5 xl:h-6 xl:w-6" />
          </div>
          <div>
            <p class="text-lg font-semibold xl:text-xl">PDF 支援</p>
            <p class="mt-2 text-sm text-muted-foreground xl:text-base">多頁自動處理</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="flex min-h-32 flex-col items-center justify-center gap-3 p-4 text-center sm:min-h-40 sm:gap-4 sm:p-5 xl:min-h-48 xl:p-6">
          <div class="rounded-full bg-emerald-500/10 p-2.5 text-emerald-600 sm:p-3 xl:p-4">
            <Globe class="h-4 w-4 sm:h-5 sm:w-5 xl:h-6 xl:w-6" />
          </div>
          <div>
            <p class="text-lg font-semibold xl:text-xl">多語言</p>
            <p class="mt-2 text-sm text-muted-foreground xl:text-base">繁中 / 簡中 / 日文 / 英文</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="flex min-h-32 flex-col items-center justify-center gap-3 p-4 text-center sm:min-h-40 sm:gap-4 sm:p-5 xl:min-h-48 xl:p-6">
          <div class="rounded-full bg-violet-500/10 p-2.5 text-violet-500 sm:p-3 xl:p-4">
            <PenLine class="h-4 w-4 sm:h-5 sm:w-5 xl:h-6 xl:w-6" />
          </div>
          <div>
            <p class="text-lg font-semibold xl:text-xl">手寫辨識支援</p>
            <p class="mt-2 text-sm text-muted-foreground xl:text-base">支援掃描手寫文字辨識</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card class="rounded-3xl">
      <CardHeader class="space-y-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>上傳租屋契約</CardTitle>
            <CardDescription class="mt-2">前端上傳後會呼叫本機 `/api/ocr`，由後端使用 Google Cloud Vision `DOCUMENT_TEXT_DETECTION` 進行辨識。預設會以繁中 + 英文作為語言提示。</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-5">
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif"
          class="hidden"
          @change="onFileChange"
        >

        <div
          class="rounded-[2rem] border-2 border-dashed p-8 text-center transition-colors"
          :class="isDragOver ? 'border-primary bg-primary/5' : 'border-primary/30 bg-muted/20'"
          @drop="onDrop"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
        >
          <div class="mx-auto flex max-w-xl flex-col items-center gap-4">
            <div class="rounded-full bg-primary/10 p-4">
              <Upload class="h-8 w-8 text-primary" />
            </div>
            <div class="space-y-2">
              <h3 class="text-xl font-semibold">拖放檔案到這裡，或點擊選擇檔案</h3>
              <p class="text-sm text-muted-foreground">支援 PDF、PNG、JPG、WEBP、BMP、TIFF。PDF 同步辨識建議先以 5 頁內文件為主。</p>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-3">
              <Button :disabled="isUploading" @click="openFilePicker">
                <Upload class="mr-2 h-4 w-4" />
                {{ uploadButtonLabel }}
              </Button>
              <Button v-if="selectedFile" variant="outline" :disabled="isUploading" @click="resetOcrState">
                <RefreshCcw class="mr-2 h-4 w-4" />
                清除結果
              </Button>
            </div>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
          <Card class="rounded-3xl border-border/70">
            <CardHeader class="pb-3">
              <CardTitle class="text-lg">辨識狀態</CardTitle>
              <CardDescription>這裡會顯示目前上傳的檔案與 OCR 流程狀態。</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">OCR 引擎：Google Cloud Vision</Badge>
                <Badge variant="outline">方法：DOCUMENT_TEXT_DETECTION</Badge>
                <Badge variant="outline">語言提示：{{ defaultLanguageHints.join(', ') }}</Badge>
              </div>

              <div class="rounded-2xl bg-muted/40 p-4">
                <p class="text-sm text-muted-foreground">目前檔案</p>
                <p class="mt-1 break-all font-semibold">{{ selectedFile?.name || '尚未選擇檔案' }}</p>
                <p v-if="selectedFile" class="mt-1 text-sm text-muted-foreground">
                  {{ selectedFile.type || '未知格式' }} ・ {{ formatFileSize(selectedFile.size) }}
                </p>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-muted-foreground">{{ uploadStatus }}</span>
                  <span class="font-medium text-foreground">{{ uploadProgress }}%</span>
                </div>
                <Progress :model-value="uploadProgress" />
              </div>

              <div v-if="uploadError" class="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {{ uploadError }}
              </div>

              <div v-if="ocrResult?.warnings.length" class="space-y-2">
                <div
                  v-for="warning in ocrResult.warnings"
                  :key="warning"
                  class="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800"
                >
                  {{ warning }}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card class="rounded-3xl border-border/70">
            <CardHeader class="pb-3">
              <CardTitle class="text-lg">MVP 範圍</CardTitle>
              <CardDescription>先把「可上傳、可辨識、可預覽」做穩，後續再接租約條文風險分析。</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3 text-sm text-muted-foreground">
              <div class="rounded-2xl border bg-background p-4">
                <p class="font-medium text-foreground">1. 圖片 OCR</p>
                <p class="mt-1">使用 Vision `documentTextDetection` 直接抽取圖片中的租約文字。</p>
              </div>
              <div class="rounded-2xl border bg-background p-4">
                <p class="font-medium text-foreground">2. PDF OCR</p>
                <p class="mt-1">使用 Vision `batchAnnotateFiles` 做同步文件辨識，適合先處理小型租約。</p>
              </div>
              <div class="rounded-2xl border bg-background p-4">
                <p class="font-medium text-foreground">3. 後續 AI</p>
                <p class="mt-1">等 OCR 穩定後，再把文字送進 Gemini 做切段、風險比對與談判腳本。</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>

    <Tabs v-if="canAnalyze" v-model="activeTab" class="w-full">
      <TabsList class="grid w-full grid-cols-3">
        <TabsTrigger value="preview">契約預覽</TabsTrigger>
        <TabsTrigger value="analysis">分析準備</TabsTrigger>
        <TabsTrigger value="negotiation">AI 談判輔助</TabsTrigger>
      </TabsList>

      <TabsContent value="preview" class="mt-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <FileSearch class="h-5 w-5 text-primary" />
              OCR 辨識結果
            </CardTitle>
            <CardDescription>這裡顯示 Vision API 回傳的原始文字，可作為後續切段與風險分析輸入。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid gap-3 md:grid-cols-4">
              <div class="rounded-2xl border bg-muted/30 p-4">
                <p class="text-sm text-muted-foreground">檔案名稱</p>
                <p class="mt-1 font-semibold">{{ ocrResult?.fileName }}</p>
              </div>
              <div class="rounded-2xl border bg-muted/30 p-4">
                <p class="text-sm text-muted-foreground">檔案格式</p>
                <p class="mt-1 font-semibold">{{ ocrResult?.mimeType }}</p>
              </div>
              <div class="rounded-2xl border bg-muted/30 p-4">
                <p class="text-sm text-muted-foreground">辨識頁數</p>
                <p class="mt-1 font-semibold">{{ ocrResult?.pageCount }} 頁</p>
              </div>
              <div class="rounded-2xl border bg-muted/30 p-4">
                <p class="text-sm text-muted-foreground">OCR 引擎</p>
                <p class="mt-1 font-semibold">{{ ocrResult?.engine }}</p>
              </div>
            </div>

            <div class="rounded-2xl bg-muted p-4">
              <div class="max-h-[32rem] overflow-y-auto overflow-x-hidden font-mono text-sm whitespace-pre-wrap break-words">
                {{ ocrResult?.text }}
              </div>
            </div>
          </CardContent>
          <CardFooter class="justify-between">
            <Button variant="outline" @click="openFilePicker">重新選擇檔案</Button>
            <div class="flex items-center gap-2">
              <Button variant="outline" @click="copyRecognizedText">
                {{ copySuccess ? '已複製文字' : '複製辨識結果' }}
              </Button>
              <Button @click="router.push('/app/contract/editor')">
                進入契約編輯
                <ArrowRight class="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="analysis" class="mt-4">
        <div class="space-y-4">
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="flex items-center gap-2">
                <CheckCircle2 class="h-5 w-5 text-emerald-600" />
                OCR 已完成，已具備後續分析基礎
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-4 text-sm text-muted-foreground">
              <p>目前系統已能把你上傳的契約圖片或 PDF 轉成可分析文字。下一步就可以把這段文字送進 Gemini，做條文切段、法規比對、風險標註與摘要說明。</p>
              <div class="rounded-2xl border bg-muted/20 p-4">
                <p class="font-medium text-foreground">建議的下一階段流程</p>
                <p class="mt-2">1. 將 OCR 全文依條號切段</p>
                <p>2. 對照租賃法規與高風險規則庫</p>
                <p>3. 讓 Gemini 產生白話解析與談判建議</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="flex items-center gap-2">
                <AlertTriangle class="h-5 w-5 text-amber-600" />
                目前還沒做的事
              </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
              這一版先把 OCR 接起來，因此還沒有直接顯示「押金超收」、「修繕責任轉嫁」這類 AI 判斷結果，避免用假資料誤導使用者。
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="negotiation" class="mt-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Bot class="h-5 w-5 text-primary" />
              AI 談判輔助
            </CardTitle>
            <CardDescription>等 Gemini 風險分析接上後，這裡就能依照高風險條款產生可直接複製的溝通話術。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4 text-sm text-muted-foreground">
            <div class="rounded-2xl border bg-primary/5 p-4">
              <p class="font-medium text-foreground">預計輸出內容</p>
              <p class="mt-2">1. 針對每個高風險條款產生白話解析</p>
              <p>2. 提供房東溝通腳本與調整建議</p>
              <p>3. 附上對應法規依據，讓租客更有底氣</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>

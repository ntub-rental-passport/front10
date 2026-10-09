<script setup lang="ts">
/**
 * 入住前點交（合併操作 + 彙整 + 雙格式匯出）
 * ---------------------------------------------------------
 * 這頁同時負責：
 *   1. 操作：新增點交項目、拍攝搬入照、重拍、刪除
 *   2. 彙整：依房間自動分組、搜尋、篩選
 *   3. 匯出：下載兩種格式的 PDF
 *      - 條列清單：每項一行，含勾選框與空白備註欄，列印帶去現場用
 *      - 完整證據包：每項含縮圖、AI 信心、時間、備註，作為退租依據存檔
 */
import SmartCaptureCamera, {
  type CapturePayload,
} from '@/src/components/handover/SmartCaptureCamera.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Plus,
  Sparkles,
  Clock,
  Building2,
  ArrowLeft,
  Trash2,
  Search,
  FileDown,
  FileText,
  ChevronDown,
  Filter,
  X,
} from 'lucide-vue-next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog/index'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'

import { useHandover, type HandoverItem, type CaptureQuality, type CaptureSource } from '@/src/composables/useHandover'
import {
  firstEvidenceOfPhase,
  formatHandoverTimestamp,
  groupItemsByRoom,
  hasEvidenceInPhase,
} from '@/src/utils/handover'
import {
  generateHandoverChecklistPdf,
  generateHandoverBaselinePdf,
  downloadHandoverPdf,
} from '@/src/utils/handover-pdf'
import { handoverPdfFileName } from '@/src/utils/handover-export'

// ---------- AR 相機彈窗狀態 ---------- //
const showCameraDialog = ref(false)
const activeTargetItem = ref<HandoverItem | null>(null)

function openCaptureModal(item: HandoverItem) {
  if (busy.value) return
  activeTargetItem.value = item
  showCameraDialog.value = true
}

const router = useRouter()
const {
  properties,
  currentProperty,
  selectProperty,
  itemsOfCurrentProperty,
  addItems,
  removeItem,
  addEvidence,
  retryAnalysis,
  busy,
  analyzingItemId,
  error,
  reload,
} = useHandover()

// ---------- 新增點交項目 ---------- //

const showAddItemDialog = ref(false)
// 同一個房間可以一次輸入多個物品，按「新增」才一起送出
const newRoom = ref('')
const newNames = ref<string[]>([])
const nameDraft = ref('')

// 輸入框裡還沒按加號的文字也算在內，免得使用者以為打了就會送出
const pendingNames = computed(() => {
  const draft = nameDraft.value.trim()
  return draft ? [...newNames.value, draft] : newNames.value
})

function addDraftName() {
  const name = nameDraft.value.trim()
  if (!name) return
  newNames.value.push(name)
  nameDraft.value = ''
}

function removeName(index: number) {
  newNames.value.splice(index, 1)
}

async function submitAddItem() {
  if (!currentProperty.value) return
  const room = newRoom.value.trim()
  if (!room || pendingNames.value.length === 0) return
  const failed = await addItems(room, pendingNames.value)
  if (!failed) return
  if (failed.length) {
    // 只留下沒建成的，讓使用者可以直接再按一次
    newNames.value = failed
    nameDraft.value = ''
    return
  }
  newRoom.value = ''
  newNames.value = []
  nameDraft.value = ''
  showAddItemDialog.value = false
}

// ---------- 拍照與上傳存證---------- //

function resizeImage(file: File, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('image read failed'))
    reader.onload = (event) => {
      const img = new Image()
      img.onerror = () => reject(new Error('image decode failed'))
      img.onload = () => {
        let width = img.naturalWidth
        let height = img.naturalHeight

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('canvas context unavailable'))
          return
        }

        context.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }

      img.src = event.target?.result as string
    }

    reader.readAsDataURL(file)
  })
}

async function processPhotoWithAI(item: HandoverItem, dataUrl: string, source: CaptureSource, quality: CaptureQuality | null) {
  await addEvidence(item.id, 'baseline', { url: dataUrl, source, quality })
}

// 相機拍照回傳
async function handlePhotoCaptured(payload: CapturePayload) {
  if (!activeTargetItem.value) return
  await processPhotoWithAI(activeTargetItem.value, payload.dataUrl, payload.source, payload.quality)
}

// 本地檔案上傳
async function capturePhoto(itemId: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.display = 'none'
  document.body.appendChild(input)

  input.onchange = async () => {
    const file = input.files?.[0]
    document.body.removeChild(input)
    if (!file) return

    const targetItem = itemsOfCurrentProperty.value.find((it) => it.id === itemId)
    if (!targetItem) return

    try {
      const dataUrl = await resizeImage(file)
      await processPhotoWithAI(targetItem, dataUrl, 'file', null)
    } catch (cause) {
      error.value = '無法讀取圖片，請重新選擇圖片檔案。'
      console.error('圖片壓縮或處理失敗:', cause)
    }
  }

  input.click()
}

// ---------- 搜尋 / 篩選 ---------- //

const keyword = ref('')
const onlyDone = ref(false)

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return itemsOfCurrentProperty.value.filter((it) => {
    const baselineEv = firstEvidenceOfPhase(it, 'baseline')
    if (onlyDone.value && !baselineEv) return false
    if (!kw) return true
    return (
      it.name.toLowerCase().includes(kw) ||
      it.room.toLowerCase().includes(kw) ||
      (baselineEv?.note ?? '').toLowerCase().includes(kw)
    )
  })
})

// ---------- 依房間分組 ---------- //

type Grouped = { room: string; items: HandoverItem[] }
const groupedByRoom = computed<Grouped[]>(() => groupItemsByRoom(filteredItems.value))

// ---------- 統計 ---------- //

const stats = computed(() => {
  const all = itemsOfCurrentProperty.value
  return {
    total: all.length,
    done: all.filter((it) => hasEvidenceInPhase(it, 'baseline')).length,
    rooms: new Set(all.map((it) => it.room)).size,
  }
})

// ---------- 匯出（雙格式）---------- //

const exporting = ref<'checklist' | 'baseline' | null>(null)
const exportError = ref('')

async function exportPdf(kind: 'checklist' | 'baseline') {
  // 產生 PDF 期間仍可切換租屋處，檔名必須沿用這次匯出的租屋處。
  const property = currentProperty.value
  if (!property) return
  exporting.value = kind
  exportError.value = ''
  try {
    const bytes = kind === 'checklist'
      ? await generateHandoverChecklistPdf(property, itemsOfCurrentProperty.value)
      : await generateHandoverBaselinePdf(property, itemsOfCurrentProperty.value)
    downloadHandoverPdf(bytes, handoverPdfFileName(kind, property.alias))
  } catch (cause) {
    exportError.value = cause instanceof Error ? cause.message : '匯出失敗，請稍後重試。'
  } finally {
    exporting.value = null
  }
}

// ---------- 工具 ---------- //

function firstBaseline(it: HandoverItem) {
  return firstEvidenceOfPhase(it, 'baseline')
}

function fmtDate(iso: string) {
  return formatHandoverTimestamp(iso)
}
</script>

<template>
  <div class="space-y-6" :aria-busy="busy">
    <p v-if="busy" role="status" class="text-sm text-muted-foreground">
      正在載入或儲存點交資料，AI 分析可能需要一分鐘…
    </p>
    <div
      v-if="error"
      role="alert"
      class="rounded-md border border-destructive p-3 text-sm text-destructive"
    >
      {{ error }}
      <Button variant="outline" size="sm" :disabled="busy" @click="reload">重新載入</Button>
    </div>
    <div
      v-if="exportError"
      role="alert"
      class="rounded-md border border-destructive p-3 text-sm text-destructive"
    >
      {{ exportError }}
    </div>
    <div class="space-y-6">
      <!-- 麵包屑 + 標題 -->
      <div class="space-y-2">
        <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/app/handover')">
          <ArrowLeft class="mr-1 h-4 w-4" /> 返回點交總覽
        </Button>
        <div>
          <h1 class="text-3xl font-bold tracking-tight">入住前點交</h1>
          <p class="text-muted-foreground">
            搬入時建立家具與設備清單、逐項拍攝，並可匯出條列清單或完整證據包。
          </p>
        </div>
      </div>

      <!-- 租屋處選擇 + 統計 -->
      <Card>
        <CardContent class="pt-6">
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex-1 min-w-[240px] space-y-1">
              <Label class="flex items-center gap-1 text-xs">
                <Building2 class="h-3 w-3" /> 目前租屋處
              </Label>
              <Select
                :disabled="busy"
                :model-value="currentProperty?.id ?? ''"
                @update:model-value="(v) => selectProperty(String(v))"
              >
                <SelectTrigger>
                  <SelectValue placeholder="請選擇租屋處" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="p in properties" :key="p.id" :value="p.id">
                    {{ p.alias }}（{{ p.address }}）
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p v-if="currentProperty?.source === 'landlord'" class="mt-3 rounded-md bg-sky-50 p-2 text-xs text-sky-800">
            這是房東平台上的租約：你在這裡的點交照片與辨識結果，房東也看得到（只能看、不能改），退租時雙方可以對照。
          </p>
          <div v-if="currentProperty" class="mt-4 grid grid-cols-3 gap-2 text-sm">
            <div class="rounded-md border p-2">
              <div class="text-xs text-muted-foreground">已存證</div>
              <div class="font-semibold">{{ stats.done }} / {{ stats.total }} 項</div>
            </div>
            <div class="rounded-md border p-2">
              <div class="text-xs text-muted-foreground">涵蓋房間</div>
              <div class="font-semibold">{{ stats.rooms }} 個</div>
            </div>
            <div class="rounded-md border p-2">
              <div class="text-xs text-muted-foreground">總點交項目</div>
              <div class="font-semibold">{{ stats.total }} 項</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 工具列：新增 / 搜尋 / 篩選 / 兩種匯出 -->
      <div v-if="currentProperty" class="flex flex-wrap items-center gap-3 border-b pb-3 sm:flex-nowrap">
        <Dialog v-model:open="showAddItemDialog">
          <DialogTrigger as-child>
            <Button size="sm"> <Plus class="mr-1 h-4 w-4" /> 新增點交項目 </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增點交項目</DialogTitle>
              <DialogDescription>先填房間，再列出這個房間的所有物品，最後一次新增。</DialogDescription>
            </DialogHeader>
            <div class="space-y-3 py-2">
              <div class="space-y-1">
                <Label>房間</Label>
                <Input v-model="newRoom" placeholder="例如：客廳" />
              </div>
              <div class="space-y-2">
                <Label for="handover-new-name">物品名稱</Label>
                <div class="flex items-center gap-2">
                  <Input
                    id="handover-new-name"
                    v-model="nameDraft"
                    placeholder="例如：沙發，按 + 或 Enter 加入"
                    @keydown.enter.prevent="addDraftName"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="加入這項物品"
                    :disabled="!nameDraft.trim()"
                    @click="addDraftName"
                  >
                    <Plus class="h-4 w-4" />
                  </Button>
                </div>
                <div
                  v-for="(name, index) in newNames"
                  :key="`${index}-${name}`"
                  class="flex items-center gap-2"
                >
                  <Input :model-value="name" readonly tabindex="-1" class="bg-muted/40" />
                  <Button
                    size="icon"
                    variant="outline"
                    :aria-label="`移除 ${name}`"
                    @click="removeName(index)"
                  >
                    <X class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" @click="showAddItemDialog = false">取消</Button>
              <Button
                :disabled="busy || !newRoom.trim() || pendingNames.length === 0"
                @click="submitAddItem"
                >新增 {{ pendingNames.length || '' }} 項</Button
              >
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div class="order-first w-full sm:order-none sm:w-auto sm:flex-1">
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋物品、房間或備註" class="pl-8" />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="sm" :disabled="exporting !== null">
              {{ exporting ? '產生 PDF 中…' : '匯出' }}
              <ChevronDown class="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem :disabled="exporting !== null" @select="exportPdf('checklist')">
              <FileText class="h-4 w-4" /> 匯出條列清單
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="exporting !== null" @select="exportPdf('baseline')">
              <FileDown class="h-4 w-4" /> 匯出完整證據包
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          :variant="onlyDone ? 'default' : 'outline'"
          size="sm"
          :aria-pressed="onlyDone"
          :aria-label="onlyDone
            ? '目前只顯示已存證項目，按一下顯示全部'
            : '目前顯示全部項目，按一下只顯示已存證項目'"
          @click="onlyDone = !onlyDone"
        >
          <Filter class="h-4 w-4" />
        </Button>
      </div>

      <!-- 主內容：依房間分組，每組內以卡片網格呈現 -->
      <section v-if="currentProperty" class="space-y-6">
        <p v-if="groupedByRoom.length === 0" class="text-sm text-muted-foreground">
          <span v-if="itemsOfCurrentProperty.length === 0">
            這個租屋處還沒有任何點交項目，請按上方「新增點交項目」開始建立清單。
          </span>
          <span v-else>沒有符合條件的項目，請調整搜尋或篩選。</span>
        </p>

        <div v-for="group in groupedByRoom" :key="group.room" class="space-y-3">
          <h2 class="text-lg font-semibold border-l-4 border-primary pl-2">
            {{ group.room }}
            <span class="text-sm font-normal text-muted-foreground">
              （{{ group.items.length }} 項）
            </span>
          </h2>

          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card v-for="it in group.items" :key="it.id">
              <CardHeader class="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle class="text-lg">{{ it.name }}</CardTitle>
                  <CardDescription>{{ it.room }}</CardDescription>
                </div>
                <div class="flex items-center gap-1">
                  <Badge
                    v-if="firstBaseline(it)"
                    variant="secondary"
                    class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  >
                    <CheckCircle2 class="mr-1 h-3 w-3" /> 已存證
                  </Badge>
                  <Badge v-else variant="destructive">
                    <AlertCircle class="mr-1 h-3 w-3" /> 待拍攝
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive"
                    :disabled="busy"
                    @click="removeItem(it.id)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent class="space-y-2">
                <!-- 狀態一：已拍攝（包含分析中與分析完成） -->
                <div v-if="firstBaseline(it)" class="space-y-2">
                  <!-- 照片縮圖 + 正在分析時的磨砂遮罩 -->
                  <div class="relative aspect-video bg-muted rounded-md overflow-hidden">
                    <img
                      :src="firstBaseline(it)!.url"
                      :alt="it.name"
                      class="object-cover w-full h-full"
                      referrerpolicy="no-referrer"
                    />

                    <div
                      v-if="analyzingItemId === it.id"
                      class="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-white gap-2"
                    >
                      <div
                        class="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent"
                      ></div>
                      <span class="text-xs tracking-wider animate-pulse font-medium"
                        >AI 診斷特徵中...</span
                      >
                    </div>
                  </div>

                  <!-- 正在分析時的進度提示 -->
                  <div
                    v-if="analyzingItemId === it.id"
                    class="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2"
                  >
                    <Sparkles class="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span class="leading-tight">NVIDIA VLM 正在辨識損壞特徵與成因...</span>
                  </div>

                  <!-- 分析完成後的結果展示 -->
                  <div v-else class="space-y-2">
                    <div class="flex items-center gap-2 text-xs flex-wrap">
                      <Badge
                        :variant="
                          firstBaseline(it)!.aiLabel?.includes('嚴重') ? 'destructive' : 'outline'
                        "
                        class="gap-1 font-semibold"
                      >
                        <Sparkles class="h-3 w-3" />
                        {{ firstBaseline(it)!.aiLabel }}
                      </Badge>
                      <span class="text-muted-foreground flex items-center gap-1">
                        <Clock class="h-3 w-3" />
                        {{ fmtDate(firstBaseline(it)!.capturedAt) }}
                      </span>
                    </div>
                    <p v-if="firstBaseline(it)!.integrityNote" class="text-xs" :class="firstBaseline(it)!.captureSource === 'camera' ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'">
                      {{ firstBaseline(it)!.integrityNote }}
                    </p>

                    <Button
                      v-if="!firstBaseline(it)!.vlmResult"
                      variant="outline"
                      size="sm"
                      :disabled="busy"
                      @click="retryAnalysis(it.id, firstBaseline(it)!.id)"
                      >重新辨識</Button
                    >
                    <div
                      v-if="firstBaseline(it)!.note"
                      class="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed break-words"
                    >
                      {{ firstBaseline(it)!.note }}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      class="w-full"
                      :disabled="busy"
                      @click="openCaptureModal(it)"
                    >
                      重拍
                    </Button>
                  </div>
                </div>

                <!-- 狀態二：尚未拍攝照片 -->
                <div
                  v-else
                  class="aspect-video w-full bg-muted/50 border-2 border-dashed rounded-md flex flex-col items-center justify-center p-3 gap-2"
                >
                  <div class="text-center">
                    <span class="text-sm font-medium text-foreground">新增點交存證照片</span>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      系統將自動進行清晰度與瑕疵辨識
                    </p>
                  </div>

                  <!-- 雙功能選擇按鈕 -->
                  <div class="flex gap-2 w-full max-w-[240px] mt-1">
                    <!-- 1. 開啟相機鏡頭 (調用 SmartCaptureCamera) -->
                    <Button
                      size="sm"
                      class="flex-1 text-xs"
                      :disabled="busy"
                      @click="openCaptureModal(it)"
                    >
                      <Camera class="mr-1 h-3.5 w-3.5" /> 開啟相機
                    </Button>

                    <!-- 2. 本機相簿 / 檔案上傳 (調用原生 file input) -->
                    <Button
                      size="sm"
                      variant="outline"
                      class="flex-1 text-xs"
                      :disabled="busy"
                      @click="capturePhoto(it.id)"
                    >
                      📁 檔案上傳
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Card v-else-if="!busy && !error">
        <CardContent class="pt-6 text-center text-muted-foreground space-y-2">
          <Building2 class="h-8 w-8 mx-auto" />
          <p>目前沒有可用的租客合約，請先建立租約後再進行點交。</p>
        </CardContent>
      </Card>
    </div>

    <!-- AR 智慧相機彈窗 -->
    <SmartCaptureCamera
      v-if="activeTargetItem"
      v-model:open="showCameraDialog"
      :item-id="activeTargetItem.id"
      :item-name="activeTargetItem.name"
      :room-name="activeTargetItem.room"
      @captured="handlePhotoCaptured"
    />
  </div>
</template>

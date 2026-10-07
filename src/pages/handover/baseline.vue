<script setup lang="ts">
// 點交縮圖總覽與獨立 PDF 匯出。
import SmartCaptureCamera, {
  type CapturePayload,
} from '@/src/components/handover/SmartCaptureCamera.vue'
import { computed, ref } from 'vue'
import HandoverEvidenceDetail from '@/src/components/handover/HandoverEvidenceDetail.vue'
import { useRouter } from 'vue-router'
import {
  Camera,
  CheckCircle2,
  Plus,
  Building2,
  ArrowLeft,
  Trash2,
  Search,
  FileDown,
  FileText,
  X,
} from 'lucide-vue-next'

import { Card, CardContent } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
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
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'

import {
  useHandover,
  type HandoverItem,
  type CaptureQuality,
  type CaptureSource,
  type CaptureAngle,
} from '@/src/composables/useHandover'
import {
  firstEvidenceOfPhase,
  groupItemsByRoom,
  completedCaptureAngles,
} from '@/src/utils/handover'
// ---------- AR 相機彈窗狀態 ---------- //
import { createHandoverPdf } from '@/src/utils/handover-pdf'
const showCameraDialog = ref(false)
const activeTargetItem = ref<HandoverItem | null>(null)

const captureAngle = ref<CaptureAngle>('front')
const replacingId = ref<string>()
function openCaptureModal(item: HandoverItem, angle: CaptureAngle = 'front', replacesId?: string) {
  if (busy.value) return
  captureAngle.value = angle
  replacingId.value = replacesId
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
  removeEvidence,
  updateEvidenceNote,
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

function readOriginal(file: File): Promise<string> {
  if (file.size > 8_000_000)
    return Promise.reject(new Error('原始照片需小於 8 MB，請選擇較小的檔案。'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('無法讀取原始圖片。'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function processPhotoWithAI(
  item: HandoverItem,
  dataUrl: string,
  source: CaptureSource,
  quality: CaptureQuality | null,
  originalName?: string,
  photoTakenAt?: string,
) {
  await addEvidence(item.id, 'baseline', {
    url: dataUrl,
    source,
    quality,
    angle: captureAngle.value,
    append: true,
    replacesId: replacingId.value,
    originalName,
    photoTakenAt,
  })
}

// 相機拍照回傳
async function handlePhotoCaptured(payload: CapturePayload) {
  if (!activeTargetItem.value) return
  await processPhotoWithAI(
    activeTargetItem.value,
    payload.dataUrl,
    payload.source,
    payload.quality,
    payload.originalName,
    payload.photoTakenAt,
  )
}

// 本地檔案上傳
async function capturePhoto(itemId: string, angle: CaptureAngle = 'front', replacesId?: string) {
  if (busy.value) return
  captureAngle.value = angle
  replacingId.value = replacesId
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
      const dataUrl = await readOriginal(file)
      await processPhotoWithAI(targetItem, dataUrl, 'file', null, file.name)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '無法讀取圖片，請重新選擇圖片檔案。'
      console.error('圖片壓縮或處理失敗:', cause)
    }
  }

  input.oncancel = () => input.remove()
  input.click()
}

// ---------- 搜尋 / 篩選 ---------- //

const keyword = ref('')
const onlyDone = ref(false)

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return itemsOfCurrentProperty.value.filter((it) => {
    const baselineEv = firstEvidenceOfPhase(it, 'baseline')
    if (onlyDone.value && completedCaptureAngles(it) < 3) return false
    if (!kw) return true
    return (
      it.name.toLowerCase().includes(kw) ||
      it.room.toLowerCase().includes(kw) ||
      (baselineEv?.note ?? '').toLowerCase().includes(kw)
    )
  })
})

// ---------- 依房間分組（用於主畫面 + 完整匯出） ---------- //

type Grouped = { room: string; items: HandoverItem[] }
const groupedByRoom = computed<Grouped[]>(() => groupItemsByRoom(filteredItems.value))

// ---------- 統計 ---------- //

const stats = computed(() => {
  const all = itemsOfCurrentProperty.value
  return {
    total: all.length,
    done: all.filter((it) => completedCaptureAngles(it) === 3).length,
    rooms: new Set(all.map((it) => it.room)).size,
  }
})

// ---------- 匯出（雙格式）---------- //

const exporting = ref(false)
const exportError = ref('')
async function triggerPrint(mode: 'checklist' | 'full') {
  if (!currentProperty.value || exporting.value || busy.value) return
  exporting.value = true
  exportError.value = ''
  try {
    const bytes = await createHandoverPdf(currentProperty.value, itemsOfCurrentProperty.value, mode)
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `入住點交${mode === 'full' ? '完整證據包' : '條列清單'}.pdf`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (cause) {
    exportError.value = cause instanceof Error ? cause.message : 'PDF 匯出失敗，請再試一次。'
  } finally {
    exporting.value = false
  }
}
const selectedItemId = ref<string | null>(null)
const selectedItem = computed(() =>
  itemsOfCurrentProperty.value.find((it) => it.id === selectedItemId.value),
)
const detailOpen = computed({
  get: () => Boolean(selectedItem.value),
  set: (open: boolean) => {
    if (!open) selectedItemId.value = null
  },
})

// ---------- 工具 ---------- //

function firstBaseline(it: HandoverItem) {
  return firstEvidenceOfPhase(it, 'baseline')
}

async function archivePhoto(id: string) {
  if (selectedItem.value && window.confirm('將這張照片移至歷程？原檔與紀錄會保留。'))
    await removeEvidence(selectedItem.value.id, id)
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
    <!-- =================== 螢幕檢視（列印時隱藏） =================== -->
    <div class="screen-only space-y-6">
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

          <p
            v-if="currentProperty?.source === 'landlord'"
            class="mt-3 rounded-md bg-sky-50 p-2 text-xs text-sky-800"
          >
            這是房東平台上的租約：你在這裡的點交照片與辨識結果，房東也看得到（只能看、不能改），退租時雙方可以對照。
          </p>
          <div v-if="currentProperty" class="mt-5 space-y-5">
            <div class="grid grid-cols-3 divide-x">
              <div
                v-for="entry in [
                  { label: '點交項目', value: stats.total },
                  { label: '已完成項目', value: stats.done },
                  { label: '未完成項目', value: stats.total - stats.done },
                ]"
                :key="entry.label"
                class="px-2 text-center"
              >
                <div class="text-xs text-muted-foreground sm:text-sm">{{ entry.label }}</div>
                <div class="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
                  {{ entry.value
                  }}<span class="ml-1 text-sm font-normal text-muted-foreground">項</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex justify-between text-xs text-muted-foreground">
                <span>三個角度皆已拍攝即列為完成</span
                ><strong class="text-primary"
                  >{{ stats.total ? Math.round((stats.done / stats.total) * 100) : 0 }}%</strong
                >
              </div>
              <div
                role="progressbar"
                aria-label="點交項目拍攝完成進度"
                :aria-valuenow="stats.done"
                :aria-valuemax="stats.total || 1"
                aria-valuemin="0"
                class="h-2.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  class="h-full rounded-full bg-primary transition-all"
                  :style="{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 工具列：新增 / 搜尋 / 篩選 / 兩種匯出 -->
      <div v-if="currentProperty" class="flex flex-wrap items-end gap-3 border-b pb-3">
        <Dialog v-model:open="showAddItemDialog">
          <DialogTrigger as-child>
            <Button size="sm"> <Plus class="mr-1 h-4 w-4" /> 新增點交項目 </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增點交項目</DialogTitle>
              <DialogDescription
                >先填房間，再列出這個房間的所有物品，最後一次新增。</DialogDescription
              >
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

        <div class="flex-1 min-w-[200px] space-y-1">
          <Label class="text-xs">搜尋</Label>
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋物品、房間或備註" class="pl-8" />
          </div>
        </div>

        <Button variant="outline" size="sm" @click="onlyDone = !onlyDone">
          {{ onlyDone ? '只看已完成' : '顯示全部' }}
        </Button>

        <!-- 兩種匯出：給使用者明確選擇 -->
        <Button
          variant="outline"
          size="sm"
          :disabled="busy || exporting || !stats.total"
          @click="triggerPrint('checklist')"
        >
          <FileText class="mr-1 h-4 w-4" /> 匯出條列清單
        </Button>
        <Button
          size="sm"
          :disabled="busy || exporting || !stats.total"
          @click="triggerPrint('full')"
        >
          <FileDown class="mr-1 h-4 w-4" /> 匯出完整證據包
        </Button>
      </div>

      <p v-if="exporting" role="status" class="text-sm text-muted-foreground">正在產生 PDF…</p>
      <p v-if="exportError" role="alert" class="text-sm text-destructive">{{ exportError }}</p>
      <!-- 主內容：依房間分組，每組內以卡片網格呈現 -->
      <section v-if="currentProperty" class="space-y-6">
        <p v-if="groupedByRoom.length === 0" class="text-sm text-muted-foreground">
          <span v-if="itemsOfCurrentProperty.length === 0">
            這個租屋處還沒有任何點交項目，請按上方「新增點交項目」開始建立清單。
          </span>
          <span v-else>沒有符合條件的項目，請調整搜尋或篩選。</span>
        </p>

        <div v-for="group in groupedByRoom" :key="group.room" class="space-y-3">
          <h2 class="text-base font-semibold">
            {{ group.room }}
            <span class="text-sm font-normal text-muted-foreground">
              （{{ group.items.length }} 項）
            </span>
          </h2>

          <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <button
              v-for="it in group.items"
              :key="it.id"
              type="button"
              class="handover-tile min-w-0 overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="`查看${it.name}點交詳情`"
              @click="selectedItemId = it.id"
            >
              <div class="relative flex aspect-[4/3] items-center justify-center bg-muted/40">
                <img
                  v-if="firstBaseline(it)"
                  :src="firstBaseline(it)!.url"
                  :alt="it.name"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                />
                <div v-else class="flex flex-col items-center gap-2 px-2 text-muted-foreground">
                  <Camera class="h-6 w-6" />
                  <span class="text-xs">新增點交存證照片</span>
                </div>
              </div>
              <div class="space-y-1 p-3">
                <div class="truncate text-sm font-semibold">{{ it.name }}</div>
                <div class="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 v-if="completedCaptureAngles(it) === 3" class="h-3 w-3" />
                  {{
                    analyzingItemId === it.id
                      ? '辨識中…'
                      : completedCaptureAngles(it) === 3
                        ? '已完成'
                        : `待補齊 ${completedCaptureAngles(it)} / 3`
                  }}
                </div>
              </div>
            </button>
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

    <Dialog v-model:open="detailOpen">
      <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <template v-if="selectedItem">
          <DialogHeader>
            <DialogTitle>{{ selectedItem.name }}</DialogTitle>
            <DialogDescription>{{ selectedItem.room }} · 入住前點交</DialogDescription>
          </DialogHeader>
          <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
          <HandoverEvidenceDetail
            :item="selectedItem"
            :property="currentProperty"
            :busy="busy"
            @capture="(angle, id) => openCaptureModal(selectedItem!, angle, id)"
            @upload="(angle, id) => capturePhoto(selectedItem!.id, angle, id)"
            @save-note="(id, note, angle) => updateEvidenceNote(selectedItem!.id, id, note, angle)"
            @remove-photo="archivePhoto"
            @retry="(id) => retryAnalysis(selectedItem!.id, id)"
          />
          <DialogFooter>
            <Button variant="ghost" :disabled="busy" @click="removeItem(selectedItem.id)">
              <Trash2 class="mr-1 h-4 w-4" /> 刪除項目
            </Button>
            <Button variant="outline" @click="detailOpen = false">關閉</Button>
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>

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

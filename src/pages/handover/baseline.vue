<script setup lang="ts">
// 點交縮圖總覽與獨立 PDF 匯出。
import SmartCaptureCamera, {
  type CapturePayload,
} from '@/src/components/handover/SmartCaptureCamera.vue'
import { computed, ref } from 'vue'
import HandoverOverviewHeader from '@/src/components/handover/HandoverOverviewHeader.vue'
import HandoverAddItemsDialog from '@/src/components/handover/HandoverAddItemsDialog.vue'
import HandoverEvidenceDetail from '@/src/components/handover/HandoverEvidenceDetail.vue'
import { useRouter } from 'vue-router'
import {
  Camera,
  CheckCircle2,
  Building2,
  Trash2,
  Search,
  FileDown,
  FileText,
} from 'lucide-vue-next'

import { Card, CardContent } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input/index'

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
    if (onlyDone.value && completedCaptureAngles(it) < 2) return false
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
    done: all.filter((it) => completedCaptureAngles(it) === 2).length,
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
      <HandoverOverviewHeader
        title="入住前點交"
        :properties="properties"
        :property="currentProperty"
        :total="stats.total"
        :done="stats.done"
        :busy="busy"
        @select="selectProperty"
        @back="router.push('/app/handover')"
      >
        <template #actions><HandoverAddItemsDialog :busy="busy" :add-items="addItems" /></template>
      </HandoverOverviewHeader>
      <p
        v-if="currentProperty?.source === 'landlord'"
        class="rounded-md bg-primary/5 p-3 text-xs text-muted-foreground"
      >
        這是房東平台上的租約：你在這裡的點交照片與辨識結果，房東也看得到（只能看、不能改），退租時雙方可以對照。
      </p>

      <!-- 工具列：新增 / 搜尋 / 篩選 / 兩種匯出 -->
      <div v-if="currentProperty" class="flex flex-wrap items-center gap-2 border-b pb-3">
        <div class="flex-1 min-w-0 space-y-1">
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="keyword"
              aria-label="搜尋物品、房間或備註"
              placeholder="搜尋物品、房間或備註"
              class="pl-8"
            />
          </div>
        </div>

        <Button variant="outline" size="sm" @click="onlyDone = !onlyDone">
          {{ onlyDone ? '只看已完成' : '顯示全部' }}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child
            ><Button
              variant="outline"
              size="sm"
              class="sm:hidden"
              aria-label="下載點交資料"
              :disabled="busy || exporting || !stats.total"
              ><FileDown class="h-4 w-4" /></Button
          ></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="triggerPrint('checklist')">匯出條列清單</DropdownMenuItem>
            <DropdownMenuItem @select="triggerPrint('full')">匯出完整證據包</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          class="handover-desktop-export"
          :disabled="busy || exporting || !stats.total"
          @click="triggerPrint('checklist')"
        >
          <FileText class="mr-1 h-4 w-4" /> 匯出條列清單
        </Button>
        <Button
          size="sm"
          class="handover-desktop-export"
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
            這個租屋處還沒有任何點交項目，請按上方「新增項目」開始建立清單。
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

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
            <button
              v-for="it in group.items"
              :key="it.id"
              type="button"
              class="handover-tile flex items-center sm:block min-w-0 overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="`查看${it.name}點交詳情`"
              @click="selectedItemId = it.id"
            >
              <div class="handover-thumbnail relative flex items-center justify-center bg-muted/40">
                <img
                  v-if="firstBaseline(it)"
                  :src="firstBaseline(it)!.url"
                  :alt="it.name"
                  class="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                />
                <div v-else class="flex flex-col items-center gap-2 px-2 text-muted-foreground">
                  <Camera class="h-6 w-6" />
                  <span class="text-xs">新增點交存證照片</span>
                </div>
              </div>
              <div class="min-w-0 flex-1 space-y-2 p-3">
                <div class="truncate text-sm font-semibold">{{ it.name }}</div>
                <div class="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 v-if="completedCaptureAngles(it) === 2" class="h-3 w-3" />
                  {{
                    analyzingItemId === it.id
                      ? '辨識中…'
                      : completedCaptureAngles(it) === 2
                        ? '已完成'
                        : `待補齊 ${completedCaptureAngles(it)} / 2`
                  }}
                </div>
                <p class="text-xs text-muted-foreground sm:hidden">
                  {{ it.evidences.filter((e) => e.phase === 'baseline').length }} 張照片
                </p>
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
      <DialogContent class="handover-detail-dialog max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
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
            @close="detailOpen = false"
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

<style>
.handover-thumbnail {
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
}
.handover-desktop-export {
  display: inline-flex;
}

@media (max-width: 639px) {
  .handover-thumbnail {
    width: 96px;
    height: 96px;
    aspect-ratio: 1;
    flex-shrink: 0;
  }
  .handover-desktop-export {
    display: none;
  }
  .handover-detail-dialog {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    padding: 1rem;
    display: block;
  }
}
</style>

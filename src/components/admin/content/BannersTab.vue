<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Switch } from '@/components/ui/switch/index'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { ChevronDown, ChevronUp, GripVertical, ImageOff, Upload } from 'lucide-vue-next'
import AdminRowActions from '@/src/components/admin/AdminRowActions.vue'
import StatusBadge from '@/src/components/admin/StatusBadge.vue'
import ActionError from '@/src/components/admin/ActionError.vue'
import AdminLoadNotice from '@/src/components/admin/AdminLoadNotice.vue'
import BannerCarousel from '@/src/components/content/BannerCarousel.vue'
import { loadAdminContent, useAdminContent } from '@/src/composables/admin/useAdminContent'
import { BUILTIN_BANNER_IMAGES, isValidImageUrl } from '@/src/utils/banner-url'
import { deleteBannerImage, fetchBannerImages, uploadBannerImage, type BannerImage } from '@/src/services/bannerImageApi'
import { buildBannerLibrary, isLibraryFull, type BannerLibraryEntry } from '@/src/utils/banner-library'
import { resolvePhase } from '@/src/utils/phase'
import { isDeadRoute, routeOptionsFor } from '@/src/utils/tenant-route-link'
import { formatDate } from '@/src/utils/admin-format'
import { dateKey } from '@/src/utils/date-key'
import type { AnnouncementAudience, Banner } from '@/src/mocks/admin/content'

const router = useRouter()
const { banners, loadState, saveBanner, removeBanner, moveBanner, reorderBanner } = useAdminContent()

const ordered = computed(() => [...banners.value].sort((a, b) => a.order - b.order))

// 每次渲染都用同一個「現在」判斷所有列的階段，避免逐列各取一次而在跨秒時出現不一致
const phaseOf = (item: Banner) => resolvePhase(item, new Date())

/*
 * 排序用原生 HTML5 drag and drop，不引入拖曳套件——這裡只有一份短清單，
 * 為它加一個相依套件不值得。dropTargetId 只用於顯示要插入哪一列的邊框提示。
 */
const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)

function onDragStart(id: string): void {
  draggingId.value = id
}

function onDragOver(id: string): void {
  dropTargetId.value = id
}

function onDragEnd(): void {
  draggingId.value = null
  dropTargetId.value = null
}

/** 排序、刪除的錯誤顯示在清單上方；新增、編輯的錯誤留在對話框裡 */
const listError = ref('')
const dialogError = ref('')
const saving = ref(false)

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作失敗，請稍後再試。'
}

async function run(action: () => Promise<void>): Promise<void> {
  listError.value = ''
  try {
    await action()
    await loadUploadedImages()
  } catch (error) {
    listError.value = messageOf(error)
  }
}

function onDrop(targetIndex: number): void {
  const id = draggingId.value
  if (id) void run(() => reorderBanner(id, targetIndex))
  onDragEnd()
}

const dialogOpen = ref(false)
const deleteTarget = ref<Banner | null>(null)

interface DraftState {
  id?: string
  title: string
  imageUrl: string
  linkUrl: string
  audience: AnnouncementAudience
  published: boolean
  startAt: string
  endAt: string
}

/**
 * ISO → <input type="date"> 的值。
 *
 * ⚠️ 不可以寫成 `iso.slice(0, 10)`。fromDateInput 存進去的是**本地午夜**，
 * 在 UTC+8 會變成前一天的 16:00Z —— 直接切 ISO 字串會把日期倒退一天，
 * 而且每次開編輯再存檔就再退一天。
 *
 * dateKey() 取的是本地日期部件，來回轉換才會穩定。
 */
function toDateInput(iso: string): string {
  return dateKey(new Date(iso))
}

function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString()
}

const draft = ref<DraftState>(emptyDraft())

function emptyDraft(): DraftState {
  return {
    title: '',
    imageUrl: '',
    linkUrl: '',
    audience: 'all',
    published: true,
    startAt: toDateInput(new Date().toISOString()),
    endAt: '',
  }
}

/*
 * 連結清單跟著對象走：給房東看的輪播只能連房東端的頁，不然他點進去會看到
 * 租客的介面。換對象時把不在新清單裡的連結清掉，否則會存到一個對方打不開的頁。
 */
const linkOptions = computed(() => routeOptionsFor(draft.value.audience))
const linkGroups = computed(() => [...new Set(linkOptions.value.map((item) => item.group))])

watch(
  () => draft.value.audience,
  () => {
    if (draft.value.linkUrl && !linkOptions.value.some((item) => item.url === draft.value.linkUrl)) {
      draft.value.linkUrl = ''
    }
  },
)

// 圖片載入失敗時要換成佔位樣式而不是瀏覽器預設的破圖示；
// 網址改變就重置，否則換了網址但還沒重新載入完成前會誤顯示上一張的失敗狀態。
const previewFailed = ref(false)

/** 存檔前的圖片檢查狀態，見下面的 probeImage()。 */
type ImageCheckState = 'idle' | 'checking' | 'failed'
const imageCheckState = ref<ImageCheckState>('idle')

/*
 * 上傳圖片：檔案存在伺服器上（backend/admin/banner_images.py），所有管理員與
 * 所有裝置看到的是同一批。上傳完直接填進「圖片網址」，不用自己複製貼上。
 */
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadedImages = ref<BannerImage[]>([])
const imageCount = ref(0)
const imageLimit = ref(30)
const libraryLoadState = ref<'loading' | 'ready' | 'error'>('loading')
const libraryEntries = computed(() => buildBannerLibrary(uploadedImages.value, banners.value))
const libraryFull = computed(() => isLibraryFull(imageCount.value, imageLimit.value))
const uploadBlockedReason = computed(() => uploading.value
  ? '圖片上傳中，請稍候。'
  : libraryFull.value ? `圖庫已滿（${imageLimit.value} 張），請先刪除未使用的圖片。` : '')
const imageDeleteTarget = ref<BannerLibraryEntry | null>(null)
const imageDeleteError = ref('')
const deletingImage = ref(false)
let selectUploadedImage = false
let libraryRequest = 0

async function loadUploadedImages(): Promise<void> {
  const request = ++libraryRequest
  // 已經有資料時背景重讀，不把整個圖庫換成「讀取中」造成閃爍
  if (libraryLoadState.value !== 'ready') libraryLoadState.value = 'loading'
  const result = await fetchBannerImages()
  // 只套用最後一次讀取，避免較早的請求把操作後的新狀態蓋回去。
  if (request !== libraryRequest) return
  if (!result) {
    libraryLoadState.value = 'error'
    return
  }
  uploadedImages.value = result.items
  imageCount.value = result.count
  imageLimit.value = result.limit
  libraryLoadState.value = 'ready'
}

onMounted(loadUploadedImages)

function pickUpload(select: boolean): void {
  if (uploading.value || libraryFull.value) return
  selectUploadedImage = select
  uploadError.value = ''
  fileInput.value?.click()
}

async function onPickFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 選完就清掉 input：同一個檔案再選一次才會再觸發 change
  input.value = ''
  if (!file || uploading.value || libraryFull.value) return
  const select = selectUploadedImage
  uploadError.value = ''
  uploading.value = true
  try {
    const image = await uploadBannerImage(file)
    if (select) draft.value.imageUrl = image.url
    await loadUploadedImages()
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : '上傳失敗，請稍後再試。'
  } finally {
    uploading.value = false
  }
}

function pickLibraryImage(image: BannerLibraryEntry): void {
  openCreate()
  draft.value.imageUrl = image.url
}

function openImageDelete(image: BannerLibraryEntry): void {
  if (!image.deletable) return
  imageDeleteError.value = ''
  imageDeleteTarget.value = image
}

async function confirmImageDelete(): Promise<void> {
  const target = imageDeleteTarget.value
  if (!target || deletingImage.value) return
  deletingImage.value = true
  imageDeleteError.value = ''
  try {
    await deleteBannerImage(target.key)
    imageDeleteTarget.value = null
    await loadUploadedImages()
  } catch (error) {
    imageDeleteError.value = messageOf(error)
  } finally {
    deletingImage.value = false
  }
}

watch(
  () => draft.value.imageUrl,
  () => {
    previewFailed.value = false
    imageCheckState.value = 'idle'
  },
)

function onPreviewError(): void {
  previewFailed.value = true
}

function openCreate(): void {
  draft.value = emptyDraft()
  previewFailed.value = false
  imageCheckState.value = 'idle'
  dialogError.value = ''
  uploadError.value = ''
  dialogOpen.value = true
  void loadUploadedImages()
}

function openEdit(item: Banner): void {
  draft.value = {
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    audience: item.audience,
    published: item.published,
    startAt: toDateInput(item.startAt),
    endAt: item.endAt ? toDateInput(item.endAt) : '',
  }
  previewFailed.value = false
  imageCheckState.value = 'idle'
  dialogError.value = ''
  uploadError.value = ''
  dialogOpen.value = true
  void loadUploadedImages()
}

/**
 * 送出前用**活的** router 再驗一次連結——白名單防得了手打，防不了路由之後
 * 被改名（見 tenant-route-link.ts 開頭的說明）。
 *
 * 這裡沒有直接重用 actionLinkError：那個函式處理的是通知操作按鈕「可以不
 * 填」的語意（只填文字沒填連結才報錯）。輪播的連結是必填的——整張圖都是
 * 連結，不存在「這個輪播沒有連結」這種合法狀態，Select 也不給選空值，
 * 所以只需要驗證「選到的這個網址現在還活著嗎」，用不到那組訊息。
 */
const linkIssue = computed<string | null>(() => {
  const url = draft.value.linkUrl
  if (url === '') return null
  const matched = router.resolve(url).matched.map((record) => record.path)
  if (isDeadRoute(matched)) {
    return `「${url}」在目前的路由表裡不存在，點下去會被丟回首頁。`
  }
  return null
})

/**
 * 存檔前用瀏覽器實際載一次圖片，不只驗證網址格式——格式合法的網址仍可能是
 * 404、伺服器掛了，或圖床把這個 hotlink 擋掉。8 秒逾時也當作失敗，不然
 * 連不上的網址會讓管理員一直等轉圈；沒回應本身就是個訊號。
 */
function probeImage(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    let settled = false

    function settle(ok: boolean): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve(ok)
    }

    const timer = setTimeout(() => settle(false), timeoutMs)
    img.onload = () => settle(true)
    img.onerror = () => settle(false)
    img.src = url
  })
}

function buildBannerInput(): Omit<Banner, 'id' | 'updatedAt' | 'order'> & { id?: string } {
  return {
    id: draft.value.id,
    title: draft.value.title,
    imageUrl: draft.value.imageUrl,
    linkUrl: draft.value.linkUrl,
    audience: draft.value.audience,
    published: draft.value.published,
    startAt: fromDateInput(draft.value.startAt),
    endAt: draft.value.endAt ? fromDateInput(draft.value.endAt) : null,
  }
}

/**
 * force 為 true 時跳過圖片檢查，是「仍要儲存」按鈕走的路。
 *
 * 為什麼要留這條退路：企業防火牆、圖床的防盜連（hotlink protection）都可能
 * 讓 probeImage() 從瀏覽器發出的檢查請求被擋下來，誤判成「載入失敗」，
 * 但圖片其實是好的、租客瀏覽器點開來看得到。前端沒有辦法分辨「真的壞了」
 * 跟「檢查被擋但圖是好的」，如果沒有這顆按鈕，管理員會被一個假警報卡死、
 * 完全存不了檔。
 *
 * 連結檢查（linkIssue）沒有對應的退路：router.resolve() 問的是這個 app
 * 自己的路由表，不是外部網路請求，不會有「環境造成誤判」這種狀況——
 * 驗不過就是真的會把使用者丟回首頁，沒有理由放行。
 */
async function submit(force = false): Promise<void> {
  if (!canSubmit()) return

  if (!force) {
    imageCheckState.value = 'checking'
    const ok = await probeImage(draft.value.imageUrl)
    if (!ok) {
      imageCheckState.value = 'failed'
      return
    }
  }

  imageCheckState.value = 'idle'
  saving.value = true
  dialogError.value = ''
  try {
    await saveBanner(buildBannerInput())
    dialogOpen.value = false
    await loadUploadedImages()
  } catch (error) {
    dialogError.value = messageOf(error)
  } finally {
    saving.value = false
  }
}

function confirmDelete(): void {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (target) void run(() => removeBanner(target.id))
}

const canSubmit = () =>
  draft.value.title.trim() !== '' &&
  draft.value.imageUrl.trim() !== '' &&
  draft.value.linkUrl !== '' &&
  linkIssue.value === null &&
  imageCheckState.value !== 'checking' &&
  !saving.value

// 只在使用者已經有輸入內容時才提示格式錯誤，避免新增輪播一開對話框就先罵人。
const showUrlFormatWarning = computed(
  () => draft.value.imageUrl.trim() !== '' && !isValidImageUrl(draft.value.imageUrl),
)

/* -------------------- 上方即時預覽 -------------------- */

/**
 * 對話框開著、而且已經有圖片網址時，把正在編輯的草稿疊進預覽清單——這樣
 * 管理員在按「儲存」之前就能看到效果，包含排期／發布開關是不是真的讓它在
 * 「現在」出現（BannerCarousel 用 resolvePhase 過濾，不是照單全收，所以
 * 把發布關掉或排到未來，草稿會從預覽消失——這是對的，不是 bug）。
 * 沒有圖片網址時草稿只會是一塊破圖，不如維持目前已存檔的清單，不要用半成品
 * 洗掉本來看得到的預覽。
 */
const previewItems = computed<Banner[]>(() => {
  if (!dialogOpen.value || draft.value.imageUrl.trim() === '') return ordered.value

  const editingId = draft.value.id
  const existing = editingId ? ordered.value.find((item) => item.id === editingId) : undefined
  const draftBanner: Banner = {
    id: editingId ?? '__preview-draft__',
    title: draft.value.title.trim() || '（尚未輸入標題）',
    imageUrl: draft.value.imageUrl,
    linkUrl: draft.value.linkUrl,
    audience: draft.value.audience,
    published: draft.value.published,
    startAt: draft.value.startAt ? fromDateInput(draft.value.startAt) : new Date().toISOString(),
    endAt: draft.value.endAt ? fromDateInput(draft.value.endAt) : null,
    order: existing?.order ?? ordered.value.reduce((max, item) => Math.max(max, item.order), -1) + 1,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
  }

  return editingId
    ? ordered.value.map((item) => (item.id === editingId ? draftBanner : item))
    : [...ordered.value, draftBanner]
})

const hasActivePreview = computed(() =>
  previewItems.value.some((item) => resolvePhase(item, new Date()) === 'active'),
)
</script>

<template>
  <div class="space-y-6">
    <input
      ref="fileInput"
      type="file"
      accept="image/webp,image/png,image/jpeg"
      class="hidden"
      @change="onPickFile"
    />
    <section class="space-y-3">
      <div>
        <h2 class="text-sm font-semibold">輪播預覽</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          租客工作區與公開首頁現在會看到的樣子。排序、發布狀態、排期都即時反映；
          正在編輯的草稿（含尚未儲存的變更）也看得到。
        </p>
      </div>
      <BannerCarousel :items="previewItems" />
      <p
        v-if="!hasActivePreview"
        class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        目前沒有生效中的輪播，租客工作區與公開首頁不會顯示輪播區塊。
      </p>
    </section>

    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">輪播清單</h2>
        <Button @click="openCreate">新增輪播</Button>
      </div>

      <ActionError v-if="listError" :message="listError" @dismiss="listError = ''" />
      <AdminLoadNotice :state="loadState" what="輪播" @retry="loadAdminContent" />

      <div v-if="ordered.length === 0 && loadState === 'ready'" class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        尚無輪播圖。
      </div>

      <div
        v-for="(item, index) in ordered"
        :key="item.id"
        draggable="true"
        :class="[
          'flex flex-col gap-3 rounded-2xl border bg-muted/10 p-4 transition-colors sm:flex-row sm:items-center sm:gap-4',
          draggingId === item.id && 'opacity-40',
          dropTargetId === item.id && draggingId !== item.id && 'border-primary bg-primary/5',
        ]"
        @dragstart="onDragStart(item.id)"
        @dragend="onDragEnd"
        @dragover.prevent="onDragOver(item.id)"
        @drop.prevent="onDrop(index)"
      >
        <!-- 手機上圖片＋標題一行、按鈕另起一行；擠在同一行時標題會被壓到 0 寬 -->
        <div class="flex min-w-0 flex-1 items-center gap-4">
          <GripVertical class="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
          <img :src="item.imageUrl" :alt="item.title" class="h-16 w-28 shrink-0 rounded-lg object-cover" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ item.title }}</p>
              <StatusBadge :phase="phaseOf(item)" />
            </div>
            <p class="mt-1 truncate text-sm text-muted-foreground">{{ item.linkUrl }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ formatDate(item.startAt) }} ～ {{ item.endAt ? formatDate(item.endAt) : '長期' }}
            </p>
          </div>
        </div>
        <!--
          拖曳是主要的排序方式，但它對鍵盤使用者不可用，所以 ▲▼ 保留當替代路徑，
          並補上 aria-label——原本這兩顆只有圖示，讀螢幕的人完全不知道它們是做什麼的。
        -->
        <div class="flex shrink-0 items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="往前移一位"
            :disabled="index === 0"
            @click="run(() => moveBanner(item.id, 'up'))"
          >
            <ChevronUp class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="往後移一位"
            :disabled="index === ordered.length - 1"
            @click="run(() => moveBanner(item.id, 'down'))"
          >
            <ChevronDown class="h-4 w-4" />
          </Button>
          <AdminRowActions
            :actions="[{ label: '刪除', danger: true, onSelect: () => (deleteTarget = item) }]"
          >
            <Button variant="outline" size="sm" @click="openEdit(item)">編輯</Button>
          </AdminRowActions>
        </div>
      </div>
    </section>

    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold">圖片庫</h2>
          <span class="text-sm text-muted-foreground">{{ imageCount }} / {{ imageLimit }}</span>
          <span class="text-xs text-muted-foreground">另有 {{ BUILTIN_BANNER_IMAGES.length }} 張內建圖片</span>
        </div>
        <Button
          variant="outline"
          :disabled="uploading || libraryFull"
          :title="uploadBlockedReason || undefined"
          @click="pickUpload(false)"
        >
          <Upload class="mr-1 h-4 w-4" />
          {{ uploading ? '上傳中…' : '上傳圖片' }}
        </Button>
      </div>
      <p v-if="uploadBlockedReason" class="text-xs text-muted-foreground">{{ uploadBlockedReason }}</p>
      <ActionError v-if="uploadError && !dialogOpen" :message="uploadError" @dismiss="uploadError = ''" />
      <div v-if="libraryLoadState === 'error'" class="flex items-center gap-2 text-sm text-muted-foreground">
        圖片庫讀取失敗
        <Button variant="outline" size="sm" @click="loadUploadedImages">重試</Button>
      </div>
      <p v-else-if="libraryLoadState === 'loading'" class="text-sm text-muted-foreground">圖片庫讀取中…</p>
      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div v-for="image in libraryEntries" :key="image.key" class="overflow-hidden rounded-xl border">
          <button
            type="button"
            class="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            :aria-label="`選用${image.label}新增輪播`"
            :title="image.label"
            @click="pickLibraryImage(image)"
          >
            <img :src="image.url" :alt="image.label" class="aspect-[3/1] w-full object-cover" />
          </button>
          <div class="flex flex-wrap items-center justify-between gap-2 p-2">
            <Badge variant="secondary">
              {{ image.builtin ? '內建' : image.usedBy.length === 0 ? '未使用' : `使用中 ${image.usedBy.length}` }}
            </Badge>
            <Button
              v-if="!image.builtin"
              variant="outline"
              size="sm"
              :disabled="!image.deletable"
              :title="image.blockedReason || '刪除圖片'"
              :aria-label="image.blockedReason || `刪除${image.label}`"
              @click="openImageDelete(image)"
            >
              刪除
            </Button>
          </div>
        </div>
      </div>
    </section>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯輪播' : '新增輪播' }}</DialogTitle>
          <DialogDescription>可以直接選用網站內建的圖片，或填外部圖片網址，下方即時預覽。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="ban-title">標題</Label>
            <Input id="ban-title" v-model="draft.title" />
          </div>
          <div class="space-y-2">
            <Label for="ban-image">圖片網址</Label>
            <Input id="ban-image" v-model="draft.imageUrl" placeholder="https://..." />
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-muted-foreground">內建圖片</span>
              <Button
                v-for="image in BUILTIN_BANNER_IMAGES"
                :key="image.url"
                type="button"
                size="sm"
                :variant="draft.imageUrl === image.url ? 'default' : 'outline'"
                :aria-pressed="draft.imageUrl === image.url"
                class="h-7 px-2.5 text-xs"
                @click="draft.imageUrl = image.url"
              >
                {{ image.label }}
              </Button>
            </div>

            <!--
              上傳的圖片存在伺服器上（/api/admin/banner-images），所有管理員與所有
              裝置看到的是同一批；選過的圖再用不必重傳。
            -->
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-muted-foreground">自己的圖片</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                class="h-7 px-2.5 text-xs"
                :disabled="uploading || libraryFull"
                :title="uploadBlockedReason || undefined"
                @click="pickUpload(true)"
              >
                <Upload class="mr-1 h-3 w-3" />
                {{ uploading ? '上傳中…' : '上傳圖片' }}
              </Button>
              <span class="text-xs text-muted-foreground">{{ imageCount }} / {{ imageLimit }}</span>
              <button
                v-for="image in libraryLoadState === 'ready' ? uploadedImages : []"
                :key="image.name"
                type="button"
                :aria-pressed="draft.imageUrl === image.url"
                :title="image.name"
                :class="[
                  'h-10 w-16 overflow-hidden rounded border transition',
                  draft.imageUrl === image.url ? 'border-primary ring-2 ring-primary/40' : 'border-border',
                ]"
                @click="draft.imageUrl = image.url"
              >
                <img :src="image.url" alt="" class="h-full w-full object-cover" />
              </button>
              <span v-if="libraryLoadState === 'ready' && uploadedImages.length === 0 && !uploading" class="text-xs text-muted-foreground">
                還沒有上傳過圖片
              </span>
            </div>
            <p v-if="uploadBlockedReason" class="text-xs text-muted-foreground">{{ uploadBlockedReason }}</p>
            <div v-if="libraryLoadState === 'error'" class="flex items-center gap-2 text-xs text-muted-foreground">
              圖片庫讀取失敗
              <Button variant="outline" size="sm" @click="loadUploadedImages">重試</Button>
            </div>
            <p class="text-xs text-muted-foreground">
              建議 2400×800、WebP 格式；上限 5 MB。圖片存在伺服器上，重新部署不會消失。
            </p>
            <ActionError v-if="uploadError" :message="uploadError" @dismiss="uploadError = ''" />

            <p v-if="showUrlFormatWarning" class="text-xs text-destructive">
              網址格式不正確，請填完整的 http(s) 連結，或點選上面的內建圖片。
            </p>
          </div>
          <div v-if="draft.imageUrl" class="overflow-hidden rounded-xl border">
            <img
              v-if="!previewFailed"
              :src="draft.imageUrl"
              alt="預覽"
              class="max-h-40 w-full object-cover"
              @error="onPreviewError"
            />
            <div
              v-else
              class="flex h-40 w-full flex-col items-center justify-center gap-2 bg-muted/50 text-sm text-muted-foreground"
            >
              <ImageOff class="h-6 w-6" />
              圖片載入失敗，請確認網址是否正確
            </div>
          </div>
          <div
            v-if="imageCheckState === 'failed'"
            class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          >
            <ImageOff class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              儲存前的檢查載入不出這張圖片。可能是網址真的錯了，也可能是圖床擋掉了這種自動檢查
              （例如防盜連或企業防火牆）——如果你能確認圖片沒問題，可以按「仍要儲存」略過這次檢查。
            </p>
          </div>
          <div class="space-y-2">
            <Label>對象</Label>
            <Select v-model="draft.audience">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="tenant">租客</SelectItem>
                <SelectItem value="landlord">房東</SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">
              決定這張圖出現在誰的首頁。連結頁面的清單會跟著換。
            </p>
          </div>
          <div class="space-y-2">
            <Label>連結頁面</Label>
            <Select v-model="draft.linkUrl">
              <SelectTrigger><SelectValue placeholder="選擇這則輪播要連到哪一頁" /></SelectTrigger>
              <SelectContent>
                <SelectGroup v-for="group in linkGroups" :key="group">
                  <SelectLabel>{{ group }}</SelectLabel>
                  <SelectItem
                    v-for="option in linkOptions.filter((o) => o.group === group)"
                    :key="option.url"
                    :value="option.url"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p v-if="linkIssue" class="text-xs text-destructive">{{ linkIssue }}</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="ban-start">開始日</Label>
              <Input id="ban-start" v-model="draft.startAt" type="date" />
            </div>
            <div class="space-y-2">
              <Label for="ban-end">結束日（可留空＝長期）</Label>
              <Input id="ban-end" v-model="draft.endAt" type="date" />
            </div>
          </div>
          <div class="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label class="mb-0">發布</Label>
            <Switch v-model="draft.published" />
          </div>
        </div>
        <ActionError v-if="dialogError" :message="dialogError" @dismiss="dialogError = ''" />

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button v-if="imageCheckState === 'failed'" variant="outline" :disabled="saving" @click="submit(true)">
            仍要儲存
          </Button>
          <Button :disabled="!canSubmit()" @click="submit()">
            {{ imageCheckState === 'checking' ? '確認圖片中…' : saving ? '儲存中…' : '儲存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="imageDeleteTarget !== null" @update:open="(o: boolean) => { if (!o && !deletingImage) imageDeleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除這張圖片？</DialogTitle>
          <DialogDescription>「{{ imageDeleteTarget?.label }}」刪除後無法復原。</DialogDescription>
        </DialogHeader>
        <ActionError v-if="imageDeleteError" :message="imageDeleteError" @dismiss="imageDeleteError = ''" />
        <DialogFooter>
          <Button variant="outline" :disabled="deletingImage" @click="imageDeleteTarget = null">取消</Button>
          <Button variant="destructive" :disabled="deletingImage" @click="confirmImageDelete">
            {{ deletingImage ? '刪除中…' : '確認刪除' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除輪播？</DialogTitle>
          <DialogDescription>「{{ deleteTarget?.title }}」將被永久刪除。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="confirmDelete">確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

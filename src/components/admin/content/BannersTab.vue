<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
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
import { ChevronDown, ChevronUp, GripVertical, ImageOff } from 'lucide-vue-next'
import AdminRowActions from '@/src/components/admin/AdminRowActions.vue'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import { isValidImageUrl } from '@/src/utils/banner-url'
import type { Banner } from '@/src/mocks/admin/content'

const { banners, saveBanner, removeBanner, moveBanner, reorderBanner } = useAdminContent()

const ordered = computed(() => [...banners.value].sort((a, b) => a.order - b.order))

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

function onDrop(targetIndex: number): void {
  if (draggingId.value) reorderBanner(draggingId.value, targetIndex)
  onDragEnd()
}

const dialogOpen = ref(false)
const deleteTarget = ref<Banner | null>(null)

interface DraftState {
  id?: string
  title: string
  imageUrl: string
  linkUrl: string
  published: boolean
}

const draft = ref<DraftState>(emptyDraft())

function emptyDraft(): DraftState {
  return { title: '', imageUrl: '', linkUrl: '', published: true }
}

// 圖片載入失敗時要換成佔位樣式而不是瀏覽器預設的破圖示；
// 網址改變就重置，否則換了網址但還沒重新載入完成前會誤顯示上一張的失敗狀態。
const previewFailed = ref(false)

watch(() => draft.value.imageUrl, () => {
  previewFailed.value = false
})

function onPreviewError(): void {
  previewFailed.value = true
}

function openCreate(): void {
  draft.value = emptyDraft()
  previewFailed.value = false
  dialogOpen.value = true
}

function openEdit(item: Banner): void {
  draft.value = {
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    published: item.published,
  }
  previewFailed.value = false
  dialogOpen.value = true
}

function submit(): void {
  saveBanner({ ...draft.value })
  dialogOpen.value = false
}

function confirmDelete(): void {
  if (deleteTarget.value) removeBanner(deleteTarget.value.id)
  deleteTarget.value = null
}

const canSubmit = () => draft.value.title.trim() !== '' && draft.value.imageUrl.trim() !== ''

// 只在使用者已經有輸入內容時才提示格式錯誤，避免新增輪播一開對話框就先罵人。
const showUrlFormatWarning = computed(
  () => draft.value.imageUrl.trim() !== '' && !isValidImageUrl(draft.value.imageUrl),
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <Button @click="openCreate">新增輪播</Button>
    </div>

    <div v-if="ordered.length === 0" class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      尚無輪播圖。
    </div>

    <div
      v-for="(item, index) in ordered"
      :key="item.id"
      draggable="true"
      :class="[
        'flex items-center gap-4 rounded-2xl border bg-muted/10 p-4 transition-colors',
        draggingId === item.id && 'opacity-40',
        dropTargetId === item.id && draggingId !== item.id && 'border-primary bg-primary/5',
      ]"
      @dragstart="onDragStart(item.id)"
      @dragend="onDragEnd"
      @dragover.prevent="onDragOver(item.id)"
      @drop.prevent="onDrop(index)"
    >
      <GripVertical class="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
      <img :src="item.imageUrl" :alt="item.title" class="h-16 w-28 shrink-0 rounded-lg object-cover" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="font-medium">{{ item.title }}</p>
          <Badge :variant="item.published ? 'default' : 'secondary'">
            {{ item.published ? '已發布' : '未發布' }}
          </Badge>
        </div>
        <p class="mt-1 truncate text-sm text-muted-foreground">{{ item.linkUrl }}</p>
      </div>
      <!--
        拖曳是主要的排序方式，但它對鍵盤使用者不可用，所以 ▲▼ 保留當替代路徑，
        並補上 aria-label——原本這兩顆只有圖示，讀螢幕的人完全不知道它們是做什麼的。
      -->
      <div class="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="往前移一位"
          :disabled="index === 0"
          @click="moveBanner(item.id, 'up')"
        >
          <ChevronUp class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="往後移一位"
          :disabled="index === ordered.length - 1"
          @click="moveBanner(item.id, 'down')"
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

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯輪播' : '新增輪播' }}</DialogTitle>
          <DialogDescription>圖片以外部網址提供，右側即時預覽。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="ban-title">標題</Label>
            <Input id="ban-title" v-model="draft.title" />
          </div>
          <div class="space-y-2">
            <Label for="ban-image">圖片網址</Label>
            <Input id="ban-image" v-model="draft.imageUrl" placeholder="https://..." />
            <p v-if="showUrlFormatWarning" class="text-xs text-destructive">
              網址格式不正確，請確認是否為完整的 http(s) 連結。
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
          <div class="space-y-2">
            <Label for="ban-link">連結網址</Label>
            <Input id="ban-link" v-model="draft.linkUrl" placeholder="/app/..." />
          </div>
          <div class="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label class="mb-0">發布</Label>
            <Switch v-model="draft.published" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">儲存</Button>
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

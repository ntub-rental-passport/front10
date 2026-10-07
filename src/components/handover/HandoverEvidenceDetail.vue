<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { Camera, Plus, ChevronLeft, ChevronRight, Download, CheckCircle2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { HandoverItem, HandoverProperty, CaptureAngle } from '@/src/composables/useHandover'
import {
  captureAngles,
  completedCaptureAngles,
  formatHandoverTimestamp,
} from '@/src/utils/handover'
import { downloadInspectionOriginal } from '@/src/services/inspectionApi'

const props = defineProps<{
  item: HandoverItem
  property: HandoverProperty | null
  busy: boolean
}>()
const emit = defineEmits<{
  capture: [angle: CaptureAngle, replacesId?: string]
  upload: [angle: CaptureAngle, replacesId?: string]
  saveNote: [id: string, note: string, angle: CaptureAngle]
  removePhoto: [id: string]
  retry: [id: string]
  close: []
}>()
const desktop = useMediaQuery('(min-width: 640px)')
const activeId = ref('')
const angle = ref<CaptureAngle>('front')
const showHistory = ref(false)
const note = ref('')
const noteAngle = ref<CaptureAngle>('other')
const downloadError = ref('')
const downloading = ref(false)
const photos = computed(() => props.item.evidences.filter((e) => e.phase === 'baseline'))
const history = computed(() => (props.item.history ?? []).filter((e) => e.phase === 'baseline'))
const gallery = computed(() =>
  showHistory.value ? [...photos.value, ...history.value] : photos.value,
)
const photo = computed(() => gallery.value.find((e) => e.id === activeId.value) ?? gallery.value[0])
const historical = computed(() => Boolean(photo.value?.supersededBy || photo.value?.removedAt))
const index = computed(() => gallery.value.findIndex((e) => e.id === photo.value?.id))
const progress = computed(() => completedCaptureAngles(props.item))
watch(
  () => [props.item.id, photo.value?.id, photo.value?.userNote, photo.value?.angle],
  () => {
    note.value = photo.value?.userNote ?? ''
    noteAngle.value = photo.value?.angle ?? 'other'
    downloadError.value = ''
  },
  { immediate: true },
)
function choose(id: string) {
  if (
    (note.value !== (photo.value?.userNote ?? '') ||
      noteAngle.value !== (photo.value?.angle ?? 'other')) &&
    !window.confirm('角度或備註尚未儲存，要放棄這次編輯並切換照片嗎？')
  )
    return
  activeId.value = id
}
function selectAngle(value: CaptureAngle) {
  angle.value = value
  const match = photos.value.find((e) => e.angle === value)
  if (match) choose(match.id)
}
async function download() {
  if (!photo.value) return
  downloading.value = true
  downloadError.value = ''
  try {
    await downloadInspectionOriginal(props.item.id, photo.value.id)
  } catch (cause) {
    downloadError.value = cause instanceof Error ? cause.message : '下載失敗'
  } finally {
    downloading.value = false
  }
}
const fmt = formatHandoverTimestamp
</script>

<template>
  <div class="space-y-5 min-w-0">
    <details
      class="capture-panel rounded-xl border p-4 space-y-3"
      :open="desktop || !photos.length"
    >
      <summary class="cursor-pointer text-sm font-semibold sm:hidden">
        拍攝角度 · {{ progress }} / 2 已完成
      </summary>
      <div class="flex items-center justify-between text-sm">
        <strong>拍攝進度 {{ progress }} / 2</strong
        ><span class="text-muted-foreground">{{ photos.length }} 張照片</span>
      </div>
      <div
        role="progressbar"
        aria-label="建議角度拍攝進度"
        :aria-valuenow="progress"
        :aria-valuemax="2"
        aria-valuemin="0"
        class="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          class="h-full rounded-full bg-primary transition-all"
          :style="{ width: `${(progress / 2) * 100}%` }"
        />
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="entry in captureAngles"
          :key="entry.value"
          type="button"
          class="rounded-lg border px-2 py-3 text-xs sm:text-sm focus-visible:ring-2 focus-visible:ring-ring"
          :class="
            angle === entry.value
              ? 'border-primary bg-primary/5 text-primary'
              : 'text-muted-foreground'
          "
          :aria-pressed="angle === entry.value"
          @click="selectAngle(entry.value)"
        >
          <CheckCircle2
            v-if="photos.some((e) => e.angle === entry.value)"
            class="mx-auto mb-1 h-4 w-4"
          /><Camera v-else class="mx-auto mb-1 h-4 w-4" />{{ entry.label }}
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" :disabled="busy" @click="emit('capture', angle)"
          ><Camera class="mr-1 h-4 w-4" />繼續拍攝</Button
        >
        <Button size="sm" variant="outline" :disabled="busy" @click="emit('upload', angle)"
          ><Plus class="mr-1 h-4 w-4" />新增照片</Button
        >
      </div>
    </details>

    <div v-if="photo" class="grid min-w-0 gap-5 md:grid-cols-2">
      <div class="min-w-0 space-y-3">
        <div
          class="relative flex h-64 items-center justify-center overflow-hidden rounded-xl bg-muted/40 sm:h-80"
        >
          <img
            :src="photo.url"
            :alt="`${item.name}存證照片 ${index + 1}`"
            class="h-full w-full object-contain"
          />
          <div class="absolute inset-x-3 bottom-3 flex items-center justify-between">
            <Button
              size="icon"
              variant="outline"
              aria-label="上一張照片"
              :disabled="index <= 0"
              @click="choose(gallery[index - 1].id)"
              ><ChevronLeft class="h-4 w-4"
            /></Button>
            <span class="rounded-full bg-background/90 px-3 py-1 text-xs"
              >{{ index + 1 }} / {{ gallery.length }}</span
            >
            <Button
              size="icon"
              variant="outline"
              aria-label="下一張照片"
              :disabled="index >= gallery.length - 1"
              @click="choose(gallery[index + 1].id)"
              ><ChevronRight class="h-4 w-4"
            /></Button>
          </div>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-2">
          <button
            v-for="(entry, i) in gallery"
            :key="entry.id"
            class="h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:ring-2 focus-visible:ring-ring"
            :class="entry.id === photo.id ? 'border-primary' : 'border-transparent'"
            :aria-label="`檢視第 ${i + 1} 張照片`"
            :aria-pressed="entry.id === photo.id"
            @click="choose(entry.id)"
          >
            <img :src="entry.url" alt="" class="h-full w-full object-cover" />
          </button>
        </div>
        <label v-if="history.length" class="flex items-center gap-2 text-xs text-muted-foreground"
          ><input v-model="showHistory" type="checkbox" />顯示重拍／移除歷程（{{
            history.length
          }}
          張）</label
        >
        <div v-if="!historical" class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="emit('capture', photo.angle ?? 'other', photo.id)"
            >重新拍攝這張</Button
          >
          <Button variant="ghost" size="sm" :disabled="busy" @click="emit('removePhoto', photo.id)"
            >移至歷程</Button
          >
        </div>
        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ photo.processingNote || '舊紀錄僅保留處理後照片，沒有原始檔。' }}
        </p>
      </div>
      <div class="min-w-0 space-y-4">
        <section class="rounded-xl bg-primary/5 p-4 space-y-2">
          <h3 class="text-sm font-semibold text-primary">AI 狀況判定 · {{ photo.aiLabel }}</h3>
          <p class="break-words text-sm leading-relaxed">{{ photo.note }}</p>
          <p class="text-xs text-muted-foreground">AI 影像辨識僅供參考，請以實際狀況確認。</p>
          <Button
            v-if="!photo.vlmResult && !historical"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="emit('retry', photo.id)"
            >重新辨識</Button
          >
        </section>
        <details class="rounded-xl border p-4" :open="desktop">
          <summary class="mb-3 cursor-pointer text-sm font-semibold">存證資訊</summary>
          <dl
            class="evidence-info grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs leading-relaxed"
          >
            <dt>存證編號</dt>
            <dd>{{ photo.evidenceNumber || `RM-IN-${photo.id.padStart(8, '0')}` }}</dd>
            <dt>房屋</dt>
            <dd>{{ photo.propertySnapshot?.address || property?.address }}</dd>
            <dt>房間／物件</dt>
            <dd>{{ item.room }}／{{ item.name }}</dd>
            <dt>拍攝時間</dt>
            <dd>
              {{
                photo.photoTakenAt
                  ? `${fmt(photo.photoTakenAt)}（裝置回報）`
                  : '未取得；不以收件時間代替'
              }}
            </dd>
            <dt>收件時間</dt>
            <dd>{{ fmt(photo.receivedAt || photo.capturedAt) }}</dd>
            <dt>照片來源</dt>
            <dd>{{ photo.captureSource === 'camera' ? '相機拍攝（裝置回報）' : '檔案上傳' }}</dd>
            <dt>重拍紀錄</dt>
            <dd>
              {{
                photo.replacesId
                  ? `重拍自 RM-IN-${photo.replacesId.padStart(8, '0')}`
                  : '此筆未標記為重拍'
              }}<span v-if="photo.supersededBy">；已由 #{{ photo.supersededBy }} 取代</span
              ><span v-if="photo.removedAt">；已移至歷程</span>
            </dd>
            <dt>原始檔</dt>
            <dd>
              {{ photo.originalAvailable ? '已保存收件原檔' : '舊紀錄未保存'
              }}<Button
                v-if="photo.originalAvailable"
                variant="outline"
                size="sm"
                class="mt-2"
                :disabled="downloading"
                @click="download"
                ><Download class="mr-1 h-3 w-3" />下載原檔</Button
              >
            </dd>
            <dt>修改狀態</dt>
            <dd>{{ photo.modificationNote || '上傳前是否經過修改無法查證。' }}</dd>
          </dl>
          <details v-if="photo.originalSha256" class="mt-3 text-xs text-muted-foreground">
            <summary class="cursor-pointer">檔案 SHA-256</summary>
            <p class="mt-2 break-all font-mono">{{ photo.originalSha256 }}</p>
          </details>
          <p v-if="downloadError" role="alert" class="mt-2 text-xs text-destructive">
            {{ downloadError }}
          </p>
        </details>
        <details class="space-y-2 rounded-xl border p-4" :open="desktop">
          <summary class="cursor-pointer text-sm font-semibold">角度分類與備註</summary>
          <label for="evidence-angle" class="text-sm font-semibold">這張照片的角度</label>
          <select
            id="evidence-angle"
            v-model="noteAngle"
            :disabled="busy || historical"
            class="w-full rounded-lg border bg-background p-2 text-sm"
          >
            <option value="other">其他／尚未分類</option>
            <option v-for="entry in captureAngles" :key="entry.value" :value="entry.value">
              {{ entry.label }}
            </option>
          </select>
          <label for="evidence-description" class="text-sm font-semibold">描述／備註</label>
          <textarea
            id="evidence-description"
            v-model="note"
            :disabled="busy || historical"
            maxlength="5000"
            rows="3"
            class="w-full resize-y rounded-lg border bg-background p-3 text-sm"
            placeholder="記錄物件現況與需要留意的位置"
          />
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>{{ note.length }} / 5000</span
            ><Button
              v-if="!historical"
              size="sm"
              variant="outline"
              :disabled="
                busy || (note === (photo.userNote ?? '') && noteAngle === (photo.angle ?? 'other'))
              "
              @click="emit('saveNote', photo.id, note, noteAngle)"
              >儲存角度與備註</Button
            >
          </div>
          <details v-if="photo.descriptionHistory?.length" class="text-xs text-muted-foreground">
            <summary class="cursor-pointer">
              描述修改紀錄（{{ photo.descriptionHistory.length }}）
            </summary>
            <p v-for="(entry, i) in photo.descriptionHistory" :key="i" class="mt-2 break-words">
              {{ fmt(entry.updatedAt) }} · 修改前：{{ entry.previous || '空白' }}
            </p>
          </details>
          <details v-if="photo.angleHistory?.length" class="text-xs text-muted-foreground">
            <summary class="cursor-pointer">
              角度分類修改紀錄（{{ photo.angleHistory.length }}）
            </summary>
            <p v-for="(entry, i) in photo.angleHistory" :key="i" class="mt-2">
              {{ fmt(entry.updatedAt) }} · {{ entry.previous }} → {{ entry.current }}
            </p>
          </details>
        </details>
      </div>
    </div>
    <p v-else class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      新增點交存證照片
    </p>
    <div
      class="mobile-evidence-actions sticky bottom-0 z-10 grid grid-cols-3 gap-2 border-t bg-background py-3 sm:hidden"
    >
      <Button
        variant="outline"
        size="sm"
        :disabled="busy || !photo || historical"
        @click="emit('capture', photo?.angle ?? 'front', photo?.id)"
        >重新拍攝</Button
      >
      <Button variant="outline" size="sm" :disabled="busy" @click="emit('upload', angle)"
        >新增照片</Button
      >
      <Button size="sm" @click="emit('close')">完成</Button>
    </div>
  </div>
</template>

<style scoped>
.evidence-info dt {
  color: var(--muted-foreground);
}
.evidence-info dd {
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (max-width: 639px) {
  .mobile-evidence-actions {
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }
}
</style>

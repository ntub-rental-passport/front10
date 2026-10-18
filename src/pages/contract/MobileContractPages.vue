<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{ files: File[]; disabled: boolean }>()
const emit = defineEmits<{
  remove: [index: number]
  move: [from: number, to: number]
}>()

const grid = ref<HTMLElement | null>(null)
const previewUrls = new Map<File, string>()
const previews = computed(() => props.files.map((file) => ({ file, url: previewUrls.get(file) })))
const draggedFile = ref<File | null>(null)
const announcement = ref('')
let pressTimer: ReturnType<typeof setTimeout> | undefined
let pointer: { id: number; x: number; y: number; element: HTMLElement } | null = null

watch(
  () => props.files,
  (files) => {
    for (const [file, url] of previewUrls) {
      if (!files.includes(file)) {
        URL.revokeObjectURL(url)
        previewUrls.delete(file)
      }
    }
    for (const file of files) {
      if (!previewUrls.has(file)) previewUrls.set(file, URL.createObjectURL(file))
    }
  },
  { immediate: true, flush: 'sync' },
)

function finishDrag(): void {
  clearTimeout(pressTimer)
  pressTimer = undefined
  const currentPointer = pointer
  pointer = null
  if (draggedFile.value) {
    announcement.value = `已移至第 ${props.files.indexOf(draggedFile.value) + 1} 頁`
  }
  draggedFile.value = null
  if (currentPointer?.element.hasPointerCapture(currentPointer.id)) {
    currentPointer.element.releasePointerCapture(currentPointer.id)
  }
}

function startPress(event: PointerEvent, file: File): void {
  if (props.disabled || !event.isPrimary || event.button !== 0 || pointer || !grid.value) return
  // 捕捉在不會隨頁序搬動的網格，避免移動縮圖節點時失去 pointer capture。
  const element = grid.value
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, element }
  element.setPointerCapture(event.pointerId)
  pressTimer = setTimeout(() => {
    draggedFile.value = file
    announcement.value = `正在移動第 ${props.files.indexOf(file) + 1} 頁`
  }, 350)
}

function movePointer(event: PointerEvent): void {
  if (!pointer || pointer.id !== event.pointerId) return
  if (!draggedFile.value) {
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) finishDrag()
    return
  }
  event.preventDefault()
  const target = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-page-index]')
  if (!target || !grid.value?.contains(target)) return
  const from = props.files.indexOf(draggedFile.value)
  const to = Number(target.dataset.pageIndex)
  if (from !== to) emit('move', from, to)
}

// 保留一般垂直捲動；長按成立後阻止原生觸控捲動，避免瀏覽器取消 pointer 拖曳。
function preventDragScroll(event: TouchEvent): void {
  if (draggedFile.value) event.preventDefault()
}

async function movePage(from: number, to: number): Promise<void> {
  emit('move', from, to)
  announcement.value = `第 ${from + 1} 頁已移至第 ${to + 1} 頁`
  await nextTick()
  grid.value
    ?.querySelector<HTMLElement>(
      `[data-page-index="${to}"] .mobile-page-controls button:not(:disabled)`,
    )
    ?.focus()
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) finishDrag()
  },
)

onBeforeUnmount(() => {
  finishDrag()
  for (const url of previewUrls.values()) URL.revokeObjectURL(url)
  previewUrls.clear()
})
</script>

<template>
  <div class="mobile-contract-pages" @keydown.stop @keydown.esc="finishDrag">
    <p class="mobile-pages-hint">長按縮圖後拖曳可調整頁序，也可使用往前／往後按鈕。</p>
    <div
      ref="grid"
      class="mobile-pages-grid"
      @pointermove="movePointer"
      @pointerup="finishDrag"
      @pointercancel="finishDrag"
      @lostpointercapture="finishDrag"
      @touchmove="preventDragScroll"
      @contextmenu.prevent
    >
      <article
        v-for="({ file, url }, index) in previews"
        :key="url"
        :data-page-index="index"
        class="mobile-page"
        :class="{ 'mobile-page--dragging': draggedFile === file }"
        :aria-label="`第 ${index + 1} 頁：${file.name}`"
      >
        <div class="mobile-page-preview" @pointerdown="startPress($event, file)">
          <img :src="url" :alt="file.name" draggable="false" />
          <span class="mobile-page-number">第 {{ index + 1 }} 頁</span>
        </div>
        <button
          type="button"
          class="mobile-page-remove"
          :disabled="disabled"
          :aria-label="`移除第 ${index + 1} 頁`"
          @click.stop="emit('remove', index)"
        >
          ×
        </button>
        <div class="mobile-page-controls">
          <button
            type="button"
            :disabled="disabled || index === 0"
            :aria-label="`第 ${index + 1} 頁往前`"
            @click.stop="movePage(index, index - 1)"
          >
            <ChevronLeft :size="20" aria-hidden="true" />
          </button>
          <button
            type="button"
            :disabled="disabled || index === files.length - 1"
            :aria-label="`第 ${index + 1} 頁往後`"
            @click.stop="movePage(index, index + 1)"
          >
            <ChevronRight :size="20" aria-hidden="true" />
          </button>
        </div>
      </article>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>

<style scoped>
.mobile-contract-pages {
  display: none;
}

@media (max-width: 639px) {
  .mobile-contract-pages {
    display: block;
    width: 100%;
    min-width: 0;
  }

  .mobile-pages-hint {
    margin: 0 0 12px;
    color: var(--contract-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .mobile-pages-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px 8px;
  }

  .mobile-page {
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--contract-border);
    border-radius: 10px;
    background: #fff;
  }

  .mobile-page--dragging {
    border-color: var(--contract-primary);
    box-shadow: 0 0 0 2px var(--contract-primary);
    opacity: 0.7;
  }

  .mobile-page-preview {
    position: relative;
    aspect-ratio: 3 / 4;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .mobile-page-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .mobile-page-number {
    position: absolute;
    bottom: 4px;
    left: 4px;
    border-radius: 6px;
    background: var(--contract-primary);
    padding: 3px 5px;
    color: #fff;
    font-size: 13px;
  }

  .mobile-page-remove {
    position: absolute;
    top: 0;
    right: 0;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 0 0 0 10px;
    background: rgb(255 255 255 / 94%);
    color: var(--contract-danger);
    font-size: 26px;
  }

  .mobile-page-controls {
    display: flex;
    height: 44px;
  }

  .mobile-page-controls button {
    display: grid;
    flex: 1;
    place-items: center;
    min-width: 44px;
    height: 44px;
    border: 0;
    border-top: 1px solid var(--contract-border);
    background: #fff;
    color: var(--contract-primary);
  }

  .mobile-page-controls button + button {
    border-left: 1px solid var(--contract-border);
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  button:focus-visible {
    outline: 2px solid var(--contract-primary);
    outline-offset: -3px;
  }
}
</style>

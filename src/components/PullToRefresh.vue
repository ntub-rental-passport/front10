<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown, LoaderCircle } from 'lucide-vue-next'
import { usePullToRefresh } from '@/src/composables/usePullToRefresh'
import { useRefreshTarget } from '@/src/composables/useRefreshTarget'

const props = defineProps<{
  enabled: boolean
  scrollContainer?: HTMLElement | null
}>()
const surface = ref<HTMLElement | null>(null)
const documentScroller = ref<HTMLElement | null>(null)
const enabled = computed(() => props.enabled)
const scroller = computed(() => props.scrollContainer ?? documentScroller.value)
const { refresh } = useRefreshTarget()
const { pullDistance, state } = usePullToRefresh({
  target: surface,
  enabled,
  getScrollTop: () => scroller.value?.scrollTop ?? 0,
  onRefresh: refresh,
})
const dragging = computed(() => state.value === 'pulling' || state.value === 'armed')

onMounted(() => {
  documentScroller.value = (document.scrollingElement ?? document.documentElement) as HTMLElement
})

watch(
  [scroller, enabled],
  ([element, active], _, onCleanup) => {
    if (!element || !active) return
    // 必須設在真正的捲動容器上；設在內容包裝層擋不住房東版面的文件橡皮筋。
    const previous = element.style.overscrollBehaviorY
    element.style.overscrollBehaviorY = 'contain'
    onCleanup(() => {
      element.style.overscrollBehaviorY = previous
    })
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <div ref="surface" class="relative min-h-full">
    <div
      class="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-center text-muted-foreground"
      :style="{
        transform: `translateY(${pullDistance - 48}px)`,
        opacity: state === 'idle' ? 0 : 1,
        transition: dragging ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
      }"
      role="status"
      :aria-label="
        state === 'refreshing'
          ? '正在重新整理'
          : state === 'armed'
            ? '放開即可重新整理'
            : '下拉重新整理'
      "
      :aria-hidden="state === 'idle'"
    >
      <span class="relative h-8 w-8 rounded-full border bg-background shadow-sm">
        <ArrowDown
          class="absolute left-1.5 top-1.5 h-5 w-5"
          :style="{
            opacity: state === 'refreshing' ? 0 : 1,
            transform: state === 'armed' ? 'rotate(180deg)' : undefined,
          }"
        />
        <LoaderCircle
          class="absolute left-1.5 top-1.5 h-5 w-5"
          :class="{ 'animate-spin': state === 'refreshing' }"
          :style="{ opacity: state === 'refreshing' ? 1 : 0 }"
        />
      </span>
    </div>
    <div
      :style="{
        transform: pullDistance ? `translateY(${pullDistance}px)` : undefined,
        transition: dragging ? 'none' : 'transform 180ms ease-out',
      }"
    >
      <slot />
    </div>
  </div>
</template>

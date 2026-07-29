<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'

const { banners } = useAdminContent()

const visibleBanners = computed(() =>
  banners.value.filter((item) => item.published).sort((a, b) => a.order - b.order),
)

const activeIndex = ref(0)
const AUTOPLAY_MS = 5000
let timer: ReturnType<typeof setInterval> | null = null

function goTo(index: number): void {
  const total = visibleBanners.value.length
  if (total === 0) return
  activeIndex.value = (index + total) % total
}

function next(): void {
  goTo(activeIndex.value + 1)
}

function previous(): void {
  goTo(activeIndex.value - 1)
}

function startAutoplay(): void {
  stopAutoplay()
  if (visibleBanners.value.length <= 1) return
  timer = setInterval(next, AUTOPLAY_MS)
}

function stopAutoplay(): void {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

// 後台調整輪播（新增、停用、排序）後，重設索引避免指向已消失的項目
watch(
  () => visibleBanners.value.length,
  (total) => {
    if (activeIndex.value >= total) activeIndex.value = 0
    startAutoplay()
  },
)

onMounted(startAutoplay)
onBeforeUnmount(stopAutoplay)
</script>

<template>
  <section
    v-if="visibleBanners.length > 0"
    class="relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/80 shadow-sm"
    @mouseenter="stopAutoplay"
    @mouseleave="startAutoplay"
  >
    <RouterLink
      v-for="(item, index) in visibleBanners"
      v-show="index === activeIndex"
      :key="item.id"
      :to="item.linkUrl"
      class="block"
    >
      <div class="relative">
        <img
          :src="item.imageUrl"
          :alt="item.title"
          class="h-48 w-full object-cover sm:h-64 lg:h-72"
        />
        <div
          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-6 py-5"
        >
          <p class="text-lg font-bold text-white sm:text-xl">{{ item.title }}</p>
        </div>
      </div>
    </RouterLink>

    <template v-if="visibleBanners.length > 1">
      <button
        type="button"
        aria-label="上一張"
        class="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white transition-colors hover:bg-black/55"
        @click="previous"
      >
        <ChevronLeft class="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="下一張"
        class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white transition-colors hover:bg-black/55"
        @click="next"
      >
        <ChevronRight class="h-5 w-5" />
      </button>

      <div class="absolute inset-x-0 bottom-3 flex justify-center gap-2">
        <button
          v-for="(item, index) in visibleBanners"
          :key="item.id"
          type="button"
          :aria-label="`切換到第 ${index + 1} 張`"
          :class="[
            'h-2 rounded-full transition-all',
            index === activeIndex ? 'w-6 bg-white' : 'w-2 bg-white/60 hover:bg-white/80',
          ]"
          @click="goTo(index)"
        />
      </div>
    </template>
  </section>
</template>

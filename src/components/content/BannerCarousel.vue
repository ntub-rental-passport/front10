<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-vue-next'
import { usePublicContent } from '@/src/composables/usePublicContent'
import { resolvePhase } from '@/src/utils/phase'
import { matchesAudience } from '@/src/utils/announcement'
import type { Banner } from '@/src/mocks/admin/content'

const props = defineProps<{
  /** 公開首頁忽略 linkUrl 並導向 /register，避免未登入訪客被 /app 路由守衛導向登入頁。 */
  public?: boolean
  /** 後台預覽傳入尚未儲存的草稿；未傳入時讀取公開輪播資料。 */
  items?: Banner[]
  /** 依租客／房東身分篩選輪播，未登入的公開首頁只顯示「全部」對象。 */
  audience?: 'tenant' | 'landlord'
}>()

const { banners } = usePublicContent()

const sourceBanners = computed(() => props.items ?? banners.value)

// 排程切換不會自動觸發重算，須等 computed 的其他依賴變動後才會更新。
function forThisSide(item: Banner): boolean {
  // 後台預覽（items）要看得到正在編輯的那張，不管它指定給誰
  if (props.items) return true
  if (!props.audience) return item.audience === 'all'
  return matchesAudience(item.audience, props.audience)
}

const visibleBanners = computed(() =>
  sourceBanners.value
    .filter((item) => forThisSide(item) && resolvePhase(item, new Date()) === 'active')
    .sort((a, b) => a.order - b.order),
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

// 圖片失敗紀錄須以 id 與 imageUrl 共同識別，避免草稿換圖後仍沿用舊網址的失敗狀態。
const failedImageKeys = ref<Set<string>>(new Set())

function imageKey(item: Banner): string {
  return `${item.id}:${item.imageUrl}`
}

function hasImageFailed(item: Banner): boolean {
  return failedImageKeys.value.has(imageKey(item))
}

function onImageError(item: Banner): void {
  failedImageKeys.value = new Set(failedImageKeys.value).add(imageKey(item))
}
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
      :to="props.public ? '/register' : item.linkUrl"
      class="block"
    >
      <div class="relative">
        <!-- 手機裁切位置須偏右，避免置中裁切時切掉輪播圖右側的人物。 -->
        <img
          v-if="!hasImageFailed(item)"
          :src="item.imageUrl"
          :alt="item.title"
          class="h-48 w-full object-cover object-[70%_50%] sm:h-64 lg:h-72"
          @error="onImageError(item)"
        />
        <div
          v-else
          class="flex h-48 w-full items-center justify-center bg-muted sm:h-64 lg:h-72"
        >
          <ImageOff class="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        </div>
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

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-vue-next'
import { usePublicContent } from '@/src/composables/usePublicContent'
import { resolvePhase } from '@/src/utils/phase'
import type { Banner } from '@/src/mocks/admin/content'

const props = defineProps<{
  /**
   * 公開首頁（未登入）用。這裡的 banner 連結都是後台為登入後的租客工作區設的
   * （/app/*），未登入訪客點下去會被路由守衛踢去 /login，行銷入口變登入牆。
   * public 時一律導去 /register，忽略 banner 自己的 linkUrl。
   */
  public?: boolean
  /**
   * 後台預覽用。不傳就讀公開的輪播（usePublicContent，後端只給生效中的
   * 資料）；傳了就用傳進來的這份——BannersTab 需要在使用者按下「儲存」之前，
   * 把正在編輯的草稿也顯示在預覽裡，這件事不能靠這個元件自己讀 store 做到。
   */
  items?: Banner[]
}>()

const { banners } = usePublicContent()

const sourceBanners = computed(() => props.items ?? banners.value)

// 跟公告一致：published 只是總開關，還要看 startAt／endAt 是不是「現在」落在
// 區間內。這裡在讀取時判斷、不做背景工作——跟 resolvePhase 的設計是一致的，
// 缺點是排程切換的當下不會自動重新渲染，但要等到別的東西觸發這個 computed
// 重算才會更新（例如切頁、後台改資料）。這個限制是刻意接受的，見
// src/utils/phase.ts。
const visibleBanners = computed(() =>
  sourceBanners.value
    .filter((item) => resolvePhase(item, new Date()) === 'active')
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

/*
 * 圖片載入失敗時的 fallback。
 *
 * key 用「id + imageUrl」而不是單純 id：後台預覽草稿時同一個 id 的圖片網址
 * 可能被改過（使用者正在編輯），網址一換就該重新給它一次機會，不能讓舊網址
 * 留下的失敗記錄卡住新網址。
 */
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
        <!-- 從偏右（70%）裁而不是正中間：輪播圖都是「標題在左下、主角在右邊」的構圖，
             手機上只看得到中間大約一半的寬度，從正中間裁會把右邊的人物切掉。
             電腦版是左右塞滿、只裁上下，不受這個設定影響。 -->
        <img
          v-if="!hasImageFailed(item)"
          :src="item.imageUrl"
          :alt="item.title"
          class="h-48 w-full object-cover object-[70%_50%] sm:h-64 lg:h-72"
          @error="onImageError(item)"
        />
        <!-- 圖床失效、防盜連、網址打錯都會落到這裡。高度跟正常圖片一樣，
             版面不會塌陷，標題也還讀得到，不是破圖加一片空白。 -->
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

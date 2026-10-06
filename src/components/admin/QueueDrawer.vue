<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight, X } from 'lucide-vue-next'

import { Badge } from '@/components/ui/badge/index'
import { useAdminQueue } from '@/src/composables/admin/useAdminQueue'

/**
 * 待辦佇列抽屜。
 *
 * ## 為什麼是抽屜而不是常駐側欄
 *
 * 後台好幾頁（使用者管理、工單、稽核）都是寬表格，常駐面板會固定吃掉
 * 280-320px，那些表格的欄位本來就已經擠。抽屜平常不佔版面，要看的時候
 * 才叫出來，而且每一頁都叫得出來——這是「跨頁面都看得到待辦」真正想要的
 * 效果，不需要為此犧牲每一頁的水平空間。
 *
 * ## 為什麼不用 components/ui/sheet
 *
 * 與 AdminLayout 的行動裝置抽屜同一個理由（那裡有完整說明）：sheet 的卸載
 * 與 body 捲動鎖都要等離場動畫的 animationend，動畫沒跑完（例如分頁被瀏覽器
 * 節流）抽屜就會留在畫面上且整頁捲不動。這裡的正確性不依賴動畫完成——
 * open 是 false 時面板就已經在畫面外且 aria-hidden，動畫純粹是裝飾。
 *
 * ## 資料來源
 *
 * 工單與額度告急都來自後端，與總覽共用 useAdminQueue 的聚合結果。
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { groups, count } = useAdminQueue()

// Esc 關閉。監聽只在開啟時掛上，關閉就拿掉——常駐的 keydown 監聽會在其他頁面
// 攔到不屬於它的 Esc（例如對話框想關自己的時候）。
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

// 元件在抽屜開著的時候被卸載（例如登出跳頁），監聽要跟著收掉
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 bg-black/30"
    aria-hidden="true"
    @click="emit('close')"
  />
  <!--
    位移用行內 transform 而非 Tailwind 的 translate 工具：v4 的 translate-x-*
    走 CSS `translate` 屬性，切換時實測會卡住不更新（同 AdminLayout 的註解）。
  -->
  <aside
    class="fixed inset-y-0 right-0 z-50 flex w-[min(360px,88vw)] flex-col border-l border-border bg-background transition-transform duration-300 ease-out"
    :style="{ transform: open ? 'translateX(0)' : 'translateX(100%)' }"
    :aria-hidden="!open"
    aria-label="待辦佇列"
  >
    <div class="flex items-start justify-between gap-3 border-b px-5 py-4">
      <div class="min-w-0">
        <p class="font-semibold">待辦佇列</p>
        <p class="mt-0.5 text-xs text-muted-foreground">只列後台做得了事的項目。</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <!--
          覆寫文字色：Badge 的 destructive variant 用的是 text-destructive-foreground，
          而那個 class 產不出 CSS（src/index.css 的 @theme 漏註冊
          --color-destructive-foreground，詳見 AdminLayout.vue 的說明）。它會改為
          繼承父層文字色，淺色模式剛好是深字所以看起來沒事（6.35），深色模式繼承
          到白字就只剩 2.70。--destructive 在深淺色是同一個值，所以文字色要明確
          指定、不能跟著模式翻轉。實測兩個模式都是 6.35。

          ⚠️ 這是就地覆寫，全站其他 Badge/Button 的 destructive variant 在深色模式
          都還是 2.70。那要改 components/ui/badge 與 button，會動到租客端，另案處理。
        -->
        <Badge
          v-if="count > 0"
          variant="destructive"
          class="text-foreground dark:text-background"
        >
          {{ count }} 件
        </Badge>
        <button
          type="button"
          class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="關閉待辦佇列"
          :tabindex="open ? 0 : -1"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <div v-for="group in groups" :key="group.kind" class="space-y-2">
        <div class="flex items-baseline justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold">
              {{ group.label }}
              <span class="ml-1.5 text-muted-foreground">{{ group.count }} 件</span>
            </p>
            <p class="truncate text-xs text-muted-foreground">{{ group.hint }}</p>
          </div>
          <RouterLink
            :to="group.to"
            class="shrink-0 whitespace-nowrap text-xs text-primary hover:underline"
            :tabindex="open ? 0 : -1"
          >
            查看全部
          </RouterLink>
        </div>

        <RouterLink
          v-for="item in group.items"
          :key="item.id"
          :to="item.to"
          class="flex min-w-0 items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
          :tabindex="open ? 0 : -1"
        >
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          <ArrowUpRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </RouterLink>

        <p v-if="group.count > group.items.length" class="text-xs text-muted-foreground">
          還有 {{ group.count - group.items.length }} 件
        </p>
      </div>

      <p v-if="groups.length === 0" class="py-10 text-center text-sm text-muted-foreground">
        目前沒有待辦事項。
      </p>
    </div>
  </aside>
</template>

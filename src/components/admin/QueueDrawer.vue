<script setup lang="ts">
import InfoTip from '@/src/components/admin/InfoTip.vue'
import { onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight, X } from 'lucide-vue-next'

import { Badge } from '@/components/ui/badge/index'
import { useAdminQueue } from '@/src/composables/admin/useAdminQueue'

/** 待辦佇列抽屜不使用 sheet，避免分頁節流導致 animationend 未觸發時面板與 body 捲動鎖無法解除。 */
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
  <!-- 使用行內 transform，因 Tailwind v4 的 translate 屬性在切換時會卡住不更新。 -->
  <aside
    class="fixed inset-y-0 right-0 z-50 flex w-[min(360px,88vw)] flex-col border-l border-border bg-background transition-transform duration-300 ease-out"
    :style="{ transform: open ? 'translateX(0)' : 'translateX(100%)' }"
    :aria-hidden="!open"
    aria-label="待辦佇列"
  >
    <div class="flex items-start justify-between gap-3 border-b px-5 py-4">
      <div class="min-w-0">
        <p class="inline-flex items-center gap-1.5 font-semibold">
          待辦佇列
          <InfoTip :tabindex="open ? 0 : -1" text="只列後台做得了事的項目。" />
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <!-- text-destructive-foreground 未產生 CSS，需明確覆寫文字色以免深色模式繼承白字而對比不足。 -->
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
            <p class="inline-flex items-center gap-1.5 text-sm font-semibold">
              {{ group.label }}
              <span class="ml-1.5 text-muted-foreground">{{ group.count }} 件</span>
              <InfoTip :tabindex="open ? 0 : -1" :text="group.hint" />
            </p>
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

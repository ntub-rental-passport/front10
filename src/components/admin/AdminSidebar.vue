<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ShieldCheck } from 'lucide-vue-next'

import { navIcon } from './nav-icons'
import ThemeToggle from './ThemeToggle.vue'
import { useNow } from '@/src/composables/useNow'
import { adminNavGroups } from '@/src/utils/admin-rbac'
import { formatDateTime } from '@/src/utils/admin-format'

/** 後台左側導覽；側欄使用固定品牌底色與亮度，確保深淺色模式的各層文字都符合 AA 對比。 */
const route = useRoute()
const now = useNow()

const clock = computed(() => formatDateTime(now.value.toISOString()))

function isActive(path: string): boolean {
  // 總覽要完全相符，否則它會在每一個 /admin/* 底下都呈現選中
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}
</script>

<template>
  <!-- 使用 sticky 保持側欄可見且留在 flex 版面中，避免 fixed 需要另外同步內容區的邊距。 -->
  <aside
    class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-black/10 bg-sidebar-surface text-sidebar-surface-foreground xl:flex"
  >
    <RouterLink
      to="/admin"
      class="flex h-16 shrink-0 items-center gap-2 px-5 font-bold transition-opacity hover:opacity-80"
    >
      <ShieldCheck class="size-5 shrink-0" aria-hidden="true" />
      <span class="truncate">RentMate Admin</span>
    </RouterLink>

    <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <div v-for="group in adminNavGroups" :key="group.label" class="space-y-1">
        <p
          v-if="group.items.length > 1"
          class="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-surface-foreground/55"
        >
          {{ group.label }}
        </p>

        <RouterLink
          v-for="item in group.items"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
          :class="
            isActive(item.path)
              ? 'bg-sidebar-surface-foreground font-semibold text-sidebar-surface'
              : 'text-sidebar-surface-foreground/70 hover:bg-sidebar-surface-foreground/10 hover:text-sidebar-surface-foreground'
          "
        >
          <component :is="navIcon(item.path)" class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>
      </div>
    </nav>

    <div
      class="flex shrink-0 items-end justify-between gap-2 border-t border-white/10 px-5 py-4 text-xs"
    >
      <div class="min-w-0">
        <p class="truncate font-medium text-sidebar-surface-foreground/70">
          管理員
        </p>
        <!-- 時間到整分才跳，不是從載入起算每 60 秒（見 clock-tick.ts） -->
        <p class="mt-0.5 tabular-nums text-sidebar-surface-foreground/55">{{ clock }}</p>
      </div>

      <ThemeToggle
        class="-mr-2 shrink-0 rounded-lg px-2 py-1 text-sidebar-surface-foreground/70 transition-colors hover:bg-sidebar-surface-foreground/10 hover:text-sidebar-surface-foreground"
      />
    </div>
  </aside>
</template>

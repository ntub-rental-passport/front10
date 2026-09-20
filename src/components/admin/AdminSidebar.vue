<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ShieldCheck } from 'lucide-vue-next'

import { navIcon } from './nav-icons'
import { useNow } from '@/src/composables/useNow'
import { useAdminRbac } from '@/src/composables/admin/useAdminRbac'
import { adminRoleLabels } from '@/src/utils/admin-rbac'
import { formatDateTime } from '@/src/utils/admin-format'

/**
 * 後台左側導覽。
 *
 * ## 為什麼是深紫而不是白
 *
 * 側欄是整頁唯一一塊大面積的品牌色。深淺色用同一個值（--sidebar-surface），
 * 因為如果它跟著主題翻轉，深色模式下就變成「深底上再放一塊深底」。
 * 亮度壓到 0.32 而不是用 --primary-surface 的 0.45，是為了讓「選中／未選／
 * 分組標題」三層文字都過 AA —— 完整數據在 src/index.css 的註解裡。
 *
 * ## 分組標題只有一項時不顯示
 *
 * RBAC 會依角色過濾：一般管理員的「系統」組只剩「系統監控」一項。一條分組
 * 標題底下只掛一個項目，看起來像程式出錯，所以那種情況直接平鋪。
 *
 * ## 底部為什麼沒有登出
 *
 * 登出在頂部列的頭像選單裡。側欄再放一個，會讓人懷疑這兩個是不是不一樣的
 * 東西（例如一個是登出、一個是切換帳號）。一個出口就好。
 */
const route = useRoute()
const { visibleNavGroups, currentAdminRole } = useAdminRbac()
const now = useNow()

const clock = computed(() => formatDateTime(now.value.toISOString()))

function isActive(path: string): boolean {
  // 總覽要完全相符，否則它會在每一個 /admin/* 底下都呈現選中
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}
</script>

<template>
  <aside
    class="hidden w-60 shrink-0 flex-col border-r border-black/10 bg-sidebar-surface text-sidebar-surface-foreground xl:flex"
  >
    <RouterLink
      to="/admin"
      class="flex h-16 shrink-0 items-center gap-2 px-5 font-bold transition-opacity hover:opacity-80"
    >
      <ShieldCheck class="size-5 shrink-0" aria-hidden="true" />
      <span class="truncate">RentMate Admin</span>
    </RouterLink>

    <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <div v-for="group in visibleNavGroups" :key="group.label" class="space-y-1">
        <!-- 只剩一項時不畫分組標題，見檔頭說明 -->
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

    <div class="shrink-0 border-t border-white/10 px-5 py-4 text-xs">
      <p class="font-medium text-sidebar-surface-foreground/70">
        {{ adminRoleLabels[currentAdminRole] }}
      </p>
      <!-- 時間到整分才跳，不是從載入起算每 60 秒（見 clock-tick.ts） -->
      <p class="mt-0.5 tabular-nums text-sidebar-surface-foreground/55">{{ clock }}</p>
    </div>
  </aside>
</template>

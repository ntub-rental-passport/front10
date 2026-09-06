<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import brandLogoIcon from '@/src/assets/Logo/Rentmate-Logo-icon.png'
import { useNavigation } from '@/src/composables/useNavigation'
import { useFeatureGate } from '@/src/composables/useFeatureGate'
import FeatureMaintenanceNotice from '@/src/components/FeatureMaintenanceNotice.vue'
import MaintenanceToaster from '@/src/components/MaintenanceToaster.vue'

const route = useRoute()
const { navItems, accountItem, mobileNavItems } = useNavigation()
const { blocked, outage, isPathUnderMaintenance } = useFeatureGate()
const SIDEBAR_PIN_KEY = 'rentmate-sidebar-pinned'

const isSidebarPinned = ref(false)
const isSidebarHovered = ref(false)

const isTenantGuideRoute = computed(
  () =>
    route.path === '/app/contract' ||
    route.path === '/app/contract/air-conditioner-repair' ||
    route.path === '/app/contract/electricity-fee' ||
    route.path === '/app/tenant-guide',
)
const hidesDesktopSidebar = computed(
  () => isTenantGuideRoute.value || route.path === '/app/contract-analysis',
)
const isSidebarExpanded = computed(() => isSidebarPinned.value || isSidebarHovered.value)
const desktopNavItems = computed(() => [...navItems, accountItem])
const isWideContentRoute = computed(
  () => isTenantGuideRoute.value || route.path.startsWith('/app/notes') || route.path === '/app/repairs',
)

function isActive(path: string): boolean {
  if (path === '/app') return route.path === '/app'
  return route.path.startsWith(path)
}

function toggleSidebarPin(): void {
  isSidebarPinned.value = !isSidebarPinned.value
}

onMounted(() => {
  isSidebarPinned.value = window.localStorage.getItem(SIDEBAR_PIN_KEY) === 'true'
})

watch(isSidebarPinned, (value) => {
  window.localStorage.setItem(SIDEBAR_PIN_KEY, String(value))
})
</script>

<template>
  <div class="flex h-screen w-full bg-muted/20">
    <!-- Desktop Sidebar -->
    <aside
      v-if="!hidesDesktopSidebar"
      class="relative hidden flex-col border-r bg-sidebar-background transition-[width] duration-300 ease-out sm:flex"
      :class="isSidebarExpanded ? 'w-64' : 'w-20'"
      @mouseenter="isSidebarHovered = true"
      @mouseleave="isSidebarHovered = false"
    >
      <div
        class="flex h-14 items-center border-b font-bold text-primary transition-all duration-300"
        :class="isSidebarExpanded ? 'justify-between px-4' : 'justify-center px-3'"
      >
        <RouterLink to="/app" class="flex min-w-0 items-center" :class="isSidebarExpanded ? 'gap-2' : 'justify-center'">
          <img :src="brandLogoIcon" alt="RentMate Logo" class="h-6 w-6 shrink-0 object-contain" />
          <span
            class="flex h-6 translate-y-px items-center overflow-hidden whitespace-nowrap leading-none transition-all duration-300"
            :class="isSidebarExpanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'"
          >
            租隊友 RentMate
          </span>
        </RouterLink>

        <button
          type="button"
          class="rounded-full border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :class="isSidebarExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'"
          :title="isSidebarPinned ? '取消固定展開' : '固定展開側邊欄'"
          @click="toggleSidebarPin"
        >
          <ChevronLeft v-if="isSidebarPinned" class="h-4 w-4" />
          <ChevronRight v-else class="h-4 w-4" />
        </button>
      </div>

      <nav
        class="flex flex-1 flex-col transition-all duration-300"
        :class="isSidebarExpanded ? 'p-4' : 'px-2 py-4'"
      >
        <div class="space-y-1">
          <RouterLink
            v-for="item in desktopNavItems"
            :key="item.path"
            :to="item.path"
            :title="isPathUnderMaintenance(item.path) ? `${item.label}（維護中）` : item.label"
            :class="cn(
              'flex rounded-md text-sm font-medium transition-all duration-300',
              isSidebarExpanded ? 'items-center gap-3 px-3 py-2' : 'justify-center px-0 py-3',
              isActive(item.path)
                ? 'bg-primary text-primary-foreground'
                : isPathUnderMaintenance(item.path)
                  ? 'text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0" />
            <span
              class="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap transition-all duration-300"
              :class="isSidebarExpanded ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0'"
            >
              {{ item.label }}
              <span v-if="isPathUnderMaintenance(item.path)" class="shrink-0 text-xs font-normal">（維護中）</span>
            </span>
          </RouterLink>
        </div>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
      <div :class="isWideContentRoute ? 'min-h-full w-full' : 'mx-auto min-h-full max-w-[1400px] p-4 md:p-6'">
        <!--
          維護攔截刻意不 redirect：使用者要找的東西還在這個網址底下，只是
          暫時關著，書籤與分享連結都該繼續有效。管理員不受這裡影響（見
          useFeatureGate 的說明），因為改完設定總得自己點一遍確認。
        -->
        <FeatureMaintenanceNotice v-if="blocked && outage" :outage="outage" />
        <RouterView v-else />
      </div>
      <footer class="border-t border-slate-800 bg-[linear-gradient(180deg,_#111827,_#0f172a)] text-slate-300">
        <div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-4 text-center">
          <p class="text-sm text-slate-300/90">臺北商業大學畢業專題｜AI 租屋資訊整合與契約輔助平台展示頁</p>
          <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>聯絡資訊：rentmate.project@example.com</span>
            <span class="hidden text-slate-600 sm:inline">|</span>
            <span>展示版本 v0.0.0</span>
            <span class="hidden text-slate-600 sm:inline">|</span>
            <span>2026 Graduation Project Showcase</span>
          </div>
        </div>
      </footer>
    </main>

    <!-- Mobile Bottom Nav -->
    <nav class="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t bg-background sm:hidden">
      <RouterLink
        v-for="item in mobileNavItems"
        :key="item.path"
        :to="item.path"
        :title="isPathUnderMaintenance(item.path) ? `${item.label}（維護中）` : item.label"
        :class="cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-colors',
          isActive(item.path)
            ? 'text-primary'
            : isPathUnderMaintenance(item.path)
              ? 'text-muted-foreground/50'
              : 'text-muted-foreground'
        )"
      >
        <component :is="item.icon" class="h-5 w-5" />
        {{ item.label }}
      </RouterLink>
    </nav>

    <!-- 掛在外框最外層，整個 /app 只會有一個實例，避免重複的維護提示 -->
    <MaintenanceToaster />
  </div>
</template>

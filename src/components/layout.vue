<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { ChevronLeft, ChevronRight, Home } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { useNavigation } from '@/src/composables/useNavigation'

const route = useRoute()
const { navItems, accountItem } = useNavigation()
const SIDEBAR_PIN_KEY = 'rentmate-sidebar-pinned'

const isSidebarPinned = ref(false)
const isSidebarHovered = ref(false)

const isSidebarExpanded = computed(() => isSidebarPinned.value || isSidebarHovered.value)
const desktopNavItems = computed(() => [...navItems, accountItem])

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
      class="relative hidden flex-col border-r bg-background transition-[width] duration-300 ease-out sm:flex"
      :class="isSidebarExpanded ? 'w-64' : 'w-20'"
      @mouseenter="isSidebarHovered = true"
      @mouseleave="isSidebarHovered = false"
    >
      <div
        class="flex h-14 items-center border-b font-bold text-primary transition-all duration-300"
        :class="isSidebarExpanded ? 'justify-between px-4' : 'justify-center px-3'"
      >
        <RouterLink to="/app" class="flex min-w-0 items-center" :class="isSidebarExpanded ? 'gap-2' : 'justify-center'">
          <Home class="h-5 w-5 shrink-0" />
          <span
            class="overflow-hidden whitespace-nowrap transition-all duration-300"
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
            :title="item.label"
            :class="cn(
              'flex rounded-md text-sm font-medium transition-all duration-300',
              isSidebarExpanded ? 'items-center gap-3 px-3 py-2' : 'justify-center px-0 py-3',
              isActive(item.path)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0" />
            <span
              class="overflow-hidden whitespace-nowrap transition-all duration-300"
              :class="isSidebarExpanded ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0'"
            >
              {{ item.label }}
            </span>
          </RouterLink>
        </div>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
      <div class="container mx-auto min-h-full max-w-5xl p-4 md:p-6">
        <RouterView />
      </div>
    </main>

    <!-- Mobile Bottom Nav -->
    <nav class="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t bg-background sm:hidden">
      <RouterLink
        v-for="item in navItems.slice(0, 5)"
        :key="item.path"
        :to="item.path"
        :class="cn(
          'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
          isActive(item.path) ? 'text-primary' : 'text-muted-foreground'
        )"
      >
        <component :is="item.icon" class="h-5 w-5" />
        {{ item.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { Home } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { useNavigation } from '@/src/composables/useNavigation'

const route = useRoute()
const { navItems } = useNavigation()

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="flex h-screen w-full bg-muted/20">
    <!-- Desktop Sidebar -->
    <aside class="hidden w-64 flex-col border-r bg-background sm:flex">
      <div class="flex h-14 items-center border-b px-4 font-bold text-primary">
        <Home class="mr-2 h-5 w-5" />
        租隊友 RentMate
      </div>
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            isActive(item.path)
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )"
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
      <div class="container mx-auto p-4 md:p-6 max-w-5xl">
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

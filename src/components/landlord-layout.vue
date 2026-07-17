<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Building2, FileText, Home, LogOut, Menu, ReceiptText, Settings, Users, Wrench, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { signOut } from '@/src/composables/useAuth'

const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const isSidebarHovered = ref(false)
const navItems = [
  { label: '總覽', path: '/landlord', icon: Home },
  { label: '房務', path: '/landlord/properties', icon: Building2 },
  { label: '租客', path: '/landlord/tenants', icon: Users },
  { label: '帳務', path: '/landlord/finance', icon: ReceiptText },
  { label: '報修', path: '/landlord/maintenance', icon: Wrench },
  { label: '合約', path: '/landlord/contracts', icon: FileText },
  { label: '設定', path: '/landlord/settings', icon: Settings },
]

function isActive(path: string): boolean {
  return path === '/landlord' ? route.path === path : route.path.startsWith(path)
}

async function handleSignOut(): Promise<void> {
  signOut()
  await router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-[#f7f4ea] text-[#233129]">
    <header class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e4dfd2] bg-[#fbf9f2]/95 px-4 backdrop-blur lg:hidden">
      <RouterLink to="/landlord" class="flex items-center gap-2 font-bold"><span class="grid h-9 w-9 place-items-center rounded-full bg-[#5c8163] text-white"><Home class="h-4 w-4" /></span>RentMate 房東</RouterLink>
      <button class="rounded-xl border border-[#ddd6c8] p-2" aria-label="開啟選單" @click="mobileOpen = !mobileOpen"><X v-if="mobileOpen" class="h-5 w-5" /><Menu v-else class="h-5 w-5" /></button>
    </header>

    <aside
      :class="['fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col overflow-hidden border-r border-[#e2ddcf] bg-[#f9f6ed] py-7 transition-[width,transform,padding] duration-300 ease-out lg:translate-x-0', isSidebarHovered ? 'lg:w-[264px] lg:px-5' : 'lg:w-20 lg:px-2', mobileOpen ? 'translate-x-0 px-5' : '-translate-x-full px-5']"
      @mouseenter="isSidebarHovered = true"
      @mouseleave="isSidebarHovered = false"
    >
      <RouterLink :class="['flex min-h-20 items-center rounded-[1.5rem] border border-[#e1dbce] bg-white/80 shadow-sm transition-all duration-300', isSidebarHovered ? 'lg:gap-3 lg:p-4' : 'lg:justify-center lg:border-transparent lg:bg-transparent lg:p-2 lg:shadow-none', 'gap-3 p-4']" to="/landlord" @click="mobileOpen = false">
        <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#5c8163] text-white"><Home class="h-5 w-5" /></span>
        <span :class="['overflow-hidden whitespace-nowrap transition-all duration-300', isSidebarHovered ? 'lg:max-w-[150px] lg:opacity-100' : 'lg:max-w-0 lg:opacity-0', 'max-w-[150px] opacity-100']"><strong class="block text-lg">RentMate</strong><small class="text-[#7b827d]">房東管理後台</small></span>
      </RouterLink>

      <nav class="mt-7 space-y-2">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" :title="item.label" :class="['flex items-center rounded-2xl py-3.5 font-semibold transition-all duration-300', isSidebarHovered ? 'lg:gap-4 lg:px-4' : 'lg:justify-center lg:px-0', 'gap-4 px-4', isActive(item.path) ? 'bg-[#5b8263] text-white shadow-[0_12px_28px_rgba(76,112,83,.18)]' : 'text-[#526057] hover:bg-white/80']" @click="mobileOpen = false">
          <span :class="['grid h-8 w-8 shrink-0 place-items-center rounded-full', isActive(item.path) ? 'bg-white/12' : 'bg-white']"><component :is="item.icon" class="h-4 w-4" /></span>
          <span :class="['overflow-hidden whitespace-nowrap transition-all duration-300', isSidebarHovered ? 'lg:max-w-[120px] lg:opacity-100' : 'lg:max-w-0 lg:opacity-0', 'max-w-[120px] opacity-100']">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <button :class="['mt-auto flex items-center rounded-xl py-3 text-sm text-[#747b76] transition-all duration-300 hover:bg-white', isSidebarHovered ? 'lg:justify-start lg:gap-3 lg:px-4' : 'lg:justify-center lg:px-0', 'justify-start gap-3 px-4']" title="登出" @click="handleSignOut"><LogOut class="h-4 w-4 shrink-0" /><span :class="['overflow-hidden whitespace-nowrap transition-all duration-300', isSidebarHovered ? 'lg:max-w-[80px] lg:opacity-100' : 'lg:max-w-0 lg:opacity-0', 'max-w-[80px] opacity-100']">登出</span></button>
    </aside>
    <div v-if="mobileOpen" class="fixed inset-0 z-30 bg-black/20 lg:hidden" @click="mobileOpen = false" />

    <main :class="['min-h-screen p-4 transition-[margin] duration-300 sm:p-6 lg:p-8 xl:p-10', isSidebarHovered ? 'lg:ml-[264px]' : 'lg:ml-20']"><RouterView /></main>
  </div>
</template>

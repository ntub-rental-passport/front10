<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  Building2,
  FileText,
  Home,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-vue-next'
import { ref } from 'vue'
import { signOut } from '@/src/composables/useAuth'

const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const desktopCollapsed = ref(true)
const navItems = [
  { label: '總覽', path: '/landlord', icon: Home },
  { label: '房務', path: '/landlord/properties', icon: Building2 },
  { label: '租客', path: '/landlord/tenants', icon: Users },
  { label: '財務管理', path: '/landlord/finance', icon: ReceiptText },
  { label: '修繕', path: '/landlord/maintenance', icon: Wrench },
  { label: '合約管理', path: '/landlord/contracts', icon: FileText },
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
    <header
      class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e4dfd2] bg-[#fbf9f2]/95 px-4 backdrop-blur lg:hidden"
    >
      <RouterLink to="/landlord" class="flex items-center gap-2 font-bold"
        ><span class="grid h-9 w-9 place-items-center rounded-full bg-[#5c8163] text-white"
          ><Home class="h-4 w-4" /></span
        >RentMate 房東</RouterLink
      >
      <button
        class="rounded-xl border border-[#ddd6c8] p-2"
        aria-label="開啟選單"
        @click="mobileOpen = !mobileOpen"
      >
        <X v-if="mobileOpen" class="h-5 w-5" /><Menu v-else class="h-5 w-5" />
      </button>
    </header>

    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#e2ddcf] bg-[#f9f6ed] px-4 py-5 transition-[width,padding,transform] duration-300 lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        desktopCollapsed ? 'lg:w-20 lg:px-2' : 'lg:w-[248px] lg:px-4',
      ]"
      @mouseenter="desktopCollapsed = false"
      @mouseleave="desktopCollapsed = true"
    >
      <RouterLink
        :class="[
          'flex min-h-[74px] items-center gap-3 rounded-[1.35rem] border border-[#e1dbce] bg-white/85 p-3.5 shadow-[0_8px_24px_rgba(66,72,60,.06)] transition-all',
          desktopCollapsed
            ? 'lg:justify-center lg:border-transparent lg:bg-transparent lg:p-1 lg:shadow-none'
            : '',
        ]"
        to="/landlord"
        @click="mobileOpen = false"
      >
        <span
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#5c8163] text-white"
          ><Home class="h-5 w-5"
        /></span>
        <span :class="desktopCollapsed ? 'lg:hidden' : ''"
          ><strong class="block text-lg leading-tight">RentMate</strong
          ><small class="text-[#7b827d]">房東管理後台</small></span
        >
      </RouterLink>

      <div
        :class="[
          'mt-4 rounded-2xl border border-[#e5ded1] bg-white/65 p-3',
          desktopCollapsed ? 'lg:hidden' : '',
        ]"
      >
        <div class="flex items-center justify-between text-[11px] text-[#7b827d]">
          <span>目前工作區</span
          ><span class="rounded-full bg-[#e7f2e8] px-2 py-0.5 font-bold text-[#52775a]"
            >擁有者</span
          >
        </div>
        <p class="mt-1.5 text-sm font-bold">我的出租物件</p>
      </div>

      <nav class="mt-4 space-y-1.5" aria-label="房東管理導覽">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :title="desktopCollapsed ? item.label : undefined"
          :class="[
            'flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold transition-colors',
            desktopCollapsed ? 'lg:justify-center lg:px-0' : '',
            isActive(item.path)
              ? 'bg-[#5b8263] text-white shadow-[0_12px_28px_rgba(76,112,83,.18)]'
              : 'text-[#526057] hover:bg-white/90',
          ]"
          @click="mobileOpen = false"
        >
          <span
            :class="[
              'grid h-8 w-8 shrink-0 place-items-center rounded-full',
              isActive(item.path) ? 'bg-white/12' : 'bg-white',
            ]"
            ><component :is="item.icon" class="h-4 w-4" /></span
          ><span :class="desktopCollapsed ? 'lg:hidden' : ''">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div
        :class="[
          'mt-auto rounded-[1.25rem] border border-[#e4ddcf] bg-white/70 p-3.5',
          desktopCollapsed ? 'lg:hidden' : '',
        ]"
      >
        <div class="flex gap-2.5">
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e5f3e7] text-[#5b8263]"
            ><Sparkles class="h-4 w-4"
          /></span>
          <div>
            <p class="text-sm font-bold">使用小秘訣</p>
            <p class="mt-1 text-xs leading-5 text-[#788079]">先補齊房間資料，總覽數字會更準確。</p>
          </div>
        </div>
        <RouterLink
          to="/landlord/properties"
          class="mt-3 block rounded-xl border border-[#bfd2c1] py-2 text-center text-xs font-bold text-[#5b8263] hover:bg-[#edf6ee]"
          >前往設定</RouterLink
        >
      </div>
      <button
        :class="[
          'mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#747b76] hover:bg-white',
          desktopCollapsed ? 'lg:justify-center lg:px-0' : '',
        ]"
        :title="desktopCollapsed ? '登出' : undefined"
        @click="handleSignOut"
      >
        <LogOut class="h-4 w-4" /><span :class="desktopCollapsed ? 'lg:hidden' : ''">登出</span>
      </button>
    </aside>
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-30 bg-black/25 lg:hidden"
      @click="mobileOpen = false"
    />
    <main
      :class="[
        'min-h-screen p-4 transition-[margin] duration-300 sm:p-6 lg:p-8 xl:p-10',
        desktopCollapsed ? 'lg:ml-20' : 'lg:ml-[248px]',
      ]"
    >
      <RouterView />
    </main>
  </div>
</template>

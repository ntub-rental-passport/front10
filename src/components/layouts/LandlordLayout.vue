<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  Building2,
  FileText,
  Home,
  LogOut,
  ReceiptText,
  Settings,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import DesktopOnlyNotice from '@/src/components/DesktopOnlyNotice.vue'
import LandlordNotificationBell from '@/src/components/landlord/LandlordNotificationBell.vue'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { useLandlordDeviceGate } from '@/src/composables/useDeviceGate'
import {
  activeWorkspaceOwnerId,
  setActiveWorkspaceOwnerId,
} from '@/src/services/landlordApiClient'
import { fetchWorkspaces, type WorkspaceOption } from '@/src/services/landlordWorkspaceApi'
import { isMobileUnsupportedLandlordPath } from '@/src/utils/mobile-surface'

const route = useRoute()
const router = useRouter()
const { blocked: deviceBlocked } = useLandlordDeviceGate()
const mobileUnsupported = computed(
  () => deviceBlocked.value && isMobileUnsupportedLandlordPath(route.path),
)
const desktopCollapsed = ref(true)
const navItems = [
  { label: '總覽', path: '/landlord', icon: Home },
  { label: '房務', path: '/landlord/properties', icon: Building2 },
  { label: '租客', path: '/landlord/tenants', icon: Users },
  { label: '財務管理', path: '/landlord/finance', icon: ReceiptText },
  { label: '修繕', path: '/landlord/maintenance', icon: Wrench },
  { label: '合約管理', path: '/landlord/contracts', icon: FileText },
  { label: '方案與訂閱', path: '/landlord/subscription', icon: Sparkles },
  { label: '設定', path: '/landlord/settings', icon: Settings },
]

// 手機底部列只有 5 格：財務管理與合約管理手機不提供（寬表格），
// 方案與訂閱走設定頁（settings.vue 已有 plan 入口）。
const mobileNavItems = [
  { label: '總覽', path: '/landlord', icon: Home },
  { label: '房務', path: '/landlord/properties', icon: Building2 },
  { label: '租客', path: '/landlord/tenants', icon: Users },
  { label: '修繕', path: '/landlord/maintenance', icon: Wrench },
  { label: '設定', path: '/landlord/settings', icon: Settings },
]

// 工作區：自己的，加上以團隊成員身分加入的。選擇存在 sessionStorage（依帳號區分）。
const workspaces = ref<WorkspaceOption[]>([])
const selectedOwnerId = ref(activeWorkspaceOwnerId() ?? getAuthSession()?.userId ?? '')
const currentWorkspace = computed(() =>
  workspaces.value.find((item) => String(item.owner_id) === selectedOwnerId.value) ?? workspaces.value[0] ?? null,
)

async function loadWorkspaces(): Promise<void> {
  try {
    workspaces.value = (await fetchWorkspaces()).items
    // 被移出工作區後，存著的選擇已經無效：回到自己的
    if (!workspaces.value.some((item) => String(item.owner_id) === selectedOwnerId.value)) {
      switchWorkspace(String(workspaces.value[0]?.owner_id ?? ''))
    }
  } catch {
    workspaces.value = []
  }
}

function switchWorkspace(ownerId: string): void {
  selectedOwnerId.value = ownerId
  setActiveWorkspaceOwnerId(ownerId)
}

onMounted(loadWorkspaces)

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
      class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e4dfd2] bg-[#fbf9f2]/95 px-4 backdrop-blur lg:px-8"
      :class="desktopCollapsed ? 'lg:ml-20' : 'lg:ml-[248px]'"
    >
      <RouterLink to="/landlord" class="flex items-center gap-2 font-bold"
        ><span class="grid h-9 w-9 place-items-center rounded-full bg-[#5c8163] text-white"
          ><Home class="h-4 w-4" /></span
        >RentMate 房東</RouterLink
      >
      <div class="flex items-center">
        <LandlordNotificationBell />
      </div>
    </header>

    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[#e2ddcf] bg-[#f9f6ed] px-4 py-5 transition-[width,padding] duration-300 lg:flex',
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
            >{{ currentWorkspace?.role_label ?? '擁有者' }}</span
          >
        </div>
        <select
          v-if="workspaces.length > 1"
          class="mt-1.5 w-full rounded-lg border border-[#e1dbce] bg-white px-2 py-1.5 text-sm font-bold"
          aria-label="切換工作區"
          :value="selectedOwnerId"
          @change="switchWorkspace(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in workspaces" :key="item.owner_id" :value="String(item.owner_id)">
            {{ item.name }}{{ item.role === 'owner' ? '' : `（${item.role_label}）` }}
          </option>
        </select>
        <p v-else class="mt-1.5 text-sm font-bold">{{ currentWorkspace?.name ?? '我的出租物件' }}</p>
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
    <main
      :class="[
        'min-h-screen p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] transition-[margin] duration-300 sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8 xl:p-10 xl:pb-10',
        desktopCollapsed ? 'lg:ml-20' : 'lg:ml-[248px]',
      ]"
    >
      <DesktopOnlyNotice
        v-if="mobileUnsupported"
        title="這一頁請用電腦開"
        description=""
        :show-sign-out="false"
        :full-height="false"
        home-path="/landlord"
      />
      <RouterView v-else />
    </main>
    <nav
      class="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-[#e2ddcf] bg-[#fbf9f2] pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="房東手機導覽"
    >
      <RouterLink
        v-for="item in mobileNavItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
          isActive(item.path) ? 'text-[#5b8263]' : 'text-[#526057]',
        ]"
      >
        <component :is="item.icon" class="h-5 w-5" />
        {{ item.label }}
      </RouterLink>
    </nav>
  </div>
</template>

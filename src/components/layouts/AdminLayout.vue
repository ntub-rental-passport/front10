<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Bell, ListChecks, LogOut, Menu, ShieldCheck, X } from 'lucide-vue-next'

import { Avatar, AvatarFallback } from '@/components/ui/avatar/index'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu/index'
import { cn } from '@/lib/utils'
import AdminSidebar from '@/src/components/admin/AdminSidebar.vue'
import DesktopOnlyNotice from '@/src/components/DesktopOnlyNotice.vue'
import { useAdminDeviceGate } from '@/src/composables/useDeviceGate'
import MaintenanceChip from '@/src/components/admin/MaintenanceChip.vue'
import QueueDrawer from '@/src/components/admin/QueueDrawer.vue'
import { navIcon } from '@/src/components/admin/nav-icons'
import ThemeToggle from '@/src/components/admin/ThemeToggle.vue'
import {
  startAdminNotificationPolling,
  stopAdminNotificationPolling,
  useAdminNotificationCenter,
} from '@/src/composables/admin/useAdminNotificationCenter'
import { useAdminPageTitle } from '@/src/composables/admin/useAdminPageTitle'
import { useAdminQueue } from '@/src/composables/admin/useAdminQueue'
import { useAdminIdleLogout } from '@/src/composables/admin/useAdminIdleLogout'
import { loadAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { clearLegacyAdminData } from '@/src/composables/admin/useAdminStore'
import { ADMIN_IDLE_MINUTES } from '@/src/utils/admin-idle'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { adminNavGroups } from '@/src/utils/admin-rbac'
import { initialOf } from '@/src/utils/admin-recent-logins'

const route = useRoute()
const { blocked: deviceBlocked } = useAdminDeviceGate()
const router = useRouter()

onMounted(() => {
  clearLegacyAdminData()
  void loadAdminSettings()
  startAdminNotificationPolling()
})
onBeforeUnmount(stopAdminNotificationPolling)
const { unreadCount: adminUnread } = useAdminNotificationCenter()
const { count: queueCount } = useAdminQueue()

const currentPath = computed(() => route.path)
const { crumbs, title } = useAdminPageTitle(currentPath)

const mobileOpen = ref(false)
const queueOpen = ref(false)

/** text-destructive-foreground 缺少主題註冊，單獨補註冊會降低全站 destructive 元件對比，須連同底色 token 一起調整。 */
const COUNTER_BADGE_CLASS =
  'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center ' +
  'rounded-full bg-destructive-surface px-1 text-[10px] font-bold ' +
  'text-destructive-surface-foreground'

// 抽屜裡點了項目就關起來，否則導覽完抽屜還蓋在內容上
watch(
  () => route.path,
  () => {
    mobileOpen.value = false
    queueOpen.value = false
  },
)

function isActive(path: string): boolean {
  // 總覽要完全相符，否則它會在每一個 /admin/* 底下都呈現選中
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}

const session = computed(() => getAuthSession())
const displayName = computed(() => session.value?.nickname ?? session.value?.email ?? '管理員')

const initials = computed(() =>
  initialOf(session.value?.nickname ?? null, session.value?.email ?? ''),
)

async function handleSignOut(): Promise<void> {
  signOut()
  await router.push('/')
}

// 閒置登出前須先提醒，登出後導回內部登入頁並說明原因，避免被誤認為資料載入失敗。
const { warning: idleWarning, secondsLeft: idleSecondsLeft, stayActive } = useAdminIdleLogout(
  async (reason) => {
    signOut()
    await router.push({ path: '/staff-login', query: { reason } })
  },
)
</script>

<template>
  <!-- 背景漸層須使用主題 token，避免深色模式露出淺色背景而影響標題對比。 -->
  <DesktopOnlyNotice v-if="deviceBlocked" />
  <div v-else class="flex min-h-screen bg-[linear-gradient(180deg,_var(--background),_var(--muted))]">
    <AdminSidebar />

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      >
        <div class="flex h-16 items-center gap-4 px-6 lg:px-10">
          <!-- 側欄從 xl 才出現，漢堡選單須保留到 xl，避免 1024–1279px 間沒有導覽。 -->
          <button
            type="button"
            class="rounded-xl border border-border/70 p-2 text-muted-foreground transition-colors hover:text-foreground xl:hidden"
            aria-label="開啟導覽選單"
            :aria-expanded="mobileOpen"
            @click="mobileOpen = true"
          >
            <Menu class="h-5 w-5" />
          </button>

          <div class="min-w-0">
            <p v-if="crumbs.length" class="truncate text-xs text-muted-foreground">
              {{ crumbs.join(' / ') }}
            </p>
            <h1 class="truncate text-lg font-bold tracking-tight">{{ title }}</h1>
          </div>

          <div class="ml-auto flex items-center gap-2">
            <Badge
              class="hidden rounded-full bg-secondary px-3 py-1 text-secondary-foreground hover:bg-secondary lg:inline-flex"
            >
              Admin Console
            </Badge>
            <MaintenanceChip />

            <div class="hidden h-5 w-px bg-border lg:block" aria-hidden="true" />

            <button
              type="button"
              class="relative rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="待辦佇列"
              :aria-expanded="queueOpen"
              @click="queueOpen = true"
            >
              <ListChecks class="h-5 w-5" />
              <span v-if="queueCount > 0" :class="COUNTER_BADGE_CLASS">
                {{ queueCount > 99 ? '99+' : queueCount }}
              </span>
            </button>

            <RouterLink
              to="/admin/notification-center"
              class="relative rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="通知中心"
            >
              <Bell class="h-5 w-5" />
              <span v-if="adminUnread > 0" :class="COUNTER_BADGE_CLASS">
                {{ adminUnread > 99 ? '99+' : adminUnread }}
              </span>
            </RouterLink>

            <DropdownMenu>
              <DropdownMenuTrigger
                class="flex shrink-0 items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Avatar size="sm" shape="circle" class="h-8 w-8 bg-primary/10 text-primary">
                  <AvatarFallback class="bg-transparent text-sm font-semibold">
                    {{ initials }}
                  </AvatarFallback>
                </Avatar>
                <span class="hidden text-sm font-medium xl:inline">{{ displayName }}</span>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" class="min-w-[15rem]">
                <DropdownMenuLabel>
                  <p class="truncate text-sm font-semibold">{{ displayName }}</p>
                  <p class="truncate text-xs text-muted-foreground">{{ session?.email }}</p>
                  <p
                    class="mt-1.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                  >
                    管理員
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem as-child>
                  <RouterLink to="/app">前往使用者工作區</RouterLink>
                </DropdownMenuItem>
                <DropdownMenuItem as-child>
                  <RouterLink to="/">返回首頁</RouterLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" @select="handleSignOut">
                  <LogOut class="h-4 w-4" />
                  登出後台
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main class="flex-1 px-6 py-8 lg:px-10">
        <RouterView />
      </main>
    </div>

    <!--
      兩個抽屜都掛在 header 外面：header 是 sticky + z-40，會形成堆疊脈絡，
      fixed 的遮罩與面板若掛在它底下會被關在裡面，蓋不住整頁。
    -->
    <QueueDrawer :open="queueOpen" @close="queueOpen = false" />

    <!--
      窄螢幕的導覽抽屜。不用 components/ui/sheet，是因為它的卸載與 body 捲動鎖
      都要等離場動畫的 animationend 才會解除；動畫一旦沒跑完（例如分頁被節流），
      抽屜就會留在畫面上且整頁捲不動。這個版本的正確性不依賴動畫完成。
    -->
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-40 bg-black/30 xl:hidden"
      aria-hidden="true"
      @click="mobileOpen = false"
    />
    <!--
      位移用行內 transform 而非 Tailwind 的 translate 工具：
      v4 的 translate-x-* 走 CSS `translate` 屬性，切換時實測會卡在 -100% 不更新。
    -->
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-background transition-transform duration-300 ease-out xl:hidden"
      :style="{ transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)' }"
      :aria-hidden="!mobileOpen"
    >
      <div class="flex items-center justify-between border-b px-5 py-4">
        <span class="flex items-center gap-2 font-bold text-primary">
          <ShieldCheck class="h-5 w-5" />
          RentMate Admin
        </span>
        <button
          type="button"
          class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="關閉導覽選單"
          :tabindex="mobileOpen ? 0 : -1"
          @click="mobileOpen = false"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <nav class="space-y-5 overflow-y-auto px-3 py-4">
        <div v-for="group in adminNavGroups" :key="group.label" class="space-y-1">
          <p
            v-if="group.items.length > 1"
            class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {{ group.label }}
          </p>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            :tabindex="mobileOpen ? 0 : -1"
            :class="
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive(item.path)
                  ? 'bg-primary-surface text-primary-surface-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            "
            @click="mobileOpen = false"
          >
            <component :is="navIcon(item.path)" class="h-4 w-4 shrink-0" />
            {{ item.label }}
          </RouterLink>
        </div>
      </nav>

      <!--
        抽屜也要有開關：側欄從 xl 才出現，少了這一顆，1280 以下就完全沒有
        切換主題的入口。
      -->
      <div class="mt-auto shrink-0 border-t px-5 py-4 text-xs">
        <ThemeToggle
          class="-ml-2 rounded-lg px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :tabindex="mobileOpen ? 0 : -1"
        />
      </div>
    </aside>

    <Dialog :open="idleWarning" @update:open="(open: boolean) => { if (!open) stayActive() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>你還在嗎？</DialogTitle>
          <DialogDescription>
            後台閒置 {{ ADMIN_IDLE_MINUTES }} 分鐘會自動登出，保護管理員帳號不被別人順手使用。
          </DialogDescription>
        </DialogHeader>
        <p class="text-sm">
          <span class="text-2xl font-bold tabular-nums">{{ idleSecondsLeft }}</span>
          秒後登出。
        </p>
        <DialogFooter>
          <Button variant="outline" @click="handleSignOut">現在登出</Button>
          <Button @click="stayActive">繼續使用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

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
import { ADMIN_IDLE_MINUTES } from '@/src/utils/admin-idle'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { adminNavGroups } from '@/src/utils/admin-rbac'
import { initialOf } from '@/src/utils/admin-recent-logins'

const route = useRoute()
const { blocked: deviceBlocked } = useAdminDeviceGate()
const router = useRouter()

// 後台各頁直接讀 adminSettings（門檻、額度），進後台時向後端讀一次。
// 通知中心的告警由後端自己產生，每 60 秒重讀，右上角的未讀數才會跟著變
onMounted(() => {
  void loadAdminSettings()
  startAdminNotificationPolling()
})
onBeforeUnmount(stopAdminNotificationPolling)
const { unreadCount: adminUnread } = useAdminNotificationCenter()
const { count: queueCount } = useAdminQueue()

// 標題改由 layout 畫：導覽在左側欄、標題在頂部列，頁面自己不再有 <h1>。
// 對照表與詳情頁的處理見 src/utils/admin-page-title.ts。
const currentPath = computed(() => route.path)
const { crumbs, title } = useAdminPageTitle(currentPath)

const mobileOpen = ref(false)
const queueOpen = ref(false)

/**
 * 圖示右上角的計數徽章。待辦與通知共用同一份，兩顆並排時大小位置才會一致。
 *
 * 文字色不用 text-destructive-foreground：那個 class 產不出任何 CSS——
 * src/index.css 的 @theme 區塊註冊了 --color-destructive 卻漏掉
 * --color-destructive-foreground（其他每一組顏色都有成對註冊）。驗證方式是
 * 在 build 出來的 CSS 裡找 `.text-destructive-foreground`，零筆。
 *
 * 用到它的元素會靜靜地繼承父層文字色。這裡的父層是 text-muted-foreground，
 * 於是變成灰字壓在橘紅底上：實測淺色 1.70、深色 1.07，等於看不見。
 *
 * ⚠️ 不要在 index.css 補那行註冊。補了確實會讓這個徽章變白字，但同時會影響
 * 全站每一顆 destructive 按鈕與徽章（components/ui/button、badge 都用這個
 * class），而 --destructive 是 oklch(0.7 0.18 40)，偏亮：白字對比只有 2.70，
 * 比它們現在意外繼承到的深色文字（6.35）差得多。那行「漏掉的註冊」目前
 * 有一半是在幫倒忙。要兩邊都對得起來得調暗 --destructive 本身，那是 token
 * 層級的決定。
 *
 * 所以這裡只修這顆徽章，改用深色文字，且兩個模式都明講：--destructive 在
 * 深淺色是同一個值，文字色不能跟著模式翻轉。實測兩個模式都是 6.35。
 */
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

/** 頭像首字。規則與「最近登入」共用同一個 initialOf，不要在這裡另寫一份。 */
const initials = computed(() =>
  initialOf(session.value?.nickname ?? null, session.value?.email ?? ''),
)

async function handleSignOut(): Promise<void> {
  signOut()
  await router.push('/')
}

/*
 * 閒置 20 分鐘自動登出。伺服器那邊也會擋（backend/security.py），這裡負責：
 * 最後一分鐘先提醒、時間到自己登出，並帶回內部登入頁說明原因 ——
 * 不然管理員只會看到頁面上一堆「讀不到資料」，不知道是登入失效了。
 */
const { warning: idleWarning, secondsLeft: idleSecondsLeft, stayActive } = useAdminIdleLogout(
  async (reason) => {
    signOut()
    await router.push({ path: '/staff-login', query: { reason } })
  },
)
</script>

<template>
  <!--
    外層背景原本是寫死的淺色 hex 漸層，深色模式下沒有對應覆寫，會在
    header／卡片之間露出一條淺色縫隙，把深色模式的白字標題蓋到看不見。
    改用 --background、--muted 兩個既有 token 組出同方向的漸層。
  -->
  <DesktopOnlyNotice v-if="deviceBlocked" />
  <div v-else class="flex min-h-screen bg-[linear-gradient(180deg,_var(--background),_var(--muted))]">
    <AdminSidebar />

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      >
        <div class="flex h-16 items-center gap-4 px-6 lg:px-10">
          <!--
            側欄從 xl 才出現，所以漢堡要撐到 xl 才收起來。原本是 lg:hidden，
            那會讓 1024–1279 這一段兩邊都沒有導覽。
          -->
          <button
            type="button"
            class="rounded-xl border border-border/70 p-2 text-muted-foreground transition-colors hover:text-foreground xl:hidden"
            aria-label="開啟導覽選單"
            :aria-expanded="mobileOpen"
            @click="mobileOpen = true"
          >
            <Menu class="h-5 w-5" />
          </button>

          <!--
            頁面標題。各頁不再自己畫 <h1>，所以這裡就是整頁唯一的 h1。
            詳情頁多一行麵包屑——那是真的有兩層，不是為了填空間。
          -->
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

            <!-- 待辦佇列：抽屜而非常駐側欄，理由見 QueueDrawer.vue -->
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
                <!-- 登出只有這一個入口，側欄底部刻意沒有放第二個 -->
                <DropdownMenuItem variant="destructive" @select="handleSignOut">
                  <LogOut class="h-4 w-4" />
                  登出後台
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <!-- 內容滿版：側欄已經提供了左邊界，不需要再置中一個 max-width -->
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
          <!-- 與側欄同一條規則：只剩一項時不畫分組標題 -->
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
            <!-- 與側欄共用同一份圖示對照表，見 nav-icons.ts -->
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

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Bell, ChevronDown, LogOut, Menu, ShieldCheck, X } from 'lucide-vue-next'
import { Avatar, AvatarFallback } from '@/components/ui/avatar/index'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu/index'
import { cn } from '@/lib/utils'
import { useAdminRbac } from '@/src/composables/admin/useAdminRbac'
import { useAdminNotificationCenter } from '@/src/composables/admin/useAdminNotificationCenter'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { adminRoleLabels } from '@/src/utils/admin-rbac'

const route = useRoute()
const router = useRouter()

const { visibleNavGroups, currentAdminRole } = useAdminRbac()
const { unreadCount: adminUnread } = useAdminNotificationCenter()

const mobileOpen = ref(false)

// 抽屜裡點了項目就關起來，否則導覽完抽屜還蓋在內容上
watch(() => route.path, () => {
  mobileOpen.value = false
})

function isActive(path: string): boolean {
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}

/**
 * 「總覽」固定獨立一格，不收進下拉——它是登入後的落地頁，收進下拉要多點一次
 * 才能回去，見規格三、頂部列。這裡直接從 useAdminRbac() 已經依角色過濾過的
 * visibleNavGroups 拆，不碰 admin-rbac.ts 的原始資料，RBAC 過濾邏輯只有一份、
 * 不會漏過濾。理論上兩種角色都看得到 /admin，找不到就不顯示這一格。
 */
const overviewItem = computed(() =>
  visibleNavGroups.value.flatMap((group) => group.items).find((item) => item.path === '/admin'),
)

// 其餘分組做下拉；已經獨立出去的「總覽」不再重複列在「營運管理」裡
const dropdownNavGroups = computed(() =>
  visibleNavGroups.value
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => item.path !== '/admin'),
    }))
    .filter((group) => group.items.length > 0),
)

function isGroupActive(group: { items: { path: string }[] }): boolean {
  return group.items.some((item) => isActive(item.path))
}

// 膠囊容器裡選中項「白底浮起」，其餘是灰階文字——「總覽」跟三個下拉觸發鈕共用同一套樣式
function pillClass(active: boolean): string {
  return cn(
    'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  )
}

const session = computed(() => getAuthSession())

const displayName = computed(() => session.value?.nickname ?? session.value?.email ?? '管理員')

/** 頭像用暱稱首字；沒有暱稱就退回 email 首字母 */
const initials = computed(() => {
  const name = session.value?.nickname
  if (name) return name.slice(0, 1)
  return (session.value?.email ?? '?').slice(0, 1).toUpperCase()
})

async function handleSignOut(): Promise<void> {
  signOut()
  await router.push('/')
}
</script>

<template>
  <!--
    外層背景原本是寫死的淺色 hex 漸層，深色模式下沒有對應覆寫，會在
    header／卡片之間露出一條淺色縫隙，把深色模式的白字標題蓋到看不見
    （例如 /admin 的「後台總覽」大標題）。改用 --background、--muted 兩個
    既有 token 組出同方向的漸層，深淺色模式都會自動跟著對。
  -->
  <div class="min-h-screen bg-[linear-gradient(180deg,_var(--background),_var(--muted))]">
    <header
      class="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
    >
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6 lg:px-10">
        <!-- 行動裝置：漢堡開抽屜。桌面不顯示。 -->
        <button
          type="button"
          class="rounded-xl border border-border/70 p-2 text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          aria-label="開啟導覽選單"
          :aria-expanded="mobileOpen"
          @click="mobileOpen = true"
        >
          <Menu class="h-5 w-5" />
        </button>

        <RouterLink to="/admin" class="flex shrink-0 items-center gap-2.5 font-bold text-primary">
          <span class="rounded-xl bg-primary/10 p-1.5">
            <ShieldCheck class="h-5 w-5" />
          </span>
          <span class="text-lg">RentMate Admin</span>
        </RouterLink>

        <!--
          桌面導覽：膠囊容器裝「總覽」＋三個分組下拉，取代原本 10 個項目攤平
          （1440px 下佔 830px，跟右側工具列只剩 16px，1280px 筆電會擠在一起）。
          分組資料沿用 src/utils/admin-rbac.ts 的 adminNavGroups（經
          useAdminRbac() 做 RBAC 過濾），不自己發明導覽結構。
        -->
        <nav class="ml-2 hidden items-center gap-1 rounded-full bg-muted p-1 lg:flex">
          <RouterLink
            v-if="overviewItem"
            :to="overviewItem.path"
            :class="pillClass(isActive(overviewItem.path))"
          >
            {{ overviewItem.shortLabel ?? overviewItem.label }}
          </RouterLink>

          <DropdownMenu v-for="group in dropdownNavGroups" :key="group.label">
            <DropdownMenuTrigger
              :class="cn(pillClass(isGroupActive(group)), 'inline-flex items-center gap-1')"
            >
              {{ group.label }}
              <ChevronDown class="h-3.5 w-3.5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="min-w-[10rem]">
              <DropdownMenuItem
                v-for="item in group.items"
                :key="item.path"
                as-child
                :class="isActive(item.path) ? 'bg-muted font-medium text-foreground' : undefined"
              >
                <RouterLink :to="item.path">{{ item.label }}</RouterLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <RouterLink
            to="/admin/notification-center"
            class="relative rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="通知中心"
          >
            <Bell class="h-5 w-5" />
            <span
              v-if="adminUnread > 0"
              class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
            >
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
            <!-- 1280px 以下把名字收起來，把寬度讓給導覽項目 -->
            <span class="hidden text-sm font-medium xl:inline">{{ displayName }}</span>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" class="min-w-[15rem]">
            <DropdownMenuLabel>
              <p class="truncate text-sm font-semibold">{{ displayName }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ session?.email }}</p>
              <p class="mt-1.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {{ adminRoleLabels[currentAdminRole] }}
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

    <!--
      行動裝置抽屜。與 landlord-layout 相同的做法：固定定位 ＋ transform 位移 ＋ 遮罩。
      不用 components/ui/sheet，是因為它的卸載與 body 捲動鎖都要等離場動畫的
      animationend 才會解除；動畫一旦沒跑完（例如分頁被節流），抽屜就會留在畫面上
      且整頁捲不動。這個版本的正確性不依賴動畫完成，動畫純粹是裝飾。
    -->
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-40 bg-black/30 lg:hidden"
      aria-hidden="true"
      @click="mobileOpen = false"
    />
    <!--
      位移用行內 transform 而非 Tailwind 的 translate 工具：
      v4 的 translate-x-* 走 CSS `translate` 屬性，切換時實測會卡在 -100% 不更新。
    -->
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-background transition-transform duration-300 ease-out lg:hidden"
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
          @click="mobileOpen = false"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- 抽屜是直的，放得下群組標題與圖示，所以這裡保留完整分類資訊 -->
      <nav class="space-y-5 overflow-y-auto px-3 py-4">
        <div v-for="group in visibleNavGroups" :key="group.label" class="space-y-1">
          <p class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {{ group.label }}
          </p>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            :class="cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(item.path)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )"
            @click="mobileOpen = false"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0" />
            {{ item.label }}
          </RouterLink>
        </div>
      </nav>
    </aside>

    <main class="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Bell, ChevronDown, ListChecks, LogOut, Menu, ShieldCheck, X } from 'lucide-vue-next'
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
import { useAdminQueue } from '@/src/composables/admin/useAdminQueue'
import QueueDrawer from '@/src/components/admin/QueueDrawer.vue'
import MaintenanceChip from '@/src/components/admin/MaintenanceChip.vue'
import { Badge } from '@/components/ui/badge/index'
import { initialOf } from '@/src/utils/admin-recent-logins'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { adminRoleLabels } from '@/src/utils/admin-rbac'

const route = useRoute()
const router = useRouter()

const { visibleNavGroups, currentAdminRole } = useAdminRbac()
const { unreadCount: adminUnread } = useAdminNotificationCenter()
const { count: queueCount } = useAdminQueue()

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
 *
 * （對比數字都是在瀏覽器裡用 canvas 讓引擎自己做 oklch→sRGB 再算 WCAG 量到的。
 * 自己手寫 Oklab 轉換很容易漏掉線性 RGB 到 sRGB 的編碼那一步，數字會整片偏掉。）
 */
const COUNTER_BADGE_CLASS =
  'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center ' +
  'rounded-full bg-destructive px-1 text-[10px] font-bold ' +
  'text-foreground dark:text-background'

// 抽屜裡點了項目就關起來，否則導覽完抽屜還蓋在內容上
watch(() => route.path, () => {
  mobileOpen.value = false
  queueOpen.value = false
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

/** 頭像首字。規則與「最近登入」共用同一個 initialOf，不要在這裡另寫一份。 */
const initials = computed(() =>
  initialOf(session.value?.nickname ?? null, session.value?.email ?? ''),
)

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
          <!--
            這兩顆原本長在總覽頁的標題區。搬上來的理由有兩個：
            一是它們是全站狀態，只在總覽看得到不合理；二是總覽頁的首屏有 43%
            被標題區吃掉（量到第一個數字在 329px / 768px），拿掉這一列才放得下
            標題旁的 KPI。

            lg 以下隱藏：窄螢幕的水平空間要留給導覽本身。
          -->
          <!--
            用 secondary 這組成對的 token：原本是 text-primary 配 bg-primary/5，
            深色模式下 --primary 變亮而底幾乎透明，實測只有 4.21。
            secondary 配 secondary-foreground 是 5.79 / 8.53，而且同樣是紫色系。
          -->
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
      待辦抽屜放在 header 外面：header 是 sticky + z-40，會形成堆疊脈絡，
      fixed 的遮罩與面板若掛在它底下會被關在裡面，蓋不住整頁。
    -->
    <QueueDrawer :open="queueOpen" @close="queueOpen = false" />

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

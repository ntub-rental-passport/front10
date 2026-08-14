<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LogOut, Menu, ShieldCheck, X } from 'lucide-vue-next'
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
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { adminRoleLabels } from '@/src/utils/admin-rbac'

const route = useRoute()
const router = useRouter()

const { visibleNavGroups, currentAdminRole } = useAdminRbac()

const mobileOpen = ref(false)

// 抽屜裡點了項目就關起來，否則導覽完抽屜還蓋在內容上
watch(() => route.path, () => {
  mobileOpen.value = false
})

function isActive(path: string): boolean {
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
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
  <div class="min-h-screen bg-[linear-gradient(180deg,_#f7f8fc,_#f3f5fb)]">
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
          桌面導覽：群組標題在橫向排不下，改用細分隔線保留群組邊界，
          讓「稽核紀錄與系統設定是另一類」這件事仍然看得出來。

          刻意不放圖示 —— 橫向排列時文字本身就好掃，七個圖示要多吃約 170px，
          在 1024px 會把整條 header 擠到溢出。圖示留給直向的抽屜。
        -->
        <nav class="ml-2 hidden items-center gap-0.5 lg:flex">
          <template v-for="(group, index) in visibleNavGroups" :key="group.label">
            <span
              v-if="index > 0"
              class="mx-2 h-5 w-px shrink-0 bg-border"
              aria-hidden="true"
            />
            <RouterLink
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              :class="cn(
                'whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.path)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )"
            >
              {{ item.label }}
            </RouterLink>
          </template>
        </nav>

        <!-- 頭像選單收納身分、跨區導覽與登出 —— 後台原本沒有登出入口 -->
        <DropdownMenu>
          <DropdownMenuTrigger
            class="ml-auto flex shrink-0 items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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

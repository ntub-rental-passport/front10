<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import {
  BookOpen,
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const route = useRoute()

const adminNavItems = [
  { label: '後台總覽', path: '/admin', icon: LayoutDashboard },
  { label: '使用者管理', path: '/admin/users', icon: Users },
  { label: '物件與評價審核', path: '/admin/review', icon: ClipboardCheck },
  { label: '法規知識庫', path: '/admin/knowledge', icon: BookOpen },
  { label: 'AI 品質監控', path: '/admin/ai-quality', icon: Sparkles },
  { label: '訂閱與容量', path: '/admin/subscription', icon: CreditCard },
  { label: '稽核紀錄', path: '/admin/audit', icon: ScrollText },
]

function isActive(path: string): boolean {
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_#f7f8fc,_#f3f5fb)]">
    <header class="border-b border-border/60 bg-background/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <RouterLink to="/admin" class="flex items-center gap-3 font-bold text-primary">
          <div class="rounded-2xl bg-primary/10 p-2">
            <ShieldCheck class="h-5 w-5" />
          </div>
          <span class="text-xl">RentMate Admin</span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <RouterLink to="/app" class="text-sm text-muted-foreground transition-colors hover:text-foreground">
            前往使用者工作區
          </RouterLink>
          <RouterLink to="/" class="text-sm text-muted-foreground transition-colors hover:text-foreground">
            返回首頁
          </RouterLink>
        </div>
      </div>
    </header>

    <div class="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-10">
      <aside class="rounded-[1.75rem] border border-border/70 bg-background/85 p-4 shadow-sm">
        <div class="mb-4 flex items-center gap-3 rounded-[1.25rem] bg-primary/5 p-4 text-primary">
          <div class="rounded-full bg-primary/10 p-2">
            <Building2 class="h-4 w-4" />
          </div>
          <div>
            <p class="text-sm font-semibold">管理工作區</p>
            <p class="text-xs text-muted-foreground">集中管理 OCR 任務、內容與系統設定</p>
          </div>
        </div>

        <nav class="space-y-1">
          <RouterLink
            v-for="item in adminNavItems"
            :key="item.path"
            :to="item.path"
            :class="cn(
              'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
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

      <main>
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LogOut, ShieldCheck } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { signOut } from '@/src/composables/useAuth'

interface NavItem {
  label: string
  path: string
  icon: Component
}

const props = defineProps<{
  title: string
  workspaceLabel: string
  workspaceDescription: string
  homePath: string
  navItems: NavItem[]
}>()

const route = useRoute()
const router = useRouter()

function isActive(path: string): boolean {
  if (path === props.homePath) return route.path === path
  return route.path.startsWith(path)
}

async function handleSignOut(): Promise<void> {
  signOut()
  await router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_#f7f8fc,_#f3f5fb)]">
    <header class="border-b border-border/60 bg-background/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <RouterLink :to="homePath" class="flex items-center gap-3 font-bold text-primary">
          <div class="rounded-2xl bg-primary/10 p-2"><ShieldCheck class="h-5 w-5" /></div>
          <span class="text-xl">{{ title }}</span>
        </RouterLink>
        <div class="flex items-center gap-4 text-sm">
          <RouterLink to="/" class="text-muted-foreground hover:text-foreground">返回首頁</RouterLink>
          <button class="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground" @click="handleSignOut">
            <LogOut class="h-4 w-4" />登出
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-10">
      <aside class="h-fit rounded-[1.75rem] border border-border/70 bg-background/85 p-4 shadow-sm">
        <div class="mb-4 rounded-[1.25rem] bg-primary/5 p-4">
          <p class="text-sm font-semibold text-primary">{{ workspaceLabel }}</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ workspaceDescription }}</p>
        </div>
        <nav class="space-y-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors', isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')"
          >
            <component :is="item.icon" class="h-4 w-4" />{{ item.label }}
          </RouterLink>
        </nav>
      </aside>
      <main><RouterView /></main>
    </div>
  </div>
</template>

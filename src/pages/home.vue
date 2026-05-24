<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  ArrowRight,
  FileText,
  Globe,
  HandHelping,
  ShieldCheck,
  ScanSearch,
  UserRoundPlus,
} from 'lucide-vue-next'

const heroHighlights = [
  'AI 契約辨識與風險分析',
  '租金補貼與生活待辦整合',
  '租客權益導向的知識輔助',
]

const featureCards = [
  {
    title: '契約掃描辨識',
    description: '上傳圖片或 PDF，快速轉成可分析文字，作為條款切段與風險比對基礎。',
    icon: ScanSearch,
    className: 'bg-primary/10 text-primary',
  },
  {
    title: '租客防禦提醒',
    description: '用白話方式整理高風險條款與法規重點，幫租客先看懂再簽約。',
    icon: ShieldCheck,
    className: 'bg-emerald-500/10 text-emerald-600',
  },
  {
    title: '租屋知識庫',
    description: '把常見爭議、修繕責任、押金扣抵、補貼申請整理成可搜尋內容。',
    icon: Globe,
    className: 'bg-amber-500/10 text-amber-600',
  },
  {
    title: '室友協作生活',
    description: '家務分工、垃圾車提醒、補件截止、記事板待辦，一站整合管理。',
    icon: HandHelping,
    className: 'bg-violet-500/10 text-violet-500',
  },
]
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top_left,_rgba(217,215,255,0.55),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(254,182,61,0.16),_transparent_24%),linear-gradient(180deg,_#fdfcff,_#f6f7fb)]">
    <header class="border-b border-border/60 bg-landing-background/80 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <RouterLink to="/" class="flex items-center gap-3 font-bold text-primary">
          <div class="rounded-2xl bg-primary/10 p-2">
            <FileText class="h-5 w-5" />
          </div>
          <span class="text-2xl">租隊友 RentMate</span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <Button as-child variant="ghost" class="rounded-full px-5">
            <RouterLink to="/login">登入</RouterLink>
          </Button>
          <Button as-child class="rounded-full px-5">
            <RouterLink to="/register">註冊</RouterLink>
          </Button>
        </div>
      </div>
    </header>

    <main class="flex-1 mx-auto max-w-7xl px-6 pt-6 pb-12 lg:px-10 lg:pt-8 lg:pb-20">
      <section class="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
        <div class="space-y-8">
          <div class="relative space-y-5">
            <div class="pointer-events-none absolute -right-4 -top-4 hidden h-28 w-28 sm:block">
              <svg viewBox="0 0 120 120" class="h-full w-full text-primary/20" fill="none" aria-hidden="true">
                <rect x="24" y="12" width="56" height="96" rx="16" stroke="currentColor" stroke-width="4" opacity="0.35" />
                <rect x="30" y="20" width="44" height="74" rx="10" fill="currentColor" opacity="0.08" />
                <path d="M38 36h28M38 52h28M38 68h18" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.65" />
                <circle cx="52" cy="96" r="3" fill="currentColor" opacity="0.65" />
                <path d="M28 87l-3 5 3 5" stroke="currentColor" stroke-width="3" opacity="0.5" />
                <path d="M92 87l3 5-3 5" stroke="currentColor" stroke-width="3" opacity="0.5" />
                <path d="M75 24l14-8" stroke="currentColor" stroke-width="3" opacity="0.4" stroke-linecap="round" />
                <path d="M32 26l-12-6" stroke="currentColor" stroke-width="3" opacity="0.4" stroke-linecap="round" />
              </svg>
            </div>
            <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 px-4 py-1.5 text-primary">
              租客權益導向的 AI 租屋助手
            </Badge>
            <div class="space-y-4">
              <h1 class="max-w-3xl text-5xl font-black leading-tight tracking-tight text-foreground lg:text-6xl">
                租屋不靠運氣，
                <span class="block text-primary">用 AI 把關你的居住權益</span>
              </h1>
              <p class="max-w-2xl text-lg leading-8 text-muted-foreground">
                合約太長看不懂？RentMate 一秒掃描揪出高風險條款。從簽約避雷、日常待辦到順利退租，讓你每次租屋都充滿底氣。
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <Button as-child size="lg" class="rounded-full px-7">
              <RouterLink to="/register">
                立即開始使用
                <ArrowRight class="h-4 w-4" />
              </RouterLink>
            </Button>
            <Button as-child size="lg" variant="outline" class="rounded-full px-7">
              <RouterLink to="/login">已有帳號，前往登入</RouterLink>
            </Button>
          </div>

          <div class="flex flex-wrap gap-3">
            <Badge
              v-for="item in heroHighlights"
              :key="item"
              variant="outline"
              class="rounded-full border-border/80 bg-background/80 px-4 py-2 text-sm text-muted-foreground shadow-sm"
            >
              {{ item }}
            </Badge>
          </div>
        </div>

        <Card class="overflow-hidden rounded-[2rem] border-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_22%),linear-gradient(145deg,_rgba(56,59,149,0.98),_rgba(74,84,188,0.96)_55%,_rgba(102,121,224,0.92))] text-white shadow-2xl">
          <CardContent class="relative space-y-6 p-8 lg:p-10">
            <div class="pointer-events-none absolute -right-10 top-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div class="space-y-3">
              <p class="text-sm font-semibold uppercase tracking-[0.28em] text-white/70">Smart Renting Flow</p>
              <h2 class="text-3xl font-bold leading-tight">從上傳契約到辨識風險，讓租客每一步都有依據。</h2>
            </div>

            <div class="space-y-4">
              <div class="rounded-[1.5rem] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <p class="text-sm text-white/70">Step 1</p>
                <p class="mt-2 text-lg font-semibold">OCR 契約掃描</p>
                <p class="mt-2 text-sm leading-7 text-white/82">支援圖片與 PDF，上傳後先由 OCR 抽取文字與版面。</p>
              </div>
              <div class="rounded-[1.5rem] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <p class="text-sm text-white/70">Step 2</p>
                <p class="mt-2 text-lg font-semibold">AI 條文切段與風險分析</p>
                <p class="mt-2 text-sm leading-7 text-white/82">比對高風險條款、整理白話重點、提供談判方向。</p>
              </div>
              <div class="rounded-[1.5rem] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <p class="text-sm text-white/70">Step 3</p>
                <p class="mt-2 text-lg font-semibold">入住後持續協作</p>
                <p class="mt-2 text-sm leading-7 text-white/82">從補貼、家務到提醒，把租屋生活變成有秩序的節奏。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section class="mt-16 space-y-6 lg:mt-16">
        <div class="space-y-3">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Core Features</p>
          <h2 class="text-3xl font-bold tracking-tight">一個平台，串起租客真正會用到的事情。</h2>
        </div>

        <div class="grid gap-4 lg:grid-cols-4">
          <Card
            v-for="card in featureCards"
            :key="card.title"
            class="rounded-[1.75rem] border-border/70 bg-background/85 shadow-sm backdrop-blur-sm"
          >
            <CardContent class="space-y-5 p-6">
              <div :class="['flex h-12 w-12 items-center justify-center rounded-full', card.className]">
                <component :is="card.icon" class="h-6 w-6" />
              </div>
              <div class="space-y-2">
                <h3 class="text-xl font-semibold">{{ card.title }}</h3>
                <p class="text-sm leading-7 text-muted-foreground">{{ card.description }}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section class="mt-16 rounded-[2rem] border border-border/60 bg-background/90 p-8 shadow-sm lg:mt-24 lg:p-10">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div class="space-y-3">
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Get Started</p>
            <h2 class="text-3xl font-bold tracking-tight">先從建立帳號開始，之後我們再把登入流程與權限串起來。</h2>
            <p class="max-w-2xl text-muted-foreground">
              目前先提供漂亮且完整的入口頁骨架，後續可以再接 Firebase、Supabase 或自建帳密登入。
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <Button as-child size="lg" class="rounded-full px-7">
              <RouterLink to="/register">
                <UserRoundPlus class="h-4 w-4" />
                建立新帳號
              </RouterLink>
            </Button>
            <Button as-child size="lg" variant="outline" class="rounded-full px-7">
              <RouterLink to="/login">前往登入</RouterLink>
            </Button>
          </div>
        </div>
      </section>
    </main>

    <footer class="relative left-1/2 w-screen -translate-x-1/2 border-t border-border/60 bg-background/90 text-muted-foreground">
      <div class="mx-auto flex max-w-7xl flex-col items-center gap-2 px-6 py-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <p class="text-sm">
          臺北商業大學畢業專題｜AI 租屋資訊整合與契約輔助平台展示頁
        </p>
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80 sm:justify-end">
          <span>聯絡資訊：rentmate.project@example.com</span>
          <span class="hidden sm:inline">|</span>
          <span>展示版本 v0.0.0</span>
          <span class="hidden sm:inline">|</span>
          <span>2026 Graduation Project Showcase</span>
        </div>
      </div>
    </footer>
  </div>
</template>

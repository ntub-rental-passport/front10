<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog/index'
import {
  Building2,
  CheckSquare,
  ChevronRight,
  ArrowRight,
  BookOpen,
  FileText,
  ShieldAlert,
  PiggyBank,
  User,
  MapPin,
  Zap,
} from 'lucide-vue-next'

const showContractDialog = ref(false)

const rentalInfo = {
  totalProperties: 2,
  activeContracts: 1,
  note: '目前 1 筆租約進行中',
}

const monthlyRent = {
  amount: '$12,000',
  dueDate: '5/10',
  note: '含網路費與管理費',
}

const contractStatus = {
  status: '有效',
  remainingMonths: '剩餘 8 個月',
  address: '台北市中正區杭州南路一段 88 號 6 樓',
  landlord: '陳小姐',
  electricityRate: '台電一期計費',
}

const todoOverview = {
  total: 3,
  nextDeadline: '最晚 4/15 前完成補件',
  note: '未來將與記事板自動同步',
}

const defenseReminder = {
  eyebrow: 'AI 租客防禦提醒',
  title: '簽約前注意！',
  summary: '若房東於合約中加註「不得報稅」或「不得申請租金補貼」，該條款依法無效，您仍可依法主張自身權益。',
  source: '根據租屋法規重點整理，協助您快速看懂高風險條款。',
  actionLabel: '查看完整使用說明',
  actionTo: '/app/contract',
}

const riskTags = [
  { label: '提前解約', count: 12, className: 'border-red-200 bg-red-50 text-red-600' },
  { label: '修繕責任', count: 8, className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { label: '押金扣抵', count: 15, className: 'border-blue-200 bg-blue-50 text-blue-600' },
  { label: '點交糾紛', count: 10, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { label: '租金補貼', count: 22, className: 'border-slate-200 bg-slate-100 text-slate-600' },
]

const featuredArticles = [
  {
    title: '提前解約要賠多少？租賃專法違約金上限解析',
    category: '違約金',
    publishedAt: '2026-04-05',
    to: '/app/contract',
  },
  {
    title: '冷氣壞了誰修？圖解「修繕責任」與存證信函寫法',
    category: '設備修繕',
    publishedAt: '2026-03-28',
    to: '/app/contract',
  },
  {
    title: '退租時被扣押金？這 3 種「自然損耗」房東不能扣',
    category: '押金退還',
    publishedAt: '2026-03-15',
    to: '/app/contract',
  },
]
</script>

<template>
  <div class="flex min-h-full flex-col gap-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">租屋總覽</h1>
      <p class="text-muted-foreground">歡迎回來，這是您目前的租屋狀態與待辦事項。</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">租屋資訊</CardTitle>
          <Building2 class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-2xl font-bold">{{ rentalInfo.totalProperties }} 筆</div>
          <p class="text-xs text-muted-foreground">{{ rentalInfo.note }}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">本月租金</CardTitle>
          <PiggyBank class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-2xl font-bold">{{ monthlyRent.amount }}</div>
          <p class="text-xs text-muted-foreground">繳款期限：{{ monthlyRent.dueDate }}</p>
          <p class="text-[11px] text-muted-foreground/80">{{ monthlyRent.note }}</p>
        </CardContent>
      </Card>

      <Dialog v-model:open="showContractDialog">
        <DialogTrigger as-child>
          <button type="button" class="w-full text-left">
            <Card class="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">契約狀態</CardTitle>
                <FileText class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent class="space-y-3">
                <div>
                  <div class="text-2xl font-bold">{{ contractStatus.status }}</div>
                  <p class="text-xs text-muted-foreground">{{ contractStatus.remainingMonths }}</p>
                </div>
                <div class="flex items-center justify-between text-xs text-primary">
                  <span>點擊查看住址、房東與電價資訊</span>
                  <ChevronRight class="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </button>
        </DialogTrigger>

        <DialogContent class="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>目前契約資訊</DialogTitle>
            <DialogDescription>快速查看本租約的重要內容。</DialogDescription>
          </DialogHeader>

          <div class="space-y-3">
            <div class="rounded-xl border bg-muted/30 p-4">
              <p class="text-sm text-muted-foreground">契約狀態</p>
              <p class="mt-1 text-xl font-semibold">{{ contractStatus.status }}</p>
              <p class="mt-1 text-sm text-muted-foreground">{{ contractStatus.remainingMonths }}</p>
            </div>

            <div class="rounded-xl border p-4">
              <div class="flex items-start gap-3">
                <MapPin class="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p class="text-sm text-muted-foreground">租屋地址</p>
                  <p class="text-sm font-medium">{{ contractStatus.address }}</p>
                </div>
              </div>
            </div>

            <div class="rounded-xl border p-4">
              <div class="flex items-start gap-3">
                <User class="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p class="text-sm text-muted-foreground">房東姓名</p>
                  <p class="text-sm font-medium">{{ contractStatus.landlord }}</p>
                </div>
              </div>
            </div>

            <div class="rounded-xl border p-4">
              <div class="flex items-start gap-3">
                <Zap class="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p class="text-sm text-muted-foreground">電價資訊</p>
                  <p class="text-sm font-medium">{{ contractStatus.electricityRate }}</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">待辦總覽</CardTitle>
          <CheckSquare class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-2xl font-bold">{{ todoOverview.total }} 項</div>
          <p class="text-xs text-muted-foreground">{{ todoOverview.nextDeadline }}</p>
          <p class="text-[11px] text-muted-foreground/80">{{ todoOverview.note }}</p>
        </CardContent>
      </Card>
    </div>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">租客防禦指南</h2>
        <p class="text-sm text-muted-foreground">用重點提醒與延伸閱讀，幫您先看見租屋風險。</p>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <Card class="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.22),_transparent_24%),linear-gradient(145deg,_rgba(56,59,149,0.98),_rgba(74,84,188,0.96)_55%,_rgba(102,121,224,0.94))] text-white shadow-lg">
          <CardContent class="relative flex h-full min-h-[320px] flex-col p-6">
            <div class="pointer-events-none absolute right-0 top-0 h-44 w-44 translate-x-10 -translate-y-10 rounded-full border border-white/12 bg-white/8 blur-2xl" />
            <div class="pointer-events-none absolute bottom-6 right-6 text-white/12">
              <ShieldAlert class="h-28 w-28" />
            </div>

            <div class="relative space-y-5">
              <Badge class="w-fit border-white/20 bg-white/14 text-white hover:bg-white/14">
                {{ defenseReminder.eyebrow }}
              </Badge>
              <div class="space-y-3">
                <h3 class="text-3xl font-bold tracking-tight">{{ defenseReminder.title }}</h3>
                <p class="max-w-sm text-base leading-8 text-white/90">
                  {{ defenseReminder.summary }}
                </p>
                <p class="max-w-sm text-sm leading-6 text-white/72">
                  {{ defenseReminder.source }}
                </p>
              </div>
            </div>

            <Button
              as-child
              class="relative z-10 mt-auto h-12 rounded-full border border-white/15 bg-white/12 text-base font-semibold text-white hover:bg-white/20"
            >
              <RouterLink :to="defenseReminder.actionTo">
                {{ defenseReminder.actionLabel }}
              </RouterLink>
            </Button>
          </CardContent>
        </Card>

        <Card class="rounded-3xl">
          <CardHeader class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-2">
                <div class="flex items-center gap-3">
                  <div class="rounded-2xl bg-primary/10 p-2 text-primary">
                    <BookOpen class="h-5 w-5" />
                  </div>
                  <CardTitle class="text-2xl">精選租屋重點</CardTitle>
                </div>
                <CardDescription>熱門風險關鍵字與精選文章，快速補齊租屋判斷力。</CardDescription>
              </div>

              <Button as-child variant="ghost" class="h-auto rounded-full px-0 text-sm font-semibold text-primary hover:bg-transparent hover:text-primary/80">
                <RouterLink to="/app/contract">
                  文章總目錄
                  <ChevronRight class="h-4 w-4" />
                </RouterLink>
              </Button>
            </div>

            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="tag in riskTags"
                :key="tag.label"
                variant="outline"
                :class="['rounded-full px-3 py-1 text-sm font-semibold', tag.className]"
              >
                {{ tag.label }} ({{ tag.count }})
              </Badge>
            </div>
          </CardHeader>

          <CardContent class="space-y-2">
            <RouterLink
              v-for="article in featuredArticles"
              :key="article.title"
              :to="article.to"
              class="group flex items-start justify-between gap-4 rounded-2xl border border-transparent px-3 py-4 transition-colors hover:border-border hover:bg-muted/30"
            >
              <div class="space-y-2">
                <p class="text-lg font-semibold leading-7 text-foreground">
                  {{ article.title }}
                </p>
                <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 text-primary">
                    {{ article.category }}
                  </Badge>
                  <span>{{ article.publishedAt }}</span>
                </div>
              </div>

              <div class="pt-1 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary">
                <ArrowRight class="h-4 w-4" />
              </div>
            </RouterLink>
          </CardContent>
        </Card>
      </div>
    </section>

    <footer class="relative left-1/2 mt-auto mb-[-1rem] w-screen -translate-x-1/2 border-t border-slate-800 bg-[linear-gradient(180deg,_#111827,_#0f172a)] text-slate-300 md:mb-[-1.5rem]">
      <div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-4 text-center">
        <p class="text-sm text-slate-300/90">臺北商業大學畢業專題｜AI 租屋資訊整合與契約輔助平台展示頁</p>

        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>聯絡資訊：rentmate.project@example.com</span>
          <span class="hidden text-slate-600 sm:inline">|</span>
          <span>展示版本 v0.0.0</span>
          <span class="hidden text-slate-600 sm:inline">|</span>
          <span>2026 Graduation Project Showcase</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Droplets, House, Info, Zap } from 'lucide-vue-next'
import { useOutageData } from './useOutageData'

const {
  activePrepGuide,
  activePreparationDescription,
  activePreparationItems,
  activePreparationTitle,
} = useOutageData()
</script>

<template>
  <section class="space-y-5">
    <Card class="overflow-hidden rounded-[30px] border border-[#dfe7d7] bg-[#fffdf7] shadow-[0_14px_34px_-26px_rgba(35,77,52,0.42)]">
      <CardContent class="p-0">
        <header class="relative overflow-hidden px-5 pb-6 pt-5 sm:px-8 sm:pb-7 sm:pt-6">
          <div class="absolute inset-x-5 top-3 h-[3px] rounded-full bg-[#26714d] sm:inset-x-8" />
          <div class="absolute inset-x-5 top-[10px] h-px bg-[#efc62f] sm:inset-x-8" />

          <div class="mt-4 flex flex-col gap-5 border-b-2 border-[#26714d] pb-6 lg:grid lg:grid-cols-[minmax(240px,1fr)_minmax(0,680px)_minmax(240px,1fr)] lg:items-start lg:gap-6">
            <div class="flex items-center gap-3 lg:min-w-[240px] lg:justify-self-start">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#26714d] text-[#26714d]">
                <House class="h-5 w-5" />
              </div>
              <div>
                <p class="text-[11px] font-bold tracking-[0.25em] text-[#26714d]">租屋生活防災手帖</p>
                <p class="text-xs tracking-[0.16em] text-slate-400">RENTMATE SAFETY GUIDE</p>
              </div>
            </div>

            <div class="lg:max-w-[680px] lg:justify-self-center lg:text-center">
              <p class="text-xs font-semibold tracking-[0.24em] text-[#26714d]">平時準備・公告來時不慌張</p>
              <h2 class="mt-3 text-[2.15rem] font-black leading-tight tracking-tight text-[#173f2d] sm:text-[2.75rem]">
                停電・停水 <span class="text-slate-900">提前準備</span>
              </h2>
              <p class="mt-3 text-sm leading-6 text-slate-600">
                針對租屋生活整理的基礎準備清單，收到公告後可立即確認與執行。
              </p>
            </div>

            <div class="shrink-0 rounded-xl border border-[#dce5d6] bg-white/70 p-3 lg:justify-self-end">
              <div class="flex aspect-square w-[96px] flex-col items-center justify-center text-center sm:w-[104px]">
                <p class="text-[10px] font-bold tracking-[0.22em] text-[#26714d]">GUIDE</p>
                <p class="mt-1 text-2xl font-black tracking-wider text-[#26714d]">001</p>
              </div>
            </div>
          </div>
        </header>

        <div class="px-5 pb-6 sm:px-8 sm:pb-8">
          <div class="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(240px,1fr)_minmax(0,560px)_minmax(240px,1fr)] lg:items-center lg:gap-6">
            <div class="hidden lg:block" />

            <div class="lg:justify-self-center lg:text-center">
              <p class="text-xs font-bold tracking-[0.22em] text-[#26714d]">PREPARATION CHECKLIST</p>
              <h3 class="mt-2 text-2xl font-black tracking-tight text-slate-900">{{ activePreparationTitle }}</h3>
              <p class="mt-1 text-sm text-slate-500">{{ activePreparationDescription }}</p>
            </div>

            <div class="inline-flex w-fit rounded-full border border-[#dbe5d6] bg-white p-1.5 shadow-sm lg:justify-self-end">
              <button
                type="button"
                :class="[
                  'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all',
                  activePrepGuide === 'power'
                    ? 'bg-[#f3c529] text-[#163b2a] shadow-sm'
                    : 'text-[#54705e] hover:bg-[#f4f7f2]',
                ]"
                @click="activePrepGuide = 'power'"
              >
                <Zap class="h-4 w-4" />
                停電準備
              </button>
              <button
                type="button"
                :class="[
                  'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all',
                  activePrepGuide === 'water'
                    ? 'bg-[#f3c529] text-[#163b2a] shadow-sm'
                    : 'text-[#54705e] hover:bg-[#f4f7f2]',
                ]"
                @click="activePrepGuide = 'water'"
              >
                <Droplets class="h-4 w-4" />
                停水準備
              </button>
            </div>
          </div>

          <div class="mt-7 grid gap-px overflow-hidden rounded-[24px] border border-[#d9e2d2] bg-[#d9e2d2] sm:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="(item, index) in activePreparationItems"
              :key="item.id"
              class="group flex min-h-[320px] flex-col bg-[#fffdf7] p-5 transition-colors hover:bg-[#f8f6eb] sm:p-6"
            >
              <div class="flex items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#26714d] text-xs font-bold tabular-nums text-white">
                  {{ String(index + 1).padStart(2, '0') }}
                </span>
                <h4 class="min-w-0 flex-1 text-[1.05rem] font-bold text-[#1f563b]">{{ item.title }}</h4>
                <component :is="item.icon" class="h-5 w-5 shrink-0 text-[#26714d] opacity-70" />
              </div>

              <div class="mt-4 flex h-[150px] items-center justify-center rounded-2xl border border-[#edf2e8] bg-[#fdfbf4] px-4 py-3">
                <img
                  :src="item.image"
                  :alt="item.imageAlt"
                  class="max-h-[128px] w-auto max-w-[188px] object-contain transition-transform duration-200 group-hover:scale-[1.03]"
                />
              </div>

              <div class="mt-4 border-t border-dashed border-[#a9bdab] pt-4">
                <p class="text-sm leading-6 text-slate-600">{{ item.body }}</p>
              </div>
            </article>
          </div>

          <div class="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#d8e4d7] bg-[#d8e4d7] md:grid-cols-[1.05fr_1fr_1fr_1fr]">
            <div class="flex items-center gap-3 bg-[#edf4e9] px-5 py-4">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#26714d] text-white">
                <Info class="h-5 w-5" />
              </div>
              <p class="text-lg font-black tracking-tight text-[#26714d]">提醒您</p>
            </div>
            <div class="bg-white px-5 py-4">
              <p class="text-xs font-bold text-[#26714d]">確認公告</p>
              <p class="mt-1 text-sm text-slate-600">以官方最新資訊為準</p>
            </div>
            <div class="bg-white px-5 py-4">
              <p class="text-xs font-bold text-[#26714d]">提前備妥</p>
              <p class="mt-1 text-sm text-slate-600">將用品放在易取處</p>
            </div>
            <div class="bg-white px-5 py-4">
              <p class="text-xs font-bold text-[#26714d]">共同確認</p>
              <p class="mt-1 text-sm text-slate-600">同步同住者與室友</p>
            </div>
          </div>
        </div>

        <footer class="flex flex-col gap-3 bg-[#26714d] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div class="flex items-center gap-3">
            <House class="h-5 w-5" />
            <p class="font-bold tracking-wide">租隊友 RentMate</p>
            <span class="hidden h-4 w-px bg-white/35 sm:block" />
            <p class="hidden text-xs text-white/70 sm:block">租屋生活安全資訊整合平台</p>
          </div>
          <p class="text-xs text-white/70">實際停水停電時間與處置方式，以官方公告為準</p>
        </footer>
      </CardContent>
    </Card>
  </section>
</template>

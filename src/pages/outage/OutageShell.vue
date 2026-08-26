<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, MapPin, RefreshCw } from 'lucide-vue-next'

import outageHeroIllustration from '@/src/assets/outage/outage-hero.png'
import { useOutageData } from './useOutageData'

const route = useRoute()
const { featuredSourceUpdatedAt, pageTabs, rentalAddress } = useOutageData()

const activeTabPath = computed(() => {
  if (route.path === '/app/outage') return '/app/outage'
  if (route.path.startsWith('/app/outage/actions')) return '/app/outage/actions'
  if (route.path.startsWith('/app/outage/notifications')) return '/app/outage/notifications'
  if (route.path.startsWith('/app/outage/sources')) return '/app/outage/sources'
  return '/app/outage'
})
</script>

<template>
  <div class="min-w-0 max-w-full space-y-5 overflow-x-hidden pb-6">
    <section class="min-w-0 max-w-full">
      <div class="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.12),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-5 shadow-sm sm:px-6 sm:py-6">
        <div class="pointer-events-none absolute -left-12 top-0 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
        <div class="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-amber-200/40 blur-3xl" />

        <img
          :src="outageHeroIllustration"
          alt=""
          class="pointer-events-none absolute right-5 -top-4 hidden w-[310px] max-w-[32%] opacity-90 lg:block xl:w-[380px]"
        />

        <div class="relative space-y-5">
          <div class="space-y-2 pr-0 lg:pr-[24rem]">
            <h1 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-[2.35rem]">停水・停電通知</h1>
            <p class="max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px]">
              掌握租屋處最新公告，提前安排生活準備，並整合你原本的通知與查詢功能。
            </p>
          </div>

          <Card class="overflow-hidden rounded-[28px] border border-white/80 bg-white/92 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur">
            <CardContent class="p-0">
              <div class="flex min-w-0 flex-col gap-5 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                <div class="flex min-w-0 flex-1 items-start gap-4">
                  <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner">
                    <MapPin class="h-6 w-6" />
                  </div>
                  <div class="min-w-0 space-y-2">
                    <div class="flex min-w-0 flex-wrap items-center gap-3">
                      <h2 class="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-[1.9rem]">
                        {{ rentalAddress }}
                      </h2>
                    </div>
                    <p class="text-sm leading-6 text-slate-500">
                      依租約地址自動帶入，也能隨時切換查詢地點，讓停水停電資訊更貼近實際居住位置。
                    </p>
                  </div>
                </div>

                <div class="hidden h-16 w-px bg-slate-200/90 xl:block" />

                <div class="flex shrink-0 flex-col gap-3 xl:items-end">
                  <div class="flex flex-wrap gap-3 xl:justify-end">
                    <Button variant="outline" class="h-11 rounded-2xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50">
                      <MapPin class="mr-2 h-4 w-4" />
                      更換地址
                    </Button>
                    <Button variant="outline" class="h-11 rounded-2xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50">
                      <RefreshCw class="mr-2 h-4 w-4" />
                      重新整理
                    </Button>
                    <div class="flex h-11 items-center gap-2 rounded-2xl px-2 text-sm font-medium text-slate-500">
                      <Clock class="h-4 w-4" />
                      最後更新：{{ featuredSourceUpdatedAt }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="border-t border-slate-100/90 px-3 py-3 sm:px-4">
                <div class="flex min-w-0 gap-2 overflow-x-auto">
                  <RouterLink
                    v-for="tab in pageTabs"
                    :key="tab.id"
                    :to="tab.to"
                    :class="[
                      'flex items-center gap-2 whitespace-nowrap rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                      activeTabPath === tab.to
                        ? 'border-primary/10 bg-primary/10 text-primary shadow-[0_12px_24px_-18px_rgba(79,70,229,0.9)]'
                        : 'border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800',
                    ]"
                  >
                    <component :is="tab.icon" class="h-4 w-4" />
                    {{ tab.label }}
                  </RouterLink>
                </div>
              </div>
            </CardContent>
          </Card>

          <RouterView />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Droplets,
  FileText,
  Info,
  Wrench,
  Zap,
} from 'lucide-vue-next'

import outagePowerIllustration from '@/src/assets/outage/outage-power.png'
import outageWaterIllustration from '@/src/assets/outage/outage-water.png'
import { useOutageData } from './useOutageData'

const {
  nextPowerNotice,
  nextWaterNotice,
  powerOfficialUrl,
  waterOfficialUrl,
} = useOutageData()
</script>

<template>
  <section class="space-y-5">
    <div class="grid min-w-0 gap-5 xl:grid-cols-2">
      <Card class="group min-h-[360px] min-w-0 overflow-hidden rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,250,239,1),rgba(255,255,255,1)_54%,rgba(255,247,226,1))] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent class="relative h-full min-h-[360px] overflow-hidden p-6 sm:p-8">
          <img
            :src="outagePowerIllustration"
            alt=""
            class="pointer-events-none absolute bottom-0 right-0 w-[72%] min-w-[260px] opacity-85"
          />

          <div class="relative z-10 flex h-full max-w-[66%] min-w-[220px] flex-col">
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Zap class="h-6 w-6" />
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <p class="text-lg font-semibold text-slate-800">{{ nextPowerNotice?.title ?? '下一個停電事件' }}</p>
                <Badge variant="outline" class="rounded-full border-amber-300 bg-white/85 px-3 py-1 text-xs font-semibold text-amber-700">
                  {{ nextPowerNotice?.statusLabel ?? '預告' }}
                </Badge>
              </div>
            </div>

            <div class="mt-7 space-y-4">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-amber-600 shadow-sm">
                  <CalendarDays class="h-5 w-5" />
                </div>
                <p class="whitespace-nowrap text-[1.9rem] font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-[2.2rem] xl:text-[2rem]">
                  {{ nextPowerNotice?.dateLabel ?? '目前無公告' }}
                </p>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-amber-600 shadow-sm">
                  <Clock class="h-6 w-6 shrink-0" />
                </div>
                <p class="shrink-0 text-[1.4rem] font-bold leading-[1.05] tracking-tight text-slate-900">
                  {{ nextPowerNotice?.timeRange ?? '請稍後再查詢' }}
                </p>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-amber-600 shadow-sm">
                  <Wrench class="h-5 w-5" />
                </div>
                <div class="flex min-w-0 items-center gap-4 whitespace-nowrap">
                  <p class="shrink-0 text-xl font-bold leading-[1.05] tracking-tight text-slate-900">{{ nextPowerNotice?.workLabel ?? '工作內容' }}</p>
                  <p class="truncate text-xl font-bold leading-[1.05] tracking-tight text-slate-900">
                    {{ nextPowerNotice?.workContent ?? '尚未提供' }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-amber-600 shadow-sm">
                  <FileText class="h-5 w-5" />
                </div>
                <div class="flex min-w-0 items-center gap-4 whitespace-nowrap">
                  <p class="shrink-0 text-xl font-bold leading-[1.05] tracking-tight text-slate-900">{{ nextPowerNotice?.referenceLabel ?? '請求號數' }}</p>
                  <p class="truncate text-xl font-bold leading-[1.05] tracking-tight text-slate-900">
                    {{ nextPowerNotice?.referenceValue ?? '尚未提供' }}
                  </p>
                </div>
              </div>
            </div>

            <a
              :href="nextPowerNotice?.officialUrl ?? powerOfficialUrl"
              target="_blank"
              rel="noreferrer"
              class="mt-7 inline-flex w-fit items-center gap-3 rounded-full border border-amber-300 bg-white/85 px-5 py-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-white"
            >
              查看官方公告
              <ArrowUpRight class="h-4 w-4" />
            </a>
          </div>

          <a
            :href="nextPowerNotice?.officialUrl ?? powerOfficialUrl"
            target="_blank"
            rel="noreferrer"
            aria-label="查看停電官方公告"
            class="absolute right-6 top-6 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white bg-white/90 text-amber-500 shadow-sm transition-transform group-hover:translate-x-0.5"
          >
            <ChevronRight class="h-5 w-5" />
          </a>
        </CardContent>
      </Card>

      <Card class="group min-h-[360px] min-w-0 overflow-hidden rounded-[28px] border border-sky-200 bg-[linear-gradient(135deg,rgba(244,249,255,1),rgba(255,255,255,1)_52%,rgba(233,243,255,1))] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent class="relative h-full min-h-[360px] overflow-hidden p-6 sm:p-8">
          <img
            :src="outageWaterIllustration"
            alt=""
            class="pointer-events-none absolute bottom-0 right-0 w-[74%] min-w-[280px] opacity-85"
          />

          <div class="relative z-10 flex h-full max-w-[62%] min-w-[220px] flex-col">
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <Droplets class="h-6 w-6" />
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <p class="text-lg font-semibold text-slate-800">{{ nextWaterNotice?.title ?? '下一個停水事件' }}</p>
                <Badge variant="outline" class="rounded-full border-sky-300 bg-white/85 px-3 py-1 text-xs font-semibold text-sky-700">
                  {{ nextWaterNotice?.statusLabel ?? '預告' }}
                </Badge>
              </div>
            </div>

            <div class="mt-7 space-y-4">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-sky-600 shadow-sm">
                  <CalendarDays class="h-5 w-5" />
                </div>
                <p class="text-[2rem] font-bold leading-tight tracking-tight text-slate-900">
                  {{ nextWaterNotice?.dateLabel ?? '目前無公告' }}
                </p>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-sky-600 shadow-sm">
                  <Clock class="h-6 w-6 shrink-0" />
                </div>
                <p class="text-xl font-semibold tabular-nums text-slate-800">
                  {{ nextWaterNotice?.timeRange ?? '請稍後再查詢' }}
                </p>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-sky-600 shadow-sm">
                  <Wrench class="h-5 w-5" />
                </div>
                <div class="flex min-w-0 items-center gap-4 whitespace-nowrap">
                  <p class="shrink-0 text-xl font-bold leading-[1.05] tracking-tight text-slate-900">{{ nextWaterNotice?.workLabel ?? '工作內容' }}</p>
                  <p class="truncate text-xl font-bold leading-[1.05] tracking-tight text-slate-900">
                    {{ nextWaterNotice?.workContent ?? '尚未提供' }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-sky-600 shadow-sm">
                  <FileText class="h-5 w-5" />
                </div>
                <div class="flex min-w-0 items-center gap-4 whitespace-nowrap">
                  <p class="shrink-0 text-xl font-bold leading-[1.05] tracking-tight text-slate-900">{{ nextWaterNotice?.referenceLabel ?? '公告編號' }}</p>
                  <p class="truncate text-xl font-bold leading-[1.05] tracking-tight text-slate-900">
                    {{ nextWaterNotice?.referenceValue ?? '尚未提供' }}
                  </p>
                </div>
              </div>
            </div>

            <a
              :href="nextWaterNotice?.officialUrl ?? waterOfficialUrl"
              target="_blank"
              rel="noreferrer"
              class="mt-auto inline-flex w-fit items-center gap-3 rounded-full border border-sky-300 bg-white/85 px-5 py-3 text-sm font-semibold text-sky-700 transition-colors hover:bg-white"
            >
              查看官方公告
              <ArrowUpRight class="h-4 w-4" />
            </a>
          </div>

          <a
            :href="nextWaterNotice?.officialUrl ?? waterOfficialUrl"
            target="_blank"
            rel="noreferrer"
            aria-label="查看停水官方公告"
            class="absolute right-6 top-6 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white bg-white/90 text-sky-500 shadow-sm transition-transform group-hover:translate-x-0.5"
          >
            <ChevronRight class="h-5 w-5" />
          </a>
        </CardContent>
      </Card>
    </div>

    <div class="flex items-center justify-center gap-2 border-t border-slate-200/80 pt-4 text-sm text-slate-500">
      <Info class="h-4 w-4" />
      <span>資料來源：台電公司、自來水公司及政府公開資訊平台</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpRight, Droplets, Info, Zap } from 'lucide-vue-next'
import { useOutageData } from './useOutageData'

const { getOfficialCardClass, powerOfficialUrl, waterOfficialUrl } = useOutageData()
</script>

<template>
  <section class="space-y-5">
    <Card class="rounded-[28px] border border-slate-200 shadow-sm">
      <CardHeader class="space-y-1 px-5 py-5">
        <CardTitle class="text-2xl font-bold tracking-tight text-slate-900">官方資訊來源</CardTitle>
        <p class="text-sm text-slate-500">保留一鍵查證入口，讓資料可信度與使用體驗都更完整。</p>
      </CardHeader>
      <CardContent class="space-y-3 px-5 pb-5">
        <article :class="['rounded-[22px] border p-4', getOfficialCardClass('power')]">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div class="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Zap class="h-4 w-4" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-900">台灣電力公司</p>
                  <p class="text-xs text-slate-500">工作停電公告與查詢</p>
                </div>
              </div>
              <p class="text-xs leading-5 text-slate-500">客服專線 1911，可查詢停電公告、通報與各區工作停電資訊。</p>
            </div>
            <a
              :href="powerOfficialUrl"
              target="_blank"
              rel="noreferrer"
              class="inline-flex h-10 items-center justify-center rounded-full border border-white/80 bg-white/85 px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-200 hover:bg-white"
            >
              <ArrowUpRight class="h-4 w-4" />
            </a>
          </div>
        </article>

        <article :class="['rounded-[22px] border p-4', getOfficialCardClass('water')]">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div class="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Droplets class="h-4 w-4" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-900">台灣自來水公司</p>
                  <p class="text-xs text-slate-500">停水公告與臨時供水站查詢</p>
                </div>
              </div>
              <p class="text-xs leading-5 text-slate-500">客服專線 1910，可查詢停水、降壓、供水站與恢復時間等資訊。</p>
            </div>
            <a
              :href="waterOfficialUrl"
              target="_blank"
              rel="noreferrer"
              class="inline-flex h-10 items-center justify-center rounded-full border border-white/80 bg-white/85 px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-200 hover:bg-white"
            >
              <ArrowUpRight class="h-4 w-4" />
            </a>
          </div>
        </article>

        <div class="flex gap-2 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4 text-xs leading-5 text-slate-500">
          <Info class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>RentMate 負責整理與提醒，實際停復水停復電時間仍以官方網站最後更新內容為準。</p>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Separator } from '@/components/ui/separator/index'
import { Switch } from '@/components/ui/switch/index'
import {
  ArrowUpRight,
  BellRing,
  Building2,
  ChevronRight,
  Clock,
  Droplets,
  House,
  Info,
  MapPin,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-vue-next'

import outageHeroIllustration from '../assets/outage/outage-hero.png'
import outagePowerIllustration from '../assets/outage/outage-power.png'
import outageWaterIllustration from '../assets/outage/outage-water.png'

type UtilityType = 'power' | 'water'
type EventStatus = 'scheduled' | 'resolved'
type ReminderLeadTime = '3_hours' | '1_day'
type OutagePageTab = 'home' | 'actions' | 'notifications' | 'sources'

interface UtilityEvent {
  id: string
  utilityType: UtilityType
  status: EventStatus
  statusLabel: string
  title: string
  summary: string
  dateLabel: string
  timeRange: string
  sourceName: string
  sourceUpdatedAt: string
  officialUrl: string
  hint: string
}

interface SuggestionCard {
  title: string
  body: string
  icon: Component
  className: string
  iconWrapClass: string
  iconClass: string
}

interface OutagePageTabItem {
  id: OutagePageTab
  label: string
  icon: Component
}

const rentalAddress = ref('台北市大安區和平東路二段')
const powerNotif = ref(true)
const waterNotif = ref(true)
const changeNotif = ref(true)
const syncRoommates = ref(true)
const reminderLeadTime = ref<ReminderLeadTime>('3_hours')
const activePageTab = ref<OutagePageTab>('home')

const powerOfficialUrl = 'https://www.taipower.com.tw/umbraco/surface/Ini/CountAndRedirectUrl?nodeId=28453'
const waterOfficialUrl = 'https://web.water.gov.tw/wateroffmap/map'

const pageTabs: OutagePageTabItem[] = [
  { id: 'home', label: '首頁', icon: House },
  { id: 'actions', label: '行動建議', icon: Users },
  { id: 'notifications', label: '通知設定', icon: BellRing },
  { id: 'sources', label: '官方資訊來源', icon: Building2 },
]

const events: UtilityEvent[] = [
  {
    id: 'power-scheduled',
    utilityType: 'power',
    status: 'scheduled',
    statusLabel: '明日',
    title: '停電通知',
    summary: '設備更換工程',
    dateLabel: '04/09（三）',
    timeRange: '14:00 - 16:00',
    sourceName: '台灣電力公司',
    sourceUpdatedAt: '今天 10:42',
    officialUrl: powerOfficialUrl,
    hint: '停電前建議先完成手機充電、門禁確認與冷藏設備檢查。',
  },
  {
    id: 'water-scheduled',
    utilityType: 'water',
    status: 'scheduled',
    statusLabel: '明日',
    title: '停水通知',
    summary: '管線維護工程',
    dateLabel: '04/10（四）',
    timeRange: '09:00 - 12:00',
    sourceName: '台灣自來水公司',
    sourceUpdatedAt: '今天 10:35',
    officialUrl: waterOfficialUrl,
    hint: '停水前建議先儲水，並錯開洗衣、洗澡與清潔等大量用水時段。',
  },
  {
    id: 'water-resolved',
    utilityType: 'water',
    status: 'resolved',
    statusLabel: '已恢復',
    title: '低壓供水事件已恢復',
    summary: '凌晨維修完成',
    dateLabel: '04/07（一）',
    timeRange: '23:10 已恢復',
    sourceName: '台灣自來水公司',
    sourceUpdatedAt: '昨天 23:18',
    officialUrl: waterOfficialUrl,
    hint: '若恢復初期水色略混濁，可先短暫放流後再使用。',
  },
]

const responseSuggestions: SuggestionCard[] = [
  {
    title: '停電前準備',
    body: '手機與行動電源先充電，確認門禁、電梯與網路備援是否可正常使用。',
    icon: Zap,
    className: 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,249,235,1),rgba(255,255,255,1))]',
    iconWrapClass: 'bg-amber-100',
    iconClass: 'text-amber-600',
  },
  {
    title: '停水前準備',
    body: '提前儲水、確認飲用水與盥洗需求，避免公告開始後才臨時準備。',
    icon: Droplets,
    className: 'border-sky-200 bg-[linear-gradient(135deg,rgba(239,248,255,1),rgba(255,255,255,1))]',
    iconWrapClass: 'bg-sky-100',
    iconClass: 'text-sky-600',
  },
  {
    title: '同步室友',
    body: '把事件分享給同住室友，先分配充電、儲水和冰箱整理等待辦事項。',
    icon: Users,
    className: 'border-violet-200 bg-[linear-gradient(135deg,rgba(246,243,255,1),rgba(255,255,255,1))]',
    iconWrapClass: 'bg-violet-100',
    iconClass: 'text-violet-600',
  },
]

const nextPowerNotice = computed(() =>
  events.find(event => event.utilityType === 'power' && event.status === 'scheduled'),
)

const nextWaterNotice = computed(() =>
  events.find(event => event.utilityType === 'water' && event.status === 'scheduled'),
)

const featuredSourceUpdatedAt = computed(() => nextPowerNotice.value?.sourceUpdatedAt ?? '今天 10:42')

function getOfficialCardClass(utilityType: UtilityType): string {
  return utilityType === 'power'
    ? 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,1),rgba(255,255,255,1))]'
    : 'border-sky-200 bg-[linear-gradient(135deg,rgba(243,249,255,1),rgba(255,255,255,1))]'
}

function switchPageTab(tab: OutagePageTab): void {
  activePageTab.value = tab
}
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
          class="pointer-events-none absolute right-5 top-4 hidden w-[310px] max-w-[32%] opacity-90 lg:block xl:w-[380px]"
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
                      <span class="rounded-xl bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">我的租屋處</span>
                      <h2 class="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-[1.9rem]">{{ rentalAddress }}</h2>
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
                  <button
                    v-for="tab in pageTabs"
                    :key="tab.id"
                    :class="[
                      'flex items-center gap-2 whitespace-nowrap rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                      activePageTab === tab.id
                        ? 'border-primary/10 bg-primary/10 text-primary shadow-[0_12px_24px_-18px_rgba(79,70,229,0.9)]'
                        : 'border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800',
                    ]"
                    @click="switchPageTab(tab.id)"
                  >
                    <component :is="tab.icon" class="h-4 w-4" />
                    {{ tab.label }}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <section v-if="activePageTab === 'home'" class="space-y-5">
            <div class="grid min-w-0 gap-5 xl:grid-cols-2">
              <Card class="group min-h-[330px] min-w-0 overflow-hidden rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,250,239,1),rgba(255,255,255,1)_54%,rgba(255,247,226,1))] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <CardContent class="relative h-full min-h-[330px] overflow-hidden p-6 sm:p-8">
                  <img
                    :src="outagePowerIllustration"
                    alt=""
                    class="pointer-events-none absolute bottom-0 right-0 w-[72%] min-w-[260px] opacity-85"
                  />

                  <div class="relative z-10 flex h-full max-w-[60%] min-w-[220px] flex-col">
                    <div class="flex items-center gap-3">
                      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <Zap class="h-6 w-6" />
                      </div>
                      <div class="flex flex-wrap items-center gap-3">
                        <p class="text-lg font-semibold text-slate-800">{{ nextPowerNotice?.title ?? '下一個停電事件' }}</p>
                        <Badge variant="outline" class="rounded-full border-amber-300 bg-white/85 px-3 py-1 text-xs font-semibold text-amber-700">
                          {{ nextPowerNotice?.statusLabel ?? '明日' }}
                        </Badge>
                      </div>
                    </div>

                    <div class="mt-7 space-y-2">
                      <p class="text-[2.8rem] font-bold leading-none tracking-tight text-slate-900">
                        {{ nextPowerNotice?.dateLabel ?? '目前無公告' }}
                      </p>
                      <p class="text-xl font-semibold tabular-nums text-slate-800">
                        {{ nextPowerNotice?.timeRange ?? '請稍後再查詢' }}
                      </p>
                    </div>

                    <div class="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span class="rounded-md bg-amber-100/80 px-2 py-1 font-semibold text-amber-700">預計影響</span>
                      <span class="flex items-center gap-1.5">
                        <MapPin class="h-4 w-4" />
                        {{ nextPowerNotice?.summary ?? '尚未提供詳細資訊' }}
                      </span>
                    </div>

                    <a
                      :href="powerOfficialUrl"
                      target="_blank"
                      rel="noreferrer"
                      class="mt-auto inline-flex w-fit items-center gap-3 rounded-full border border-amber-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
                    >
                      查看事件詳情
                      <ChevronRight class="h-4 w-4" />
                    </a>
                  </div>

                  <a
                    :href="powerOfficialUrl"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="查看停電事件詳情"
                    class="absolute right-6 top-6 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white bg-white/90 text-amber-500 shadow-sm transition-transform group-hover:translate-x-0.5"
                  >
                    <ChevronRight class="h-5 w-5" />
                  </a>
                </CardContent>
              </Card>

              <Card class="group min-h-[330px] min-w-0 overflow-hidden rounded-[28px] border border-sky-200 bg-[linear-gradient(135deg,rgba(244,249,255,1),rgba(255,255,255,1)_52%,rgba(233,243,255,1))] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <CardContent class="relative h-full min-h-[330px] overflow-hidden p-6 sm:p-8">
                  <img
                    :src="outageWaterIllustration"
                    alt=""
                    class="pointer-events-none absolute bottom-0 right-0 w-[74%] min-w-[280px] opacity-85"
                  />

                  <div class="relative z-10 flex h-full max-w-[60%] min-w-[220px] flex-col">
                    <div class="flex items-center gap-3">
                      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                        <Droplets class="h-6 w-6" />
                      </div>
                      <div class="flex flex-wrap items-center gap-3">
                        <p class="text-lg font-semibold text-slate-800">{{ nextWaterNotice?.title ?? '下一個停水事件' }}</p>
                        <Badge variant="outline" class="rounded-full border-sky-300 bg-white/85 px-3 py-1 text-xs font-semibold text-sky-700">
                          {{ nextWaterNotice?.statusLabel ?? '明日' }}
                        </Badge>
                      </div>
                    </div>

                    <div class="mt-7 space-y-2">
                      <p class="text-[2.8rem] font-bold leading-none tracking-tight text-slate-900">
                        {{ nextWaterNotice?.dateLabel ?? '目前無公告' }}
                      </p>
                      <p class="text-xl font-semibold tabular-nums text-slate-800">
                        {{ nextWaterNotice?.timeRange ?? '請稍後再查詢' }}
                      </p>
                    </div>

                    <div class="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span class="rounded-md bg-sky-100/90 px-2 py-1 font-semibold text-sky-700">預計影響</span>
                      <span class="flex items-center gap-1.5">
                        <MapPin class="h-4 w-4" />
                        {{ nextWaterNotice?.summary ?? '尚未提供詳細資訊' }}
                      </span>
                    </div>

                    <a
                      :href="waterOfficialUrl"
                      target="_blank"
                      rel="noreferrer"
                      class="mt-auto inline-flex w-fit items-center gap-3 rounded-full border border-sky-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
                    >
                      查看事件詳情
                      <ChevronRight class="h-4 w-4" />
                    </a>
                  </div>

                  <a
                    :href="waterOfficialUrl"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="查看停水事件詳情"
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
        </div>
      </div>
    </section>

    <section v-if="activePageTab === 'actions'" class="space-y-5">
      <Card class="rounded-[28px] border border-slate-200 shadow-sm">
        <CardHeader class="space-y-1 px-5 py-5">
          <CardTitle class="text-2xl font-bold tracking-tight text-slate-900">行動建議</CardTitle>
          <p class="text-sm text-slate-500">把公告轉成可以立刻執行的準備，讓停水停電不只被看到，也能被處理。</p>
        </CardHeader>
        <CardContent class="grid gap-4 px-5 pb-5 lg:grid-cols-3">
          <article
            v-for="suggestion in responseSuggestions"
            :key="suggestion.title"
            :class="['rounded-[24px] border p-5 shadow-sm', suggestion.className]"
          >
            <div class="space-y-4">
              <div :class="['flex h-12 w-12 items-center justify-center rounded-2xl', suggestion.iconWrapClass]">
                <component :is="suggestion.icon" :class="['h-5 w-5', suggestion.iconClass]" />
              </div>
              <div class="space-y-2">
                <h3 class="text-lg font-semibold text-slate-900">{{ suggestion.title }}</h3>
                <p class="text-sm leading-6 text-slate-500">{{ suggestion.body }}</p>
              </div>
            </div>
          </article>
        </CardContent>
      </Card>
    </section>

    <section v-else-if="activePageTab === 'notifications'" class="space-y-5">
      <Card class="rounded-[28px] border border-slate-200 shadow-sm">
        <CardHeader class="space-y-1 px-5 py-5">
          <CardTitle class="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <BellRing class="h-5 w-5 text-primary" />
            通知設定
          </CardTitle>
          <p class="text-sm text-slate-500">把公告轉成前置提醒，避免等到停水停電才臨時處理。</p>
        </CardHeader>
        <CardContent class="space-y-5 px-5 pb-5">
          <div class="space-y-4 rounded-[22px] border border-slate-100 bg-slate-50/70 p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-slate-900">停電通知</p>
                <p class="text-xs leading-5 text-slate-500">接收計畫性停電與恢復通知</p>
              </div>
              <Switch v-model="powerNotif" />
            </div>

            <Separator />

            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-slate-900">停水通知</p>
                <p class="text-xs leading-5 text-slate-500">接收停水、降壓與恢復通知</p>
              </div>
              <Switch v-model="waterNotif" />
            </div>

            <Separator />

            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-slate-900">公告異動提醒</p>
                <p class="text-xs leading-5 text-slate-500">時間、範圍或原因更新時同步提醒</p>
              </div>
              <Switch v-model="changeNotif" />
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <p class="text-sm font-semibold text-slate-900">提醒時間</p>
              <p class="mt-1 text-xs text-slate-500">可依你的生活習慣，選擇想提早多久收到通知。</p>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                :class="[
                  'rounded-2xl border px-4 py-3 text-left transition-colors',
                  reminderLeadTime === '3_hours'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                ]"
                @click="reminderLeadTime = '3_hours'"
              >
                <p class="text-sm font-semibold">前 3 小時</p>
                <p class="mt-1 text-xs">適合當天充電、儲水與最後確認</p>
              </button>
              <button
                type="button"
                :class="[
                  'rounded-2xl border px-4 py-3 text-left transition-colors',
                  reminderLeadTime === '1_day'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                ]"
                @click="reminderLeadTime = '1_day'"
              >
                <p class="text-sm font-semibold">前一天</p>
                <p class="mt-1 text-xs">適合提早調整洗衣、煮飯與生活安排</p>
              </button>
            </div>
          </div>

          <div class="rounded-[22px] border border-violet-200 bg-[linear-gradient(135deg,rgba(246,243,255,1),rgba(255,255,255,1))] p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-slate-900">同步室友</p>
                <p class="text-xs leading-5 text-slate-500">將停水停電事件同步到共居協作與備忘錄。</p>
              </div>
              <Switch v-model="syncRoommates" />
            </div>
          </div>

          <Button class="h-11 w-full rounded-full bg-primary text-white hover:bg-primary/90">
            儲存通知設定
          </Button>
        </CardContent>
      </Card>
    </section>

    <section v-else-if="activePageTab === 'sources'" class="space-y-5">
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
  </div>
</template>

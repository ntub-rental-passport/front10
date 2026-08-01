<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Bell, Building2, CalendarDays, CircleDollarSign, FileText, Plus, Users, WalletCards, Wrench } from 'lucide-vue-next'

const stats = [
  { title: '本月已收', value: 'NT$39,866', note: '本月實收租金', trend: '較上月同期', icon: WalletCards, tone: 'green' },
  { title: '待收金額', value: 'NT$23,000', note: '5 筆租金待收', trend: '優先處理', icon: CircleDollarSign, tone: 'amber' },
  { title: '入住率', value: '75%', note: '15 / 20 間', trend: '較上月 +7%', icon: Building2, tone: 'blue' },
  { title: '今日待處理', value: '7 件', note: '報修 2 · 合約 3 · 收款 2', trend: '查看全部', icon: Wrench, tone: 'purple' },
]

const priorities = [
  { label: '待收款', detail: '5 筆待收 · 總額 NT$23,000', count: '5 筆', icon: WalletCards },
  { label: '報修處理中', detail: '2 件處理中', count: '2 件', icon: Wrench },
  { label: '合約提醒', detail: '30 天內到期 3 份', count: '3 份', icon: FileText },
  { label: '租客資料', detail: '1 位租客待補資料', count: '1 位', icon: Users },
]

const toneClasses: Record<string, string> = {
  green: 'bg-[#e7f3e9] text-[#5b8263]', amber: 'bg-[#fff0d8] text-[#b67a23]',
  blue: 'bg-[#e3f2f7] text-[#397a91]', purple: 'bg-[#eee7fb] text-[#7956a9]',
}
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 class="text-3xl font-black tracking-tight">總覽</h1><p class="mt-2 text-sm text-[#778078]">掌握收租進度、入住率、報修與合約提醒。</p></div>
      <div class="flex items-center gap-2"><button class="inline-flex items-center gap-2 rounded-full border border-[#dfd9cc] bg-white px-4 py-2.5 text-sm font-semibold shadow-sm"><CalendarDays class="h-4 w-4" />2026 年 7 月</button><button class="rounded-full border border-[#dfd9cc] bg-white p-2.5" aria-label="通知"><Bell class="h-4 w-4" /></button></div>
    </header>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article v-for="item in stats" :key="item.title" class="rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 p-5 shadow-[0_10px_30px_rgba(75,67,51,.05)]">
        <div class="flex items-start justify-between"><div><p class="text-sm font-semibold text-[#68736c]">{{ item.title }}</p><p class="mt-2 text-2xl font-black">{{ item.value }}</p><p class="mt-1 text-sm text-[#7d847f]">{{ item.note }}</p></div><span :class="['grid h-11 w-11 place-items-center rounded-full', toneClasses[item.tone]]"><component :is="item.icon" class="h-5 w-5" /></span></div>
        <p class="mt-5 text-xs font-semibold text-[#68846d]">{{ item.trend }}</p>
      </article>
    </section>

    <section class="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.95fr)]">
      <article class="overflow-hidden rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 shadow-sm">
        <div class="flex items-center justify-between border-b border-[#e8e2d6] p-5"><div><h2 class="text-xl font-black">本月收租進度</h2><p class="mt-1 text-sm text-[#7a827c]">應收、已收與待收金額集中檢視。</p></div><RouterLink to="/landlord/finance" class="rounded-full border border-[#ddd6c9] px-4 py-2 text-sm font-semibold">查看收款明細</RouterLink></div>
        <div class="p-5">
          <div class="grid gap-3 sm:grid-cols-3"><div class="rounded-2xl border border-[#e7e0d4] p-4"><p class="text-sm font-semibold">應收金額</p><p class="mt-2 text-xl font-black">NT$62,866</p></div><div class="rounded-2xl border border-[#cfe2d2] bg-[#f1f8f2] p-4"><p class="text-sm font-semibold text-[#5b8263]">已收金額</p><p class="mt-2 text-xl font-black">NT$39,866</p></div><div class="rounded-2xl border border-[#efd4a7] bg-[#fff4e3] p-4"><p class="text-sm font-semibold text-[#a56d21]">待收金額</p><p class="mt-2 text-xl font-black">NT$23,000</p></div></div>
          <div class="mt-6 flex justify-between text-sm font-bold"><span>收款率</span><span>63%</span></div><div class="mt-2 h-3 overflow-hidden rounded-full bg-[#e6e1d5]"><div class="h-full w-[63%] rounded-full bg-[#5b8263]" /></div><p class="mt-2 text-xs text-[#7d847f]">已收 8 / 13 筆 · 待收 5 筆</p>
          <div class="mt-5 flex flex-col gap-3 rounded-2xl bg-[#eaf5eb] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="font-bold">收款表現良好！</p><p class="text-sm text-[#66766a]">本月收款率維持在 63%，請持續追蹤待收款項。</p></div><RouterLink to="/landlord/finance" class="shrink-0 rounded-full bg-white px-4 py-2 text-center text-sm font-bold shadow-sm">前往收款工作台</RouterLink></div>
        </div>
      </article>

      <article class="rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 shadow-sm"><div class="border-b border-[#e8e2d6] p-5"><h2 class="text-xl font-black">今日優先處理</h2><p class="mt-1 text-sm text-[#7a827c]">先看待處理項目，再安排工作順序。</p></div><div class="space-y-3 p-4"><div v-for="item in priorities" :key="item.label" class="flex items-center gap-3 rounded-2xl border border-[#e5dfd3] p-3"><span class="grid h-10 w-10 place-items-center rounded-full bg-[#e9f4ea] text-[#5b8263]"><component :is="item.icon" class="h-4 w-4" /></span><div class="min-w-0 flex-1"><p class="font-bold">{{ item.label }}</p><p class="truncate text-xs text-[#7a827c]">{{ item.detail }}</p></div><span class="rounded-full bg-[#edf5ed] px-2.5 py-1 text-xs font-bold text-[#5b8263]">{{ item.count }}</span></div></div></article>
    </section>

    <section class="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
      <article class="rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 p-5 shadow-sm"><div class="flex items-center justify-between"><div><h2 class="text-xl font-black">近 6 個月收款趨勢</h2><p class="mt-1 text-sm text-[#7a827c]">快速掌握租金收款變化。</p></div><span class="rounded-full bg-[#f2eee5] px-3 py-1 text-xs font-bold">近 6 個月</span></div><div class="mt-7 flex h-36 items-end gap-3 border-b border-[#ddd6ca] px-2"><div v-for="(height, index) in [42, 58, 51, 74, 68, 86]" :key="index" class="flex flex-1 flex-col items-center justify-end gap-2"><div class="w-full max-w-12 rounded-t-lg bg-[#6e9274]" :style="{ height: `${height}%` }" /><span class="text-[11px] text-[#7b827d]">{{ index + 2 }}月</span></div></div></article>
      <article class="rounded-[1.5rem] border border-[#e2ddcf] bg-white/90 p-5 shadow-sm"><h2 class="text-xl font-black">快速操作</h2><p class="mt-1 text-sm text-[#7a827c]">常用功能快速入口。</p><div class="mt-5 grid grid-cols-2 gap-3"><RouterLink to="/landlord/tenants" class="rounded-2xl border border-[#e3ddcf] p-4 font-bold hover:bg-[#f4f7f1]"><Plus class="mb-3 h-5 w-5 text-[#5b8263]" />新增租客</RouterLink><RouterLink to="/landlord/contracts" class="rounded-2xl border border-[#e3ddcf] p-4 font-bold hover:bg-[#f4f7f1]"><FileText class="mb-3 h-5 w-5 text-[#5b8263]" />新增合約</RouterLink><RouterLink to="/landlord/properties" class="rounded-2xl border border-[#e3ddcf] p-4 font-bold hover:bg-[#f4f7f1]"><Building2 class="mb-3 h-5 w-5 text-[#5b8263]" />新增房源</RouterLink><RouterLink to="/landlord/maintenance" class="rounded-2xl border border-[#e3ddcf] p-4 font-bold hover:bg-[#f4f7f1]"><Wrench class="mb-3 h-5 w-5 text-[#5b8263]" />新增報修</RouterLink></div></article>
    </section>
  </div>
</template>

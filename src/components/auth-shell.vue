<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { House, ShieldCheck } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    contentWidthClass?: string
    footerNote?: string
  }>(),
  {
    contentWidthClass: 'max-w-lg',
    footerNote: '登入後將進入租客專屬工作區。',
  },
)
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(135deg,_#f6f1ea,_#fcfaf7_45%,_#f4f5fb)]">
    <div class="grid min-h-screen lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section
        class="hidden flex-col justify-between border-r border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_24%),linear-gradient(180deg,_rgba(78,73,173,0.98),_rgba(76,72,167,0.97)_56%,_rgba(69,66,153,0.96))] p-10 text-white lg:flex"
      >
        <RouterLink to="/" class="flex items-center gap-3 font-bold text-white/92">
          <div class="rounded-2xl bg-white/12 p-2">
            <House class="h-5 w-5" />
          </div>
          <span class="text-lg">租隊友 RentMate</span>
        </RouterLink>

        <div class="flex flex-1 items-center justify-center">
          <div class="space-y-6 text-center">
            <div class="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white shadow-[0_24px_60px_rgba(17,33,110,0.25)]">
              <House class="h-11 w-11 text-primary" />
            </div>
            <div class="space-y-3">
              <h1 class="text-3xl font-bold tracking-tight">租隊友 RentMate</h1>
              <p class="text-sm leading-7 text-white/82">一站式智慧租屋管理平台。</p>
              <p class="text-sm leading-7 text-white/82">讓租屋生活更簡單，也更有保障。</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 text-sm text-white/76">
          <ShieldCheck class="h-4 w-4 text-white/92" />
          {{ footerNote }}
        </div>
      </section>

      <section class="flex items-center justify-center px-6 py-8 lg:px-8">
        <div :class="['w-full p-6 lg:p-7', contentWidthClass]">
          <RouterLink to="/" class="inline-flex items-center gap-3 font-bold text-primary lg:hidden">
            <div class="rounded-2xl bg-primary/10 p-2">
              <House class="h-5 w-5" />
            </div>
            <span class="text-xl">租隊友 RentMate</span>
          </RouterLink>

          <slot />
        </div>
      </section>
    </div>
  </div>
</template>

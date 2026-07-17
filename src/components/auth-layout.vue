<script setup lang="ts">
import { RouterLink } from 'vue-router'
import authLogoIcon from '@/src/assets/Logo/Rentmate-Logo-icon.png'
import authLogoIconWhite from '@/src/assets/Logo/Rentmate-Logo-icon2.png'
import { ShieldCheck } from 'lucide-vue-next'

const brandName = '\u79df\u968a\u53cb RentMate'
const platformLineOne = '\u4e00\u7ad9\u5f0f\u667a\u6167\u79df\u5c4b\u7ba1\u7406\u5e73\u53f0\u3002'
const platformLineTwo = '\u8b93\u79df\u5c4b\u751f\u6d3b\u66f4\u7c21\u55ae\uff0c\u4e5f\u66f4\u6709\u4fdd\u969c\u3002'

withDefaults(
  defineProps<{
    contentWidthClass?: string
    footerNote?: string
  }>(),
  {
    contentWidthClass: 'max-w-lg',
    footerNote: '\u767b\u5165\u5f8c\u5c07\u9032\u5165\u79df\u5ba2\u5c08\u5c6c\u5de5\u4f5c\u5340\u3002',
  },
)
</script>

<template>
  <div class="min-h-dvh [background:var(--auth-background)]">
    <div
      class="grid min-h-dvh lg:h-dvh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:overflow-hidden"
    >
      <!-- 桌面版左側品牌區：固定於 viewport，不跟著右側表單滾動 -->
      <section
        class="hidden h-dvh flex-col justify-between overflow-hidden border-r border-white/10 p-8 text-white lg:flex xl:p-10 [background:var(--auth-panel-background)]"
      >
        <RouterLink to="/" class="flex items-center gap-3 font-bold text-white/92">
          <img
            :src="authLogoIconWhite"
            alt="RentMate Logo"
            class="h-9 w-9 shrink-0 object-contain xl:h-10 xl:w-10"
          />
          <span class="text-base xl:text-lg">{{ brandName }}</span>
        </RouterLink>

        <div class="flex flex-1 items-center justify-center py-6">
          <div class="space-y-5 text-center">
            <div
              class="mx-auto flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-white/10 p-4 shadow-[0_24px_60px_rgba(17,33,110,0.25)] backdrop-blur-sm xl:h-28 xl:w-28"
            >
              <img :src="authLogoIconWhite" alt="RentMate Logo" class="h-full w-full object-contain" />
            </div>

            <div class="space-y-2">
              <h1 class="text-2xl font-bold tracking-tight xl:text-3xl">{{ brandName }}</h1>
              <p class="text-sm leading-6 text-white/82">{{ platformLineOne }}</p>
              <p class="text-sm leading-6 text-white/82">{{ platformLineTwo }}</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 text-xs text-white/76 xl:text-sm">
          <ShieldCheck class="h-4 w-4 shrink-0 text-white/92" />
          <span>{{ footerNote }}</span>
        </div>
      </section>

      <!-- 右側表單區：內容過長時只滾動此區 -->
      <main class="min-w-0 lg:h-dvh lg:overflow-y-auto lg:overscroll-contain">
        <div class="flex min-h-full justify-center px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-4 xl:px-10">
          <div :class="['my-auto w-full py-2 sm:py-3', contentWidthClass]">
            <RouterLink to="/" class="mb-6 inline-flex items-center gap-3 font-bold text-primary lg:hidden">
              <img :src="authLogoIcon" alt="RentMate Logo" class="h-9 w-9 shrink-0 object-contain" />
              <span class="text-lg">{{ brandName }}</span>
            </RouterLink>

            <slot />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

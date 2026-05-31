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
  <div class="min-h-screen [background:var(--auth-background)]">
    <div class="grid min-h-screen lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section
        class="hidden flex-col justify-between border-r border-white/10 p-10 text-white lg:flex [background:var(--auth-panel-background)]"
      >
        <RouterLink to="/" class="flex items-center gap-3 font-bold text-white/92">
          <img :src="authLogoIconWhite" alt="RentMate Logo" class="h-10 w-10 shrink-0 object-contain" />
          <span class="text-lg">{{ brandName }}</span>
        </RouterLink>

        <div class="flex flex-1 items-center justify-center">
          <div class="space-y-6 text-center">
            <div class="mx-auto flex h-32 w-32 items-center justify-center rounded-[2rem] bg-white/10 p-5 shadow-[0_24px_60px_rgba(17,33,110,0.25)] backdrop-blur-sm">
              <img :src="authLogoIconWhite" alt="RentMate Logo" class="h-full w-full object-contain" />
            </div>
            <div class="space-y-3">
              <h1 class="text-3xl font-bold tracking-tight">{{ brandName }}</h1>
              <p class="text-sm leading-7 text-white/82">{{ platformLineOne }}</p>
              <p class="text-sm leading-7 text-white/82">{{ platformLineTwo }}</p>
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
            <img :src="authLogoIcon" alt="RentMate Logo" class="h-10 w-10 shrink-0 object-contain" />
            <span class="text-xl">{{ brandName }}</span>
          </RouterLink>

          <slot />
        </div>
      </section>
    </div>
  </div>
</template>

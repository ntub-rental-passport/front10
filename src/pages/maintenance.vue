<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Wrench } from 'lucide-vue-next'
import { adminSettings } from '@/src/composables/admin/useAdminSettings'

const message = computed(() => adminSettings.value.maintenanceMessage)
const siteName = computed(() => adminSettings.value.siteName)
const supportEmail = computed(() => adminSettings.value.supportEmail)

function formatSchedule(value: string): string {
  if (value.trim() === '') return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// 只顯示結束時間：使用者關心的是什麼時候能用，不是什麼時候開始維護的
const resumesAt = computed(() => formatSchedule(adminSettings.value.maintenanceEndsAt))
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f7f8fc,_#f3f5fb)] px-6">
    <div class="max-w-md space-y-6 text-center">
      <div class="mx-auto w-fit rounded-3xl bg-primary/10 p-5 text-primary">
        <Wrench class="h-10 w-10" />
      </div>
      <div class="space-y-2">
        <h1 class="text-3xl font-black tracking-tight">{{ siteName }} 維護中</h1>
        <p class="text-muted-foreground">{{ message }}</p>
        <p v-if="resumesAt" class="text-sm text-muted-foreground">
          預計 {{ resumesAt }} 恢復服務
        </p>
        <p v-if="supportEmail" class="text-sm text-muted-foreground">
          需要協助請聯絡
          <a :href="`mailto:${supportEmail}`" class="text-primary underline underline-offset-4">
            {{ supportEmail }}
          </a>
        </p>
      </div>

      <!--
        管理員的自救入口。維護模式一旦開啟，一般路徑全部被導向這一頁，
        少了這個連結就只能靠手動打網址才回得到後台。
      -->
      <RouterLink
        to="/staff-login"
        class="inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        我是管理員，前往內部登入 →
      </RouterLink>
    </div>
  </div>
</template>

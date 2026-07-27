<script setup lang="ts">
import { computed } from 'vue'
import { Wrench } from 'lucide-vue-next'
import { adminSettings } from '@/src/composables/admin/useAdminSettings'

const message = computed(() => adminSettings.value.maintenanceMessage)
const siteName = computed(() => adminSettings.value.siteName)
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
      </div>
    </div>
  </div>
</template>

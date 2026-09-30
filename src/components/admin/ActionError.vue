<script setup lang="ts">
/**
 * 後台操作失敗時的提示。訊息直接用後端給的理由（例如「預警門檻需小於告急門檻」），
 * 不換成「操作失敗」—— 那等於要管理員自己猜哪裡不行。
 */
import { AlertTriangle, X } from 'lucide-vue-next'

defineProps<{ message: string }>()
defineEmits<{ dismiss: [] }>()
</script>

<template>
  <div
    role="alert"
    class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
  >
    <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <p class="min-w-0 flex-1 break-words">{{ message }}</p>
    <button
      type="button"
      class="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/10"
      aria-label="關閉提示"
      @click="$emit('dismiss')"
    >
      <X class="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
</template>

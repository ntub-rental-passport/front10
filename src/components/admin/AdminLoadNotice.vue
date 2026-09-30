<script setup lang="ts">
/**
 * 後台清單讀取中／讀不到時的提示。讀不到的時候不能顯示「尚無資料」——
 * 那會讓「連不上後端」看起來像「真的沒有」。
 */
defineProps<{
  state: 'idle' | 'loading' | 'ready' | 'error'
  /** 這份清單是什麼，例如「公告」 */
  what: string
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <p v-if="state === 'loading' || state === 'idle'" class="text-sm text-muted-foreground">
    正在讀取伺服器上的{{ what }}…
  </p>
  <div
    v-else-if="state === 'error'"
    role="alert"
    class="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
  >
    <span class="min-w-0 flex-1">讀不到伺服器上的{{ what }}，可能是網路中斷或登入已失效。</span>
    <button type="button" class="shrink-0 font-medium underline underline-offset-2" @click="$emit('retry')">
      重新讀取
    </button>
  </div>
</template>

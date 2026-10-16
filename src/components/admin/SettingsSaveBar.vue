<script setup lang="ts">
/** 系統設定各頁籤底部固定於畫面下緣的儲存列。 */
import { Button } from '@/components/ui/button/index'

defineProps<{
  dirty: boolean
  /** 有欄位驗證沒過；可以還原，不能儲存 */
  invalid?: boolean
  saving?: boolean
  savedAt?: string | null
  error?: string
}>()

defineEmits<{ save: []; revert: [] }>()
</script>

<template>
  <div
    class="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm"
  >
    <p v-if="error" class="mr-auto text-sm font-medium text-destructive">{{ error }}</p>
    <p v-else-if="dirty" class="mr-auto text-sm text-foreground/70">有還沒儲存的變更</p>
    <p v-else-if="savedAt" class="mr-auto text-sm text-foreground/70">已於 {{ savedAt }} 儲存</p>
    <p v-else class="mr-auto text-sm text-foreground/70">沒有未儲存的變更</p>

    <Button variant="outline" :disabled="!dirty || saving" @click="$emit('revert')">還原變更</Button>
    <Button :disabled="!dirty || invalid || saving" @click="$emit('save')">
      {{ saving ? '儲存中…' : '儲存' }}
    </Button>
  </div>
</template>

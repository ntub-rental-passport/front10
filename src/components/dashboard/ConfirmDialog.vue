<script setup lang="ts">
import { Button } from '@/components/ui/button/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog/index'

defineProps<{
  open: boolean
  title: string
  message: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-sm rounded-2xl border-slate-200 p-0">
      <div class="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
        <DialogHeader>
          <DialogTitle class="text-lg font-semibold text-slate-900">{{ title }}</DialogTitle>
        </DialogHeader>
      </div>
      <div class="space-y-5 px-6 py-6">
        <p class="text-sm text-slate-600">{{ message }}</p>
        <div class="flex gap-3">
          <Button variant="outline" class="flex-1 rounded-xl" @click="emit('update:open', false)">
            取消
          </Button>
          <Button class="flex-1 rounded-xl bg-red-600 text-white hover:bg-red-700" @click="emit('confirm')">
            確認撤銷
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

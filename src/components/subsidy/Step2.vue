<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { FileText } from 'lucide-vue-next'

const emit = defineEmits<{ next: []; back: [] }>()

const documents = [
  '租賃契約書（正本或公證本）',
  '房東同意申請補貼聲明書',
  '戶口名簿或戶籍謄本',
  '最近一年綜合所得稅核定通知書',
  '身分證正反面影本',
  '存摺封面影本（申請匯款用）',
]
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold">準備文件</h2>
      <p class="text-sm text-muted-foreground mt-1">申請前請準備以下文件</p>
    </div>
    <div class="space-y-2">
      <div v-for="doc in documents" :key="doc" class="flex items-center gap-2 p-3 rounded-lg border bg-card">
        <FileText class="h-4 w-4 text-muted-foreground shrink-0" />
        <span class="text-sm flex-1">{{ doc }}</span>
        <Badge variant="secondary">必備</Badge>
      </div>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" class="flex-1" @click="emit('back')">上一步</Button>
      <Button class="flex-1" @click="emit('next')">前往申請</Button>
    </div>
  </div>
</template>

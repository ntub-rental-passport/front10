<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'

const cases = [
  { id: 'RV-2026-018', type: '租約高風險條款', source: 'AI 風險分析', status: '待認領', priority: '高' },
  { id: 'RV-2026-017', type: 'OCR 內容校正', source: '租約掃描', status: '審核中', priority: '一般' },
  { id: 'RV-2026-016', type: '租補資料確認', source: '使用者補件', status: '待認領', priority: '一般' },
]
</script>

<template>
  <div class="space-y-6">
    <div><p class="text-sm font-semibold text-primary">REVIEW CONSOLE</p><h1 class="mt-2 text-4xl font-black tracking-tight">人工審核工作台</h1><p class="mt-2 text-muted-foreground">處理系統轉交的資料校正、高風險條款與補件案件。</p></div>
    <div class="grid gap-4 md:grid-cols-3"><Card class="rounded-3xl"><CardContent class="p-6"><p class="text-sm text-muted-foreground">待審核</p><p class="mt-2 text-3xl font-black">12</p></CardContent></Card><Card class="rounded-3xl"><CardContent class="p-6"><p class="text-sm text-muted-foreground">我的審核中</p><p class="mt-2 text-3xl font-black">3</p></CardContent></Card><Card class="rounded-3xl"><CardContent class="p-6"><p class="text-sm text-muted-foreground">今日已完成</p><p class="mt-2 text-3xl font-black">8</p></CardContent></Card></div>
    <Card class="rounded-[1.75rem]"><CardHeader><CardTitle>優先案件</CardTitle></CardHeader><CardContent class="space-y-3"><div v-for="item in cases" :key="item.id" class="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><div class="flex items-center gap-2"><p class="font-semibold">{{ item.type }}</p><Badge variant="outline">{{ item.priority }}</Badge></div><p class="mt-1 text-sm text-muted-foreground">{{ item.id }} · {{ item.source }} · {{ item.status }}</p></div><Button size="sm">查看案件</Button></div></CardContent></Card>
  </div>
</template>

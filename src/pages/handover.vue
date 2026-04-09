<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Camera, FileDown, CheckCircle2, AlertCircle, Plus } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">點交清單與存證</h1>
        <p class="text-muted-foreground">拍攝家具現況，AI 協助辨識清晰度，一鍵匯出證據包。</p>
      </div>
      <Button>
        <FileDown class="mr-2 h-4 w-4" />
        匯出 PDF
      </Button>
    </div>

    <div class="flex gap-4 border-b pb-4">
      <Button variant="default">搬入點交 (2026/03/01)</Button>
      <Button variant="ghost">搬出點交 (尚未建立)</Button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader class="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle class="text-lg">冷氣機</CardTitle>
            <CardDescription>客廳</CardDescription>
          </div>
          <Badge variant="secondary" class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <CheckCircle2 class="mr-1 h-3 w-3" />
            已存證
          </Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="aspect-video bg-muted rounded-md overflow-hidden">
            <img src="https://picsum.photos/seed/ac/400/300" alt="冷氣機" class="object-cover w-full h-full" referrerpolicy="no-referrer" />
          </div>
          <div class="text-sm">
            <p><strong>備註：</strong> 外觀無損，運轉正常。濾網已清洗。</p>
            <p class="text-xs text-muted-foreground mt-1">拍攝時間：2026/03/01 14:30</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle class="text-lg">雙人床墊</CardTitle>
            <CardDescription>主臥室</CardDescription>
          </div>
          <Badge variant="secondary" class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <CheckCircle2 class="mr-1 h-3 w-3" />
            已存證
          </Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="aspect-video bg-muted rounded-md overflow-hidden">
            <img src="https://picsum.photos/seed/bed/400/300" alt="床墊" class="object-cover w-full h-full" referrerpolicy="no-referrer" />
          </div>
          <div class="text-sm">
            <p><strong>備註：</strong> 左下角有輕微污漬，已向房東確認不扣押金。</p>
            <p class="text-xs text-muted-foreground mt-1">拍攝時間：2026/03/01 14:45</p>
          </div>
        </CardContent>
      </Card>

      <Card class="border-primary/50 shadow-sm">
        <CardHeader class="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle class="text-lg">洗衣機</CardTitle>
            <CardDescription>陽台</CardDescription>
          </div>
          <Badge variant="destructive">
            <AlertCircle class="mr-1 h-3 w-3" />
            待拍攝
          </Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="aspect-video bg-muted/50 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer">
            <Camera class="h-8 w-8 mb-2" />
            <span class="text-sm font-medium">點擊拍攝或上傳</span>
          </div>
          <div class="text-sm text-muted-foreground">
            <p>請拍攝外觀與內部滾筒。</p>
          </div>
        </CardContent>
      </Card>

      <Card class="border-dashed flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer min-h-[300px]">
        <Plus class="h-10 w-10 mb-2" />
        <span class="font-medium">新增點交項目</span>
      </Card>
    </div>
  </div>
</template>

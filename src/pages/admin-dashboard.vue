<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { BellRing, FileSearch, ShieldAlert, Users } from 'lucide-vue-next'

const adminStats = [
  {
    title: '待處理 OCR 任務',
    value: '12',
    note: '其中有 4 筆需要人工複核',
    icon: FileSearch,
  },
  {
    title: '高風險條款案件',
    value: '8',
    note: '今日新增 2 筆待確認案件',
    icon: ShieldAlert,
  },
  {
    title: '系統提醒',
    value: '3',
    note: '包含知識庫更新與任務通知',
    icon: BellRing,
  },
  {
    title: '累計處理使用者',
    value: '186',
    note: '本月成長 12%',
    icon: Users,
  },
]
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 px-4 py-1.5 text-primary">
        Admin Console
      </Badge>
      <div>
        <h1 class="text-4xl font-black tracking-tight">後台總覽</h1>
        <p class="mt-2 text-muted-foreground">
          這裡是後台人員的工作區，可集中查看 OCR 任務、租屋知識內容與風險分析處理狀態。
        </p>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card
        v-for="item in adminStats"
        :key="item.title"
        class="rounded-[1.5rem] border-border/70 bg-background/90 shadow-sm"
      >
        <CardHeader class="flex flex-row items-center justify-between pb-2">
          <CardTitle class="text-sm font-medium">{{ item.title }}</CardTitle>
          <component :is="item.icon" class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent class="space-y-1">
          <div class="text-3xl font-black">{{ item.value }}</div>
          <p class="text-sm text-muted-foreground">{{ item.note }}</p>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Card class="rounded-[1.75rem]">
        <CardHeader>
          <CardTitle>後台近期工作</CardTitle>
          <CardDescription>這一版先建立角色分流與管理入口，後續可以再接真正的後台流程。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm text-muted-foreground">
          <div class="rounded-2xl border bg-muted/20 p-4">
            1. OCR 任務清單可接上傳紀錄，補上辨識狀態、失敗原因與人工重跑機制。
          </div>
          <div class="rounded-2xl border bg-muted/20 p-4">
            2. 高風險條款案件可串接 Gemini 分析結果，提供人工覆核與標記功能。
          </div>
          <div class="rounded-2xl border bg-muted/20 p-4">
            3. 租屋知識庫可從這裡管理文章、標籤與首頁 AI 防禦提醒內容。
          </div>
        </CardContent>
      </Card>

      <Card
        class="rounded-[1.75rem] border-primary/10 bg-[linear-gradient(180deg,_rgba(56,59,149,0.98),_rgba(86,96,214,0.92))] text-white shadow-lg"
      >
        <CardHeader>
          <CardTitle class="text-white">角色分流已建立</CardTitle>
          <CardDescription class="text-white/75">
            一般使用者登入後前往 `/app`，後台人員登入後前往 `/admin`，後續可再接權限驗證與 API。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  </div>
</template>

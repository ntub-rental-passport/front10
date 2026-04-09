<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, PiggyBank, Trash2, Zap, CheckSquare, AlertTriangle, ClipboardList, User } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">租屋總覽</h1>
      <p class="text-muted-foreground">歡迎回來，這是您目前的租屋狀態與待辦事項。</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">本月租金</CardTitle>
          <PiggyBank class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">$12,000</div>
          <p class="text-xs text-muted-foreground">繳款期限: 5/10</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">契約狀態</CardTitle>
          <FileText class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">有效</div>
          <p class="text-xs text-muted-foreground">剩餘 8 個月</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">待辦事項</CardTitle>
          <CheckSquare class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">3</div>
          <p class="text-xs text-muted-foreground">記事板</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">近期提醒</CardTitle>
          <AlertTriangle class="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold text-destructive">1</div>
          <p class="text-xs text-muted-foreground">明日 14:00 停水</p>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>快速功能</CardTitle>
          <CardDescription>常用的租屋管理工具</CardDescription>
        </CardHeader>
        <CardContent class="grid grid-cols-2 gap-4">
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/contract">
              <FileText class="h-6 w-6" />
              契約分析
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/subsidy">
              <PiggyBank class="h-6 w-6" />
              租金補貼
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/garbage">
              <Trash2 class="h-6 w-6" />
              垃圾清運
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/outage">
              <Zap class="h-6 w-6" />
              停水停電
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/handover">
              <CheckSquare class="h-6 w-6" />
              點交清單
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/notes">
              <ClipboardList class="h-6 w-6" />
              記事板
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/account">
              <User class="h-6 w-6" />
              我的帳戶
            </RouterLink>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>近期動態</CardTitle>
          <CardDescription>您與室友的最新活動</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div class="flex items-center gap-4">
              <div class="h-2 w-2 rounded-full bg-primary" />
              <div class="flex-1 space-y-1">
                <p class="text-sm font-medium leading-none">室友 A 新增了待辦事項</p>
                <p class="text-sm text-muted-foreground">打掃公共區域 (本週日)</p>
              </div>
              <div class="text-xs text-muted-foreground">2小時前</div>
            </div>
            <div class="flex items-center gap-4">
              <div class="h-2 w-2 rounded-full bg-primary" />
              <div class="flex-1 space-y-1">
                <p class="text-sm font-medium leading-none">系統提醒</p>
                <p class="text-sm text-muted-foreground">租金補貼申請已通過初審</p>
              </div>
              <div class="text-xs text-muted-foreground">昨天</div>
            </div>
            <div class="flex items-center gap-4">
              <div class="h-2 w-2 rounded-full bg-muted" />
              <div class="flex-1 space-y-1">
                <p class="text-sm font-medium leading-none text-muted-foreground">完成點交清單</p>
                <p class="text-sm text-muted-foreground">已匯出 PDF 證據包</p>
              </div>
              <div class="text-xs text-muted-foreground">3天前</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

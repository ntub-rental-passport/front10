<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Badge } from '@/components/ui/badge/index'
import { Switch } from '@/components/ui/switch/index'
import { Label } from '@/components/ui/label/index'
import { Zap, Droplets, Search, BellRing } from 'lucide-vue-next'

const searchAddress = ref('台北市大安區')
const powerNotif = ref(true)
const waterNotif = ref(true)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">停水停電資訊</h1>
      <p class="text-muted-foreground">查詢租屋處災情資訊，設定即時推播通知。</p>
    </div>

    <div class="flex gap-2 max-w-md">
      <div class="relative flex-1">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input v-model="searchAddress" placeholder="輸入地址或行政區..." class="pl-8" />
      </div>
      <Button>查詢</Button>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <div class="space-y-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <Zap class="h-5 w-5 text-amber-500" />
          停電資訊
        </h2>
        <Card class="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardHeader class="pb-2">
            <div class="flex justify-between items-start">
              <CardTitle class="text-lg">計畫性工作停電</CardTitle>
              <Badge variant="outline" class="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-100">明日</Badge>
            </div>
            <CardDescription class="text-amber-700 dark:text-amber-400">台北市大安區</CardDescription>
          </CardHeader>
          <CardContent class="text-sm space-y-2">
            <p><strong>時間：</strong> 2026/04/09 14:00 - 16:00</p>
            <p><strong>範圍：</strong> 和平東路二段 80 巷至 120 巷</p>
            <p><strong>原因：</strong> 變壓器更換工程</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <div class="flex justify-between items-start">
              <CardTitle class="text-lg text-muted-foreground">無其他停電資訊</CardTitle>
              <Badge variant="secondary">正常</Badge>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div class="space-y-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <Droplets class="h-5 w-5 text-blue-500" />
          停水資訊
        </h2>
        <Card>
          <CardHeader class="pb-2">
            <div class="flex justify-between items-start">
              <CardTitle class="text-lg text-muted-foreground">目前供水正常</CardTitle>
              <Badge variant="secondary">正常</Badge>
            </div>
            <CardDescription>台北市大安區無停水計畫</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>

    <Card class="mt-8 bg-muted/50">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <BellRing class="h-5 w-5" />
          通知設定
        </CardTitle>
        <CardDescription>當租屋處有停水停電計畫時，系統將透過 PWA 推播通知您。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">停電通知</Label>
            <p class="text-sm text-muted-foreground">接收計畫性與突發性停電通知</p>
          </div>
          <Switch v-model="powerNotif" />
        </div>
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">停水通知</Label>
            <p class="text-sm text-muted-foreground">接收計畫性與突發性停水通知</p>
          </div>
          <Switch v-model="waterNotif" />
        </div>
      </CardContent>
    </Card>
  </div>
</template>

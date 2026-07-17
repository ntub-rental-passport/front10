<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Database, FileClock, ShieldAlert, Users } from 'lucide-vue-next'

const stats = [
  { title: '平台帳號', value: '186', note: '本月新增 14 個帳號', icon: Users },
  { title: '停用帳號', value: '3', note: '等待管理員後續處理', icon: ShieldAlert },
  { title: '待維護資料', value: '7', note: '包含內容與系統資料', icon: Database },
  { title: '今日管理操作', value: '24', note: '所有變更均應留下紀錄', icon: FileClock },
]
</script>

<template>
  <div class="space-y-6">
    <div><p class="text-sm font-semibold text-primary">SYSTEM ADMIN</p><h1 class="mt-2 text-4xl font-black tracking-tight">系統管理總覽</h1><p class="mt-2 text-muted-foreground">管理平台帳號、角色、資料內容與維護紀錄。這個工作區不再提供房東業務功能。</p></div>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Card v-for="item in stats" :key="item.title" class="rounded-[1.5rem]"><CardHeader class="flex flex-row items-center justify-between pb-2"><CardTitle class="text-sm">{{ item.title }}</CardTitle><component :is="item.icon" class="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p class="text-3xl font-black">{{ item.value }}</p><p class="mt-1 text-sm text-muted-foreground">{{ item.note }}</p></CardContent></Card></div>
    <Card class="rounded-[1.75rem] border-amber-200 bg-amber-50/70"><CardContent class="p-6 text-sm leading-6 text-amber-900"><strong>安全原則：</strong>系統管理員只能發起密碼重設，不能查看或取得任何使用者原始密碼；正式功能必須由後端權限驗證並寫入操作紀錄。</CardContent></Card>
  </div>
</template>

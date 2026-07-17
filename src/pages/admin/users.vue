<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'

const search = ref('')
const users = [
  { id: 'U-0186', email: 'tenant.demo@rentmate.tw', role: 'tenant', status: '使用中', lastLogin: '2026/07/18 09:42' },
  { id: 'U-0185', email: 'landlord.demo@rentmate.tw', role: 'landlord', status: '使用中', lastLogin: '2026/07/17 21:10' },
  { id: 'U-0012', email: 'reviewer@rentmate.tw', role: 'reviewer', status: '使用中', lastLogin: '2026/07/18 08:55' },
  { id: 'U-0001', email: 'admin@rentmate.tw', role: 'admin', status: '使用中', lastLogin: '2026/07/18 10:03' },
]
</script>

<template>
  <div class="space-y-6">
    <div><h1 class="text-4xl font-black tracking-tight">帳號與角色</h1><p class="mt-2 text-muted-foreground">建立、查詢、停用帳號，發起密碼重設並分配平台角色。</p></div>
    <Card class="rounded-[1.75rem]"><CardHeader><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>帳號清單</CardTitle><div class="flex gap-2"><Input v-model="search" placeholder="搜尋 Email 或編號" class="w-64" /><Button>建立帳號</Button></div></div></CardHeader><CardContent class="space-y-3"><div v-for="user in users" :key="user.id" class="flex flex-col gap-3 rounded-2xl border p-4 xl:flex-row xl:items-center xl:justify-between"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><p class="font-semibold">{{ user.email }}</p><Badge variant="outline">{{ user.role }}</Badge><Badge>{{ user.status }}</Badge></div><p class="mt-1 text-sm text-muted-foreground">{{ user.id }} · 最後登入 {{ user.lastLogin }}</p></div><div class="flex flex-wrap gap-2"><Button size="sm" variant="outline">分配角色</Button><Button size="sm" variant="outline">寄送密碼重設</Button><Button size="sm" variant="destructive">停用</Button></div></div><p class="text-xs text-muted-foreground">目前為介面與示範資料；按鈕尚未連接正式後端 API。</p></CardContent></Card>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { BellRing } from 'lucide-vue-next'
import { useOutageData } from './useOutageData'

const {
  changeNotif,
  powerNotif,
  reminderLeadTime,
  syncRoommates,
  waterNotif,
} = useOutageData()
</script>

<template>
  <section class="space-y-5">
    <Card class="rounded-[28px] border border-slate-200 shadow-sm">
      <CardHeader class="space-y-1 px-5 py-5">
        <CardTitle class="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <BellRing class="h-5 w-5 text-primary" />
          通知設定
        </CardTitle>
        <p class="text-sm text-slate-500">把公告轉成前置提醒，避免等到停水停電才臨時處理。</p>
      </CardHeader>
      <CardContent class="space-y-5 px-5 pb-5">
        <div class="space-y-4 rounded-[22px] border border-slate-100 bg-slate-50/70 p-4">
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="text-sm font-semibold text-slate-900">停電通知</p>
              <p class="text-xs leading-5 text-slate-500">接收計畫性停電與恢復通知</p>
            </div>
            <Switch v-model="powerNotif" />
          </div>

          <Separator />

          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="text-sm font-semibold text-slate-900">停水通知</p>
              <p class="text-xs leading-5 text-slate-500">接收停水、降壓與恢復通知</p>
            </div>
            <Switch v-model="waterNotif" />
          </div>

          <Separator />

          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="text-sm font-semibold text-slate-900">公告異動提醒</p>
              <p class="text-xs leading-5 text-slate-500">時間、範圍或原因更新時同步提醒</p>
            </div>
            <Switch v-model="changeNotif" />
          </div>
        </div>

        <div class="space-y-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">提醒時間</p>
            <p class="mt-1 text-xs text-slate-500">可依你的生活習慣，選擇想提早多久收到通知。</p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              :class="[
                'rounded-2xl border px-4 py-3 text-left transition-colors',
                reminderLeadTime === '3_hours'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              ]"
              @click="reminderLeadTime = '3_hours'"
            >
              <p class="text-sm font-semibold">前 3 小時</p>
              <p class="mt-1 text-xs">適合當天充電、儲水與最後確認</p>
            </button>
            <button
              type="button"
              :class="[
                'rounded-2xl border px-4 py-3 text-left transition-colors',
                reminderLeadTime === '1_day'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              ]"
              @click="reminderLeadTime = '1_day'"
            >
              <p class="text-sm font-semibold">前一天</p>
              <p class="mt-1 text-xs">適合提早調整洗衣、煮飯與生活安排</p>
            </button>
          </div>
        </div>

        <div class="rounded-[22px] border border-violet-200 bg-[linear-gradient(135deg,rgba(246,243,255,1),rgba(255,255,255,1))] p-4">
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="text-sm font-semibold text-slate-900">同步室友</p>
              <p class="text-xs leading-5 text-slate-500">將停水停電事件同步到共居協作與備忘錄。</p>
            </div>
            <Switch v-model="syncRoommates" />
          </div>
        </div>

        <Button class="h-11 w-full rounded-full bg-primary text-white hover:bg-primary/90">
          儲存通知設定
        </Button>
      </CardContent>
    </Card>
  </section>
</template>

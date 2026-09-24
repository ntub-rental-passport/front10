<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import type { Phase } from '@/src/utils/phase'

/**
 * 公告／輪播目前處於哪個階段（草稿／排程中／生效中／過期）。原本列表只顯示
 * 日期區間，讀者得自己拿今天去比對，seed 資料甚至把「（已過期）」寫進標題來
 * 補救——狀態該由介面說，不是靠資料硬寫。
 *
 * 其他後台頁面若也有「草稿／排程／生效／過期」這組語意，直接用這個元件——
 * 輪播（BannersTab）就是這樣接上的，型別用共用的 Phase 而不是
 * AnnouncementPhase，避免元件名字暗示「只給公告用」。
 */
defineProps<{ phase: Phase }>()

const LABELS: Record<Phase, string> = {
  draft: '未發布',
  scheduled: '排程中',
  active: '生效中',
  expired: '已過期',
}

/*
 * 生效中是唯一需要被看見的狀態，其餘一律低調——列表裡大部分項目不在生效中，
 * 若每種狀態都上色，掃視時反而找不到現在真的掛在前台的是哪幾則。
 *
 * 顏色改用專案語意色（見 status-dot.ts 的 STATUS_CHIP_CLASS）而不是寫死的
 * amber/emerald：這兩個 token 組合已經量過深淺色模式對比都過 AA，日後主題
 * 調色只要改 token，不用再回來找這裡的十六進位色碼。
 */
const CLASSES: Record<Phase, string> = {
  draft: 'border-transparent bg-muted text-muted-foreground',
  scheduled: 'border-transparent bg-accent text-accent-foreground',
  active: 'border-transparent bg-success text-success-foreground',
  expired: 'border-transparent bg-muted text-muted-foreground',
}
</script>

<template>
  <Badge variant="outline" :class="CLASSES[phase]">{{ LABELS[phase] }}</Badge>
</template>

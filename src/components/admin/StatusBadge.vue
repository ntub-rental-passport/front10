<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import type { AnnouncementPhase } from '@/src/utils/announcement'

/**
 * 公告目前處於哪個階段。原本列表只顯示日期區間，讀者得自己拿今天去比對，
 * seed 資料甚至把「（已過期）」寫進標題來補救——狀態該由介面說，不是靠資料硬寫。
 *
 * 其他後台頁面若也有「草稿／排程／生效／過期」這組語意，直接用這個元件。
 */
defineProps<{ phase: AnnouncementPhase }>()

const LABELS: Record<AnnouncementPhase, string> = {
  draft: '未發布',
  scheduled: '排程中',
  active: '生效中',
  expired: '已過期',
}

// 生效中是唯一需要被看見的狀態，其餘一律低調——列表裡大部分公告都不在生效中，
// 若每種狀態都上色，掃視時反而找不到現在真的掛在前台的是哪幾則。
const CLASSES: Record<AnnouncementPhase, string> = {
  draft: 'border-transparent bg-muted text-muted-foreground',
  scheduled: 'border-amber-300 bg-amber-50 text-amber-700',
  active: 'border-transparent bg-emerald-100 text-emerald-700',
  expired: 'border-transparent bg-muted text-muted-foreground',
}
</script>

<template>
  <Badge variant="outline" :class="CLASSES[phase]">{{ LABELS[phase] }}</Badge>
</template>

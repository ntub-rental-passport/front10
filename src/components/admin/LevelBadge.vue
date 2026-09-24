<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import type { AnnouncementLevel } from '@/src/mocks/admin/content'

/**
 * 公告等級的唯一色彩來源。後台列表、通知中心都用這個元件，
 * 避免同一個「緊急」在兩邊長得不一樣——前台已經有一組等級色，
 * 後台若自己再定一份，兩邊遲早漂移。
 */
const props = defineProps<{
  level: AnnouncementLevel
  /** 前面加「公告 ·」前綴，通知中心的收件匣需要區分公告與一般通知 */
  prefixed?: boolean
}>()

const LABELS: Record<AnnouncementLevel, string> = {
  info: '一般',
  warning: '注意',
  urgent: '緊急',
}

// warning 改用 --accent 語意色（跟 StatusBadge 的排程中同一組），不再寫死
// amber——它是深色頁面上僅有的亮色粉彩塊，而且沒有走 design token，換色或
// 調對比時這裡不會跟著動。
//
// urgent 從「淡紅底 + 紅字」改成實心填色（跟 STATUS_CHIP_CLASS.danger 同一組）。
// 淡底的問題是對比會跟著它踩的底色漂移：放在頁面上深色 5.65、淺色 4.65，
// 放進公告列的卡片底裡深色只剩 4.37 —— 同一顆膠囊換個位置就不過 AA。
// 實心填色是不透明的，不管放在哪裡都是 6.35。
// 順帶形成等級的視覺升級：一般＝淡底、注意＝實心琥珀、緊急＝實心紅。
const CLASSES: Record<AnnouncementLevel, string> = {
  info: 'border-primary/40 bg-primary/10 text-primary',
  warning: 'border-transparent bg-accent text-accent-foreground',
  urgent: 'border-transparent bg-destructive-surface text-destructive-surface-foreground',
}

const label = computed(() =>
  props.prefixed ? `公告 · ${LABELS[props.level]}` : LABELS[props.level],
)
</script>

<template>
  <Badge variant="outline" :class="CLASSES[level]">{{ label }}</Badge>
</template>

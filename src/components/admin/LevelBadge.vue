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

const CLASSES: Record<AnnouncementLevel, string> = {
  info: 'border-primary/40 bg-primary/10 text-primary',
  warning: 'border-amber-300 bg-amber-50 text-amber-700',
  urgent: 'border-destructive/40 bg-destructive/10 text-destructive',
}

const label = computed(() =>
  props.prefixed ? `公告 · ${LABELS[props.level]}` : LABELS[props.level],
)
</script>

<template>
  <Badge variant="outline" :class="CLASSES[level]">{{ label }}</Badge>
</template>

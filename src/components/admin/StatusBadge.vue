<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import type { Phase } from '@/src/utils/phase'

/** 公告、輪播等內容的階段徽章，使用共用的 Phase 型別表示草稿、排程中、生效中或過期。 */
defineProps<{ phase: Phase }>()

const LABELS: Record<Phase, string> = {
  draft: '未發布',
  scheduled: '排程中',
  active: '生效中',
  expired: '已過期',
}

/* 使用共用語意色 token，確保深淺色模式的文字對比皆符合 AA。 */
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

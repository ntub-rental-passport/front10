<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { ArrowUpRight } from 'lucide-vue-next'
import { DEFAULT_ACTION_LABEL } from '@/src/utils/tenant-route-link'
import { formatDateTime } from '@/src/utils/admin-format'

/** 租客通知卡的後台預覽使用主題色；此處與租客端為獨立實作，租客端改版時需同步更新。 */
const props = defineProps<{
  title: string
  body: string
  actionUrl?: string
  actionLabel?: string
  /** 發送當下才會有真的時間，預覽固定顯示「現在」 */
  now: Date
}>()

const displayTitle = computed(() => props.title.trim() || '（還沒有標題）')
const displayBody = computed(() => props.body.trim() || '（還沒有內文）')
const hasContent = computed(() => props.title.trim() !== '' || props.body.trim() !== '')
const actionText = computed(() => props.actionLabel?.trim() || DEFAULT_ACTION_LABEL)
</script>

<template>
  <div class="rounded-2xl border border-l-4 border-border border-l-primary bg-primary/5 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p :class="['text-sm font-bold', hasContent ? '' : 'text-foreground/40']">
        {{ displayTitle }}
      </p>
      <span class="text-xs text-foreground/70">{{ formatDateTime(now.toISOString()) }}</span>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <!-- 後台送出的通知 sourceType 一律為 admin。 -->
      <Badge variant="secondary">管理員</Badge>
    </div>

    <p :class="['mt-2 whitespace-pre-wrap text-sm', hasContent ? 'text-foreground/80' : 'text-foreground/40']">
      {{ displayBody }}
    </p>

    <!-- 租客端是 v-if="item.actionUrl"：沒有連結就不會有按鈕，只填文字沒有用 -->
    <div v-if="actionUrl" class="mt-3">
      <Button variant="outline" size="sm" class="gap-1.5 pointer-events-none">
        {{ actionText }}
        <ArrowUpRight class="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
</template>

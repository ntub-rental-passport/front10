<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { ArrowUpRight } from 'lucide-vue-next'
import { DEFAULT_ACTION_LABEL } from '@/src/utils/notif-action-link'
import { formatDateTime } from '@/src/utils/admin-format'

/**
 * 租客會看到的那張通知卡。
 *
 * 版面照抄 src/pages/notifications.vue 的未讀卡片：左邊一條粗邊、標題在左
 * 時間在右、來源 badge、內文、最後是操作按鈕。管理員在按下發送之前，
 * 看到的東西必須跟租客真的收到的一樣 —— 只給「標題＋內文」兩行純文字的
 * 預覽，等於沒有預覽。
 *
 * 唯一刻意不同的地方：租客端那張卡寫死了 slate 色階，這裡用 design token。
 * 後台有深色模式，照抄 bg-white 的話整張卡在深色下會變成一塊白板。
 *
 * ⚠️ 這是複製品，不是同一個元件。租客端那頁改版時這裡不會自動跟著變 ——
 * 但把那個元件抽出來共用的代價是動到租客端，目前不在範圍內。
 */
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
      <!-- 後台送出的通知，sourceType 一律是 admin（見 notificationApi 的預設值） -->
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

<script setup lang="ts">
import { MoreHorizontal } from 'lucide-vue-next'
import { Button } from '@/components/ui/button/index'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu/index'

/**
 * 表格列尾的操作區：主要動作留在列上，其餘收進「⋯」。
 *
 * 原本每列平鋪四顆按鈕（發送／編輯／停用／刪除），五列就是二十顆，
 * 而刪除用的是實心 destructive 樣式——整頁最搶眼的東西變成最不該被按的那顆。
 * 收進選單同時降低誤觸，這個後台的刪除是沒有復原的。
 */
export interface RowAction {
  label: string
  /** 危險動作在選單裡用紅字標示，並排在分隔線之後 */
  danger?: boolean
  onSelect: () => void
}

defineProps<{
  /** 選單裡的次要動作，由呼叫端決定順序 */
  actions: RowAction[]
}>()
</script>

<template>
  <div class="flex items-center justify-end gap-1">
    <!-- 主要動作由呼叫端放進 slot，每列最多一顆，維持單一視覺重心 -->
    <slot />

    <DropdownMenu v-if="actions.length > 0">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" aria-label="更多操作">
          <MoreHorizontal class="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-[9rem]">
        <template v-for="(action, index) in actions" :key="action.label">
          <DropdownMenuSeparator
            v-if="action.danger && index > 0 && !actions[index - 1].danger"
          />
          <DropdownMenuItem
            :class="action.danger ? 'text-destructive focus:text-destructive' : undefined"
            @select="action.onSelect"
          >
            {{ action.label }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

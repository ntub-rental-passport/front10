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

/** 表格列尾的操作區：主要動作留在列上，其餘收進選單以降低不可復原刪除的誤觸風險。 */
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

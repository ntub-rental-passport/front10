<script setup lang="ts">
/**
 * 管理員人數。
 *
 * 刻意不做成圖表：只有兩個資料點、值又都很小，圓餅圖讀不出比例，
 * 數字本身就是最清楚的呈現。也刻意不可點 —— 現有篩選軸只到「管理員」這層，
 * 分不出超級與一般，做成可點會給出對不上的結果。
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { adminRoleLabels } from '@/src/utils/admin-rbac'
import type { AdminRole } from '@/src/utils/admin-rbac'

defineProps<{
  counts: Record<AdminRole, number>
  colors: Record<AdminRole, string>
}>()

const roles: AdminRole[] = ['super', 'admin']
</script>

<template>
  <Card class="h-full rounded-[1.5rem] border-border/70 bg-background/90 shadow-sm">
    <CardHeader class="pb-2">
      <CardTitle class="text-sm font-medium">管理員人數</CardTitle>
      <p class="text-xs text-muted-foreground">依權限角色區分</p>
    </CardHeader>
    <CardContent>
      <div class="flex h-36 flex-col justify-center gap-4">
        <div v-for="role in roles" :key="role" class="flex items-center gap-3">
          <span
            class="h-10 w-1.5 shrink-0 rounded-full"
            :style="{ backgroundColor: colors[role] }"
          />
          <div>
            <p class="text-3xl font-black leading-none">{{ counts[role] }}</p>
            <p class="mt-1 text-xs text-muted-foreground">{{ adminRoleLabels[role] }}</p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

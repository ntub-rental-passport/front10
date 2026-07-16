<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Progress } from '@/components/ui/progress/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { useAdminSubscription } from '@/src/composables/admin/useAdminSubscription'
import { formatDate } from '@/src/utils/admin-format'
import type { PlanId, Subscription } from '@/src/mocks/admin-seed'

const { plans, subscriptions, planOf, changePlan, cancelSubscription, isExpiringSoon } =
  useAdminSubscription()

function storageLabel(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`
}

function usagePercent(used: number, quota: number): number {
  if (quota <= 0) return 0
  return Math.min(100, Math.round((used / quota) * 100))
}

function handlePlanChange(subscription: Subscription, value: unknown): void {
  changePlan(subscription.id, value as PlanId)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">訂閱與容量管理</h1>
      <p class="mt-1 text-muted-foreground">
        管理方案額度與使用者訂閱；到期前 14 天會標示提醒。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <Card v-for="plan in plans" :key="plan.id" class="rounded-[1.5rem]">
        <CardHeader>
          <CardTitle class="flex items-baseline justify-between">
            {{ plan.name }}
            <span class="text-base font-semibold text-primary">{{ plan.priceLabel }}</span>
          </CardTitle>
          <CardDescription>
            AI 分析 {{ plan.aiQuota }} 次／月｜儲存空間 {{ storageLabel(plan.storageMb) }}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>使用者</TableHead>
              <TableHead>方案</TableHead>
              <TableHead>到期日</TableHead>
              <TableHead class="min-w-40">AI 用量</TableHead>
              <TableHead class="min-w-40">儲存用量</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="subscription in subscriptions" :key="subscription.id">
              <TableCell class="font-medium">{{ subscription.userEmail }}</TableCell>
              <TableCell>
                <Select
                  :model-value="subscription.planId"
                  :disabled="!subscription.active"
                  @update:model-value="(value) => handlePlanChange(subscription, value)"
                >
                  <SelectTrigger class="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="plan in plans" :key="plan.id" :value="plan.id">
                      {{ plan.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  {{ formatDate(subscription.expiresAt) }}
                  <Badge v-if="isExpiringSoon(subscription)" variant="destructive">即將到期</Badge>
                </div>
              </TableCell>
              <TableCell>
                <div class="space-y-1">
                  <Progress
                    :model-value="usagePercent(subscription.aiUsed, planOf(subscription).aiQuota)"
                  />
                  <p class="text-xs text-muted-foreground">
                    {{ subscription.aiUsed }} / {{ planOf(subscription).aiQuota }} 次
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <div class="space-y-1">
                  <Progress
                    :model-value="
                      usagePercent(subscription.storageUsedMb, planOf(subscription).storageMb)
                    "
                  />
                  <p class="text-xs text-muted-foreground">
                    {{ storageLabel(subscription.storageUsedMb) }} /
                    {{ storageLabel(planOf(subscription).storageMb) }}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="subscription.active ? 'default' : 'secondary'">
                  {{ subscription.active ? '有效' : '已取消' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <Button
                  v-if="subscription.active"
                  variant="outline"
                  size="sm"
                  @click="cancelSubscription(subscription.id)"
                >
                  取消訂閱
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>

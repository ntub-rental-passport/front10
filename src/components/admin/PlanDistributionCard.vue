<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import PlanDistributionChart from './PlanDistributionChart.vue'
import type { PlanRole } from '@/src/utils/subscription-plans'
import type { PlanDistributionSegment } from '@/src/utils/admin-user-directory'

const props = defineProps<{
  segments: PlanDistributionSegment[]
  colors: string[]
  /** 目前生效的方案篩選，'all' 代表沒有篩選 */
  activePlan: string
}>()

const role = defineModel<PlanRole>({ default: 'landlord' })
const emit = defineEmits<{ select: [planKey: PlanDistributionSegment['planKey']] }>()
const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0))
const trialCount = computed(() => props.segments.reduce((sum, segment) => sum + segment.trialCount, 0))
</script>

<template>
  <Card class="h-full rounded-3xl border-border/70 bg-background/90 shadow-sm">
    <CardHeader class="p-5 pb-2">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex gap-1" role="group" aria-label="方案角色">
          <Button size="sm" :variant="role === 'landlord' ? 'secondary' : 'ghost'" :aria-pressed="role === 'landlord'" @click="role = 'landlord'">房東</Button>
          <Button size="sm" :variant="role === 'tenant' ? 'secondary' : 'ghost'" :aria-pressed="role === 'tenant'" @click="role = 'tenant'">租客</Button>
        </div>
        <CardTitle class="text-sm font-medium">訂閱方案分布</CardTitle>
      </div>
      <p class="text-xs text-muted-foreground">全部 {{ total }} 位{{ role === 'landlord' ? '房東' : '租客' }}，點方案可篩選</p>
      <p v-if="trialCount > 0" class="text-xs text-muted-foreground">其中 {{ trialCount }} 位試用中</p>
    </CardHeader>
    <CardContent class="px-5 pb-5">
      <!-- 高度壓到與旁邊的管理員人數卡接近，避免一高一矮看起來沒對齊 -->
      <PlanDistributionChart
        :role="role"
        :segments="segments"
        :colors="colors"
        :active-plan="activePlan"
        @select="emit('select', $event)"
      />
    </CardContent>
  </Card>
</template>

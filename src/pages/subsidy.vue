<script setup lang="ts">
import { ref } from 'vue'
import { PiggyBank, Clock, FileCheck } from 'lucide-vue-next'
import MenuCard from '@/src/components/subsidy/MenuCard.vue'
import StepIndicator from '@/src/components/subsidy/StepIndicator.vue'
import Step1 from '@/src/components/subsidy/Step1.vue'
import Step2 from '@/src/components/subsidy/Step2.vue'
import ApplicationForm from '@/src/components/subsidy/ApplicationForm.vue'
// 💡 已刪除不需再使用的 SectionTabs 引用
import { Card, CardContent } from '@/components/ui/card/index'

const step = ref(1)
</script>

<template>
  <div class="space-y-4 pb-20 md:pb-0">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MenuCard
        :icon="PiggyBank"
        title="補貼金額"
        description="每月最高補貼 6,000 元，依家庭狀況核定"
      />
      <MenuCard
        :icon="Clock"
        title="申請期限"
        description="每年 7-9 月開放申請，逾期不候"
        variant="highlight"
      />
      <MenuCard
        :icon="FileCheck"
        title="核定時程"
        description="申請後約 2-3 個月完成審核"
      />
    </div>

    <Card>
      <CardContent class="pt-6">
        <StepIndicator :current-step="step" :total-steps="3" />
        <Step1 v-if="step === 1" @next="step = 2" />
        <Step2 v-else-if="step === 2" @next="step = 3" @back="step = 1" />
        <ApplicationForm v-else @back="step = 2" />
      </CardContent>
    </Card>
  </div>
</template>

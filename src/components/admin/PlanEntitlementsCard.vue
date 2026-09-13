<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Switch } from '@/components/ui/switch/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { AlertTriangle, Info } from 'lucide-vue-next'
import { cloneFeatures, usePlanEntitlements } from '@/src/composables/admin/usePlanEntitlements'
import {
  PLAN_FEATURES,
  PLAN_FEATURE_KEYS,
  isMetered,
  type PlanFeatureKey,
} from '@/src/utils/admin-entitlements'
import type { SubscriptionPlan } from '@/src/mocks/admin/subscription'

const { plans, impactOf, describeChanges, savePlanFeatures } = usePlanEntitlements()

function snapshot(): SubscriptionPlan[] {
  return plans.value.map((plan) => ({ ...plan, features: cloneFeatures(plan.features) }))
}

const draft = ref<SubscriptionPlan[]>(snapshot())
const confirmOpen = ref(false)
const savedAt = ref<string | null>(null)

// 方案本身若被其他頁面改動（例如重新 seed），草稿要跟著換一份新的
watch(() => plans.value.length, () => { draft.value = snapshot() })

const changes = computed(() => describeChanges(draft.value))
const isDirty = computed(() => changes.value.length > 0)
const impacted = computed(() => impactOf(draft.value))

/**
 * 空字串代表無上限。
 *
 * 用留白表達「不限」比多一個核取方塊乾淨 —— 管理員想解除上限就把數字刪掉，
 * 而且欄位裡的 placeholder 會直接寫著「無上限」，不需要另外解釋。
 */
function limitModel(plan: SubscriptionPlan, key: PlanFeatureKey): string {
  const limit = plan.features[key].limit
  return limit === null ? '' : String(limit)
}

function setLimit(plan: SubscriptionPlan, key: PlanFeatureKey, raw: string): void {
  const trimmed = raw.trim()
  if (trimmed === '') {
    plan.features[key].limit = null
    return
  }
  const value = Number(trimmed)
  // 負數與非數字一律當成沒填，避免把不合法的值存進去
  plan.features[key].limit = Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

function resetDraft(): void {
  draft.value = snapshot()
}

function confirmSave(): void {
  savePlanFeatures(draft.value)
  draft.value = snapshot()
  confirmOpen.value = false
  savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
}
</script>

<template>
  <Card class="rounded-3xl">
    <CardHeader>
      <CardTitle>方案權益</CardTitle>
      <CardDescription>
        各方案能使用哪些功能與各自的額度。留白代表無上限；關閉的功能使用者端會看到升級提示。
      </CardDescription>
    </CardHeader>

    <CardContent class="space-y-4">
      <div class="flex gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <Info class="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p class="font-medium">這裡的調整目前只影響後台的判定</p>
          <p class="mt-1 text-muted-foreground">
            使用者端尚未接上這份權益設定，關閉功能不會真的把前台擋住。
            後端接好之後，同一份規則就能兩邊共用。
          </p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="min-w-36">功能</TableHead>
              <TableHead v-for="plan in draft" :key="plan.id" class="min-w-32">
                <div class="space-y-0.5">
                  <p>{{ plan.name }}</p>
                  <p class="text-xs font-normal text-muted-foreground">{{ plan.priceLabel }}</p>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="key in PLAN_FEATURE_KEYS" :key="key">
              <TableCell class="align-top">
                <p class="font-medium">{{ PLAN_FEATURES[key].label }}</p>
                <p v-if="PLAN_FEATURES[key].unit" class="text-xs text-muted-foreground">
                  {{ PLAN_FEATURES[key].unit }}
                </p>
                <p v-else class="text-xs text-muted-foreground">僅開關</p>
              </TableCell>

              <TableCell v-for="plan in draft" :key="plan.id" class="align-top">
                <div class="flex items-center gap-3">
                  <Switch v-model="plan.features[key].enabled" />
                  <Input
                    v-if="isMetered(key) && plan.features[key].enabled"
                    class="h-8 w-20"
                    type="number"
                    min="0"
                    placeholder="無上限"
                    :model-value="limitModel(plan, key)"
                    @update:model-value="setLimit(plan, key, String($event))"
                  />
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-3">
        <Badge v-if="isDirty && impacted > 0" variant="destructive">
          {{ impacted }} 位使用者將立即超額
        </Badge>
        <p v-if="savedAt" class="text-sm text-muted-foreground">已於 {{ savedAt }} 儲存</p>
        <Button variant="outline" :disabled="!isDirty" @click="resetDraft">還原變更</Button>
        <Button :disabled="!isDirty" @click="confirmOpen = true">儲存權益</Button>
      </div>
    </CardContent>

    <Dialog v-model:open="confirmOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認調整方案權益？</DialogTitle>
          <DialogDescription>調整立即生效，不影響已經完成的操作。</DialogDescription>
        </DialogHeader>

        <div
          v-if="impacted > 0"
          class="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <AlertTriangle class="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p class="font-medium text-destructive">
              此調整將使 {{ impacted }} 位使用者本期立即超額
            </p>
            <p class="mt-1 text-muted-foreground">
              他們目前的用量已超過新的上限，本期無法再使用該功能。
              若要個別放行，可在使用者詳情頁加購單次額度。
            </p>
          </div>
        </div>

        <div class="max-h-56 space-y-1 overflow-y-auto text-sm">
          <p class="font-medium">這次會變更：</p>
          <p v-for="change in changes" :key="change" class="text-muted-foreground">
            · {{ change }}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="confirmOpen = false">取消</Button>
          <Button @click="confirmSave">確認調整</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
</template>

<script setup lang="ts">
/**
 * 系統監控頁的功能維護開關。
 *
 * 這裡關的是「功能故障時對所有使用者暫停」，跟方案權益（PlanEntitlementsCard，
 * 哪個方案能用哪些功能）是兩回事，不共用開關也不共用文案——見卡片說明文字。
 */
import { computed, reactive, ref } from 'vue'
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
import { Label } from '@/components/ui/label/index'
import { Textarea } from '@/components/ui/textarea/index'
import { AlertTriangle } from 'lucide-vue-next'
import { useAdminFeatureOutages } from '@/src/composables/admin/useAdminFeatureOutages'
import { useTickingNow } from '@/src/composables/useTickingNow'
import { PLAN_FEATURES, PLAN_FEATURE_KEYS, type PlanFeatureKey } from '@/src/utils/admin-entitlements'
import {
  DEFAULT_PUBLIC_NOTE,
  isEtaPassed,
  outageDurationLabel,
  outageOf,
  publicEtaAt,
  publicNoteOf,
} from '@/src/utils/admin-feature-status'
import { formatDateTime } from '@/src/utils/admin-format'

const { outages, closeFeature, reopenFeature } = useAdminFeatureOutages()

// 「已關閉多久」與「預計時間過了沒」都跟現在幾點有關，見 useTickingNow 註解
const now = useTickingNow()

const dialogOpen = ref(false)
const dialogKey = ref<PlanFeatureKey | null>(null)
/** 對已經關閉的功能再開對話框是「更新」而不是「關閉」，標題與按鈕都要跟著換 */
const dialogIsUpdate = ref(false)

interface DraftState {
  internalReason: string
  publicNote: string
  etaAtLocal: string
}

const draft = reactive<DraftState>({ internalReason: '', publicNote: '', etaAtLocal: '' })

/** ISO 轉 datetime-local 需要的本地時間字串；直接切 ISO 會差一個時區 */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function openDialog(key: PlanFeatureKey): void {
  const existing = outageOf(outages.value, key)
  dialogKey.value = key
  dialogIsUpdate.value = existing !== null
  // 更新時帶入原本填過的內容，否則管理員只想改個時間卻要把原因重打一次
  draft.internalReason = existing?.internalReason ?? ''
  draft.publicNote = existing?.publicNote ?? ''
  draft.etaAtLocal = toLocalInput(existing?.etaAt ?? null)
  dialogOpen.value = true
}

const canConfirm = computed(() => draft.internalReason.trim() !== '')

function confirmClose(): void {
  if (!dialogKey.value || !canConfirm.value) return
  const etaAt = draft.etaAtLocal === '' ? null : new Date(draft.etaAtLocal).toISOString()
  closeFeature(dialogKey.value, draft.internalReason, draft.publicNote, etaAt)
  dialogOpen.value = false
  dialogKey.value = null
}

interface RowView {
  key: PlanFeatureKey
  label: string
  closed: boolean
  durationLabel: string
  publicNote: string
  etaLabel: string | null
  etaExpired: boolean
}

/** 每列要顯示的資料算成一個 view model，避免模板裡對同一筆 outage 重複查找、重複算時長。 */
const rows = computed<RowView[]>(() =>
  PLAN_FEATURE_KEYS.map((key) => {
    const outage = outageOf(outages.value, key)
    if (!outage) {
      return {
        key,
        label: PLAN_FEATURES[key].label,
        closed: false,
        durationLabel: '',
        publicNote: '',
        etaLabel: null,
        etaExpired: false,
      }
    }

    const eta = publicEtaAt(outage, now.value)
    return {
      key,
      label: PLAN_FEATURES[key].label,
      closed: true,
      durationLabel: outageDurationLabel(outage, now.value),
      publicNote: publicNoteOf(outage),
      etaLabel: eta ? formatDateTime(eta) : null,
      etaExpired: isEtaPassed(outage, now.value),
    }
  }),
)
</script>

<template>
  <Card class="rounded-3xl">
    <CardHeader>
      <CardTitle>功能開關</CardTitle>
      <CardDescription>
        功能發生故障時，在這裡暫停該功能給「所有使用者」使用；這與方案權益
        （哪個方案能用哪些功能）是兩回事——權益關閉是「升級即可使用」，
        這裡的關閉是「維護中，預計恢復」，兩者不共用開關也不共用文案。
      </CardDescription>
    </CardHeader>

    <CardContent class="space-y-3">
      <div
        v-for="row in rows"
        :key="row.key"
        class="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-medium">{{ row.label }}</p>
            <Badge :variant="row.closed ? 'destructive' : 'secondary'">
              {{ row.closed ? '維護中' : '正常' }}
            </Badge>
          </div>

          <template v-if="row.closed">
            <p class="text-sm text-muted-foreground">已關閉 {{ row.durationLabel }}</p>
            <p class="text-sm text-muted-foreground">對外說明：{{ row.publicNote }}</p>
            <p v-if="row.etaExpired" class="flex items-center gap-1 text-sm text-destructive">
              <AlertTriangle class="h-3.5 w-3.5" aria-hidden="true" />
              恢復時間待更新
            </p>
            <p v-else-if="row.etaLabel" class="text-sm text-muted-foreground">
              預計恢復：{{ row.etaLabel }}
            </p>
          </template>
        </div>

        <div class="flex shrink-0 gap-2">
          <template v-if="row.closed">
            <Button variant="outline" @click="openDialog(row.key)">更新</Button>
            <Button @click="reopenFeature(row.key)">恢復</Button>
          </template>
          <Button v-else variant="outline" @click="openDialog(row.key)">關閉功能</Button>
        </div>
      </div>
    </CardContent>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {{ dialogIsUpdate ? '更新' : '關閉' }}「{{ dialogKey ? PLAN_FEATURES[dialogKey].label : '' }}」
          </DialogTitle>
          <DialogDescription>
            {{
              dialogIsUpdate
                ? '修改維護說明或預計恢復時間，不影響已關閉的時間長度。'
                : '關閉後，所有使用者都無法使用這項功能，直到手動恢復。'
            }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="outage-reason">內部原因</Label>
            <Textarea id="outage-reason" v-model="draft.internalReason" rows="2" placeholder="例如：契約分析 API 金鑰過期" />
            <p class="text-xs text-muted-foreground">只有管理員看得到，不會顯示給使用者。</p>
          </div>

          <div class="space-y-2">
            <Label for="outage-public-note">對外說明（選填）</Label>
            <Textarea id="outage-public-note" v-model="draft.publicNote" rows="2" :placeholder="DEFAULT_PUBLIC_NOTE" />
            <p class="text-xs text-muted-foreground">留白就會顯示這句：「{{ DEFAULT_PUBLIC_NOTE }}」</p>
          </div>

          <div class="space-y-2">
            <Label for="outage-eta">預計恢復時間（選填）</Label>
            <Input id="outage-eta" v-model="draft.etaAtLocal" type="datetime-local" />
            <p class="text-xs text-muted-foreground">僅供顯示，時間到不會自動恢復。</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canConfirm" @click="confirmClose">
            {{ dialogIsUpdate ? '確認更新' : '確認關閉' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
</template>

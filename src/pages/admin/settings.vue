<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button/index'
import { Card } from '@/components/ui/card/index'
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
import { Switch } from '@/components/ui/switch/index'
import { Textarea } from '@/components/ui/textarea/index'
import { AlertTriangle, Info, RotateCcw, ShieldAlert, ShieldOff } from 'lucide-vue-next'
import PlanEntitlementsCard from '@/src/components/admin/PlanEntitlementsCard.vue'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { resetAdminData } from '@/src/composables/admin/useAdminStore'
import { validateSettings } from '@/src/utils/settings-validate'
import { isMaintenanceActive } from '@/src/utils/maintenance'
import type { SystemSettings } from '@/src/mocks/admin/settings'

const { settings, saveSettings } = useAdminSettings()
const { logAction } = useAdminAudit()

const draft = ref<SystemSettings>({ ...settings.value })
const confirmOpen = ref(false)
const resetOpen = ref(false)
const savedAt = ref<string | null>(null)

const errors = computed(() => validateSettings(draft.value))
const hasErrors = computed(() => Object.keys(errors.value).length > 0)

const isDirty = computed(() =>
  (Object.keys(draft.value) as (keyof SystemSettings)[]).some(
    (key) => draft.value[key] !== settings.value[key],
  ),
)

const turningOnMaintenance = computed(
  () => draft.value.maintenanceMode && !settings.value.maintenanceMode,
)

// 開關打開不代表此刻生效：排程可能還沒到，或已經結束
const maintenanceStatusText = computed(() => {
  if (!draft.value.maintenanceMode) return '已關閉：平台正常運作'
  return isMaintenanceActive(draft.value)
    ? '已開啟且此刻生效：使用者會看到維護頁'
    : '已開啟，但依排程此刻尚未生效'
})

function confirmSave(): void {
  saveSettings(draft.value)
  confirmOpen.value = false
  savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
}

function resetDraft(): void {
  draft.value = { ...settings.value }
}

/**
 * 緊急出口：不經確認對話框，直接關閉維護模式並清掉排程。
 * 維護中誤設排程時，多一道確認就多一次點錯的機會。
 */
function liftMaintenanceNow(): void {
  const next: SystemSettings = {
    ...settings.value,
    maintenanceMode: false,
    maintenanceStartsAt: '',
    maintenanceEndsAt: '',
  }
  saveSettings(next)
  draft.value = { ...next }
  savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
}

/**
 * 重置會讓 settings collection 在背後整份換掉，草稿卻不會自動跟著換 ——
 * 不同步回來的話，畫面會誤以為「有未儲存的變更」，一存又把剛重置好的值蓋掉。
 */
function confirmReset(): void {
  resetAdminData()
  logAction('系統', '示範資料', '重置所有後台示範資料')
  draft.value = { ...settings.value }
  resetOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">系統設定</h1>
      <p class="mt-1 text-muted-foreground">
        調整安全性、稽核與監控門檻等平台設定，以及維護模式與示範資料重置。
      </p>
    </div>

    <!--
      每張卡統一用左右分欄：左欄（約 1/3）放區塊標題與描述，右欄（約 2/3）放欄位本身。
      欄位下方原本各自一行的說明文字保留在右欄，只是不必再重複區塊層級已經講過的事，可以排得緊湊一點。
      md 以下沒有 md:grid-cols-3，會自然疊成單欄，左欄（標題描述）先出現在右欄（欄位）上方。
    -->

    <!-- 一般設定：改了會即時生效，但不影響其他使用者能不能用平台 -->
    <div class="space-y-6">
      <Card class="rounded-3xl">
        <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
          <div class="md:col-span-1">
            <h3 class="text-lg font-semibold leading-none tracking-tight">安全性設定</h3>
            <p class="mt-2 text-sm text-muted-foreground">登入保護與 Session 有效期限。</p>
          </div>
          <div class="space-y-4 md:col-span-3">
            <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="loginMaxAttempts">登入失敗鎖定次數（次）</Label>
                <Input
                  id="loginMaxAttempts"
                  v-model.number="draft.loginMaxAttempts"
                  type="number"
                  class="max-w-[9rem]"
                  min="1"
                  max="20"
                />
                <p v-if="errors.loginMaxAttempts" class="text-sm text-destructive">
                  {{ errors.loginMaxAttempts }}
                </p>
                <p class="text-xs text-muted-foreground">連續輸入錯誤密碼達此次數即鎖定帳號。</p>
              </div>
              <div class="space-y-2">
                <Label for="loginLockoutMinutes">鎖定時間（分鐘）</Label>
                <Input
                  id="loginLockoutMinutes"
                  v-model.number="draft.loginLockoutMinutes"
                  type="number"
                  class="max-w-[9rem]"
                  min="1"
                  max="1440"
                />
                <p v-if="errors.loginLockoutMinutes" class="text-sm text-destructive">
                  {{ errors.loginLockoutMinutes }}
                </p>
                <p class="text-xs text-muted-foreground">帳號被鎖定後，需等待這麼久才能再次嘗試登入。</p>
              </div>
              <div class="space-y-2">
                <Label for="sessionTimeoutMinutes">Session 有效時間（分鐘）</Label>
                <Input
                  id="sessionTimeoutMinutes"
                  v-model.number="draft.sessionTimeoutMinutes"
                  type="number"
                  class="max-w-[9rem]"
                  min="5"
                  max="10080"
                />
                <p v-if="errors.sessionTimeoutMinutes" class="text-sm text-destructive">
                  {{ errors.sessionTimeoutMinutes }}
                </p>
                <p class="text-xs text-muted-foreground">從登入時起算，超過這個時間未操作會被登出。</p>
              </div>
              <div class="space-y-2">
                <Label for="passwordMinLength">密碼最短長度（字元）</Label>
                <Input
                  id="passwordMinLength"
                  v-model.number="draft.passwordMinLength"
                  type="number"
                  class="max-w-[9rem]"
                  min="6"
                  max="64"
                />
                <p v-if="errors.passwordMinLength" class="text-sm text-destructive">
                  {{ errors.passwordMinLength }}
                </p>
                <p class="text-xs text-muted-foreground">新密碼與變更密碼時的最短長度限制。</p>
              </div>
            </div>

            <div class="flex gap-3 rounded-2xl border bg-muted/20 p-4 text-sm">
              <Info class="h-5 w-5 shrink-0 text-muted-foreground" />
              <div class="space-y-1 text-muted-foreground">
                <p>
                  <span class="font-medium text-foreground">密碼長度</span>與
                  <span class="font-medium text-foreground">Session 有效時間</span>
                  目前會實際生效。
                </p>
                <p>
                  <span class="font-medium text-foreground">登入失敗鎖定</span>
                  目前只在前端計數，清除瀏覽器資料即可繞過。接上後端驗證後才是真正的鎖定。
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card class="rounded-3xl">
        <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
          <div class="md:col-span-1">
            <h3 class="text-lg font-semibold leading-none tracking-tight">稽核與提醒門檻</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              稽核紀錄的顯示範圍，以及工單與訂閱到期的提醒門檻。
            </p>
          </div>
          <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 md:col-span-3">
            <div class="space-y-2">
              <Label for="auditRetentionDays">稽核紀錄保留天數（天）</Label>
              <Input id="auditRetentionDays" v-model.number="draft.auditRetentionDays" type="number" />
              <p v-if="errors.auditRetentionDays" class="text-sm text-destructive">
                {{ errors.auditRetentionDays }}
              </p>
              <p class="text-xs text-muted-foreground">
                稽核紀錄查詢頁只會顯示這個天數以內的紀錄；設為 0 或負數代表不限制、永久顯示。
                原始紀錄不會被刪除，只是超過天數的不再顯示。
              </p>
            </div>
            <div class="space-y-2">
              <Label for="maintenanceOverdueDays">報修逾期提醒門檻（天）</Label>
              <Input
                id="maintenanceOverdueDays"
                v-model.number="draft.maintenanceOverdueDays"
                type="number"
                class="max-w-[9rem]"
                min="1"
                max="90"
              />
              <p v-if="errors.maintenanceOverdueDays" class="text-sm text-destructive">
                {{ errors.maintenanceOverdueDays }}
              </p>
              <p class="text-xs text-muted-foreground">
                工單「已通報房東」超過這個天數仍未有進度，工單列表會特別標示提醒你留意（不會自動改變工單狀態）。
              </p>
            </div>
            <div class="space-y-2">
              <Label for="subscriptionExpiringSoonDays">訂閱到期提醒天數（天）</Label>
              <Input
                id="subscriptionExpiringSoonDays"
                v-model.number="draft.subscriptionExpiringSoonDays"
                type="number"
                class="max-w-[9rem]"
                min="1"
                max="90"
              />
              <p v-if="errors.subscriptionExpiringSoonDays" class="text-sm text-destructive">
                {{ errors.subscriptionExpiringSoonDays }}
              </p>
              <p class="text-xs text-muted-foreground">
                到期前這麼多天內，使用者列表會標示「訂閱即將到期」的警示。
              </p>
            </div>
          </div>
        </div>
      </Card>

      <PlanEntitlementsCard />

      <Card class="rounded-3xl">
        <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
          <div class="md:col-span-1">
            <h3 class="text-lg font-semibold leading-none tracking-tight">AI 平台額度</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              平台向 AI 廠商購買的每月額度與預警門檻，用於 AI 使用量頁的告急判定。
              這是成本側的總量，與上方「方案權益」裡單一使用者能用幾次是兩回事。
            </p>
          </div>
          <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 md:col-span-3">
            <div class="space-y-2">
              <Label for="platformGeminiTokenQuota">Gemini 每月 token 上限</Label>
              <Input
                id="platformGeminiTokenQuota"
                v-model.number="draft.platformGeminiTokenQuota"
                type="number"
                class="max-w-[9rem]"
                min="0"
              />
              <p v-if="errors.platformGeminiTokenQuota" class="text-sm text-destructive">
                {{ errors.platformGeminiTokenQuota }}
              </p>
              <p class="text-xs text-muted-foreground">用量超過這個上限，AI 使用量頁會顯示額度已用盡。</p>
            </div>
            <div class="space-y-2">
              <Label for="platformVisionPageQuota">Vision 每月頁數上限（頁）</Label>
              <Input
                id="platformVisionPageQuota"
                v-model.number="draft.platformVisionPageQuota"
                type="number"
                class="max-w-[9rem]"
                min="0"
              />
              <p v-if="errors.platformVisionPageQuota" class="text-sm text-destructive">
                {{ errors.platformVisionPageQuota }}
              </p>
              <p class="text-xs text-muted-foreground">同上，但用於 Vision 頁數的每月上限。</p>
            </div>
            <div class="space-y-2">
              <Label for="quotaWarnPercent">預警門檻（%）</Label>
              <Input
                id="quotaWarnPercent"
                v-model.number="draft.quotaWarnPercent"
                type="number"
                class="max-w-[9rem]"
                min="1"
                max="100"
              />
              <p v-if="errors.quotaWarnPercent" class="text-sm text-destructive">
                {{ errors.quotaWarnPercent }}
              </p>
              <p class="text-xs text-muted-foreground">用量達此比例時，AI 使用量頁標示為「預警」。</p>
            </div>
            <div class="space-y-2">
              <Label for="quotaCriticalPercent">告急門檻（%）</Label>
              <Input
                id="quotaCriticalPercent"
                v-model.number="draft.quotaCriticalPercent"
                type="number"
                class="max-w-[9rem]"
                min="1"
                max="100"
              />
              <p v-if="errors.quotaCriticalPercent" class="text-sm text-destructive">
                {{ errors.quotaCriticalPercent }}
              </p>
              <p class="text-xs text-muted-foreground">用量達此比例時，AI 使用量頁標示為「告急」。</p>
            </div>
            <div class="space-y-2">
              <Label for="aiQuotaCriticalDays">剩餘天數告急門檻（天）</Label>
              <Input
                id="aiQuotaCriticalDays"
                v-model.number="draft.aiQuotaCriticalDays"
                type="number"
                class="max-w-[9rem]"
                min="1"
                max="30"
              />
              <p v-if="errors.aiQuotaCriticalDays" class="text-sm text-destructive">
                {{ errors.aiQuotaCriticalDays }}
              </p>
              <p class="text-xs text-muted-foreground">
                依用量消耗速度推算，剩餘可用天數低於此值時，AI 使用量頁一律標示「告急」，不必等百分比達標。
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card class="rounded-3xl">
        <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
          <div class="md:col-span-1">
            <h3 class="text-lg font-semibold leading-none tracking-tight">系統監控門檻</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              後端服務回應時間的分級門檻，用於系統監控頁：低於正常門檻算正常，
              介於兩者之間算緩慢，達到變慢門檻算無回應。健康檢查逾時為 5 秒，
              超過這個時間就量不到，門檻設超過 5000 毫秒不會生效。
            </p>
          </div>
          <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2 md:col-span-3">
            <div class="space-y-2">
              <Label for="responseOkMs">正常門檻（毫秒）</Label>
              <Input
                id="responseOkMs"
                v-model.number="draft.responseOkMs"
                type="number"
                class="max-w-[9rem]"
                min="50"
                max="5000"
              />
              <p v-if="errors.responseOkMs" class="text-sm text-destructive">
                {{ errors.responseOkMs }}
              </p>
              <p class="text-xs text-muted-foreground">回應時間低於此值，判定為「正常」。</p>
            </div>
            <div class="space-y-2">
              <Label for="responseDegradedMs">變慢門檻（毫秒）</Label>
              <Input
                id="responseDegradedMs"
                v-model.number="draft.responseDegradedMs"
                type="number"
                class="max-w-[9rem]"
                min="50"
                max="5000"
              />
              <p v-if="errors.responseDegradedMs" class="text-sm text-destructive">
                {{ errors.responseDegradedMs }}
              </p>
              <p class="text-xs text-muted-foreground">
                回應時間達到此值，判定為「無回應」；必須大於正常門檻。
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!--
      危險區：跟一般設定分開放，並用 destructive 邊框框起來 ——
      這裡的操作（開維護模式、重置示範資料）會立即影響所有使用者，要讓人一眼看出跟上面不一樣。
    -->
    <section class="space-y-4 rounded-3xl border border-destructive/40 bg-destructive/5 p-5">
      <div class="flex items-start gap-3">
        <ShieldAlert class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <h2 class="text-lg font-bold text-destructive">危險區</h2>
          <p class="text-sm text-muted-foreground">
            以下操作會立即影響所有使用者，其中重置示範資料無法復原，請確認後再執行。
          </p>
        </div>
      </div>

      <Card class="rounded-2xl border-destructive/20">
        <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
          <div class="md:col-span-1">
            <h3 class="text-lg font-semibold leading-none tracking-tight">系統維護</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              開啟後，一般使用者會看到維護頁。管理後台與內部人員登入頁（/staff-login）不受影響。
            </p>
            <Button
              v-if="settings.maintenanceMode"
              variant="destructive"
              class="mt-4"
              @click="liftMaintenanceNow"
            >
              <ShieldOff class="mr-1 h-4 w-4" />
              立即解除維護
            </Button>
          </div>

          <div class="space-y-6 md:col-span-3">
            <!-- 上段：維護狀態 —— 決定「什麼時候擋人」，屬於危險操作 -->
            <div class="space-y-4">
              <h4 class="text-sm font-semibold text-muted-foreground">維護狀態</h4>

              <div class="flex gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
                <Info class="h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p class="font-medium">這項設定目前只存在你這個瀏覽器</p>
                  <p class="mt-1 text-muted-foreground">
                    維護狀態尚未接後端，因此
                    <code class="rounded bg-muted px-1">localhost</code> 與
                    <code class="rounded bg-muted px-1">127.0.0.1</code>
                    會各有一份、互不同步。在其中一邊關閉，另一邊仍可能是開啟的。
                  </p>
                </div>
              </div>

              <div class="flex items-center justify-between rounded-2xl border bg-muted/20 p-4">
                <div>
                  <p class="font-medium">維護模式</p>
                  <p class="text-sm text-muted-foreground">
                    {{ maintenanceStatusText }}
                  </p>
                </div>
                <Switch v-model="draft.maintenanceMode" />
              </div>

              <div v-if="draft.maintenanceMode" class="space-y-4">
                <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div class="space-y-2">
                    <Label for="maintenanceStartsAt">開始時間（選填）</Label>
                    <Input
                      id="maintenanceStartsAt"
                      v-model="draft.maintenanceStartsAt"
                      type="datetime-local"
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="maintenanceEndsAt">結束時間（選填）</Label>
                    <Input
                      id="maintenanceEndsAt"
                      v-model="draft.maintenanceEndsAt"
                      type="datetime-local"
                    />
                    <p v-if="errors.maintenanceEndsAt" class="text-sm text-destructive">
                      {{ errors.maintenanceEndsAt }}
                    </p>
                  </div>
                </div>
                <p class="text-sm text-muted-foreground">
                  兩者留空代表開啟後持續生效，直到你手動關閉。
                </p>

                <div class="space-y-2">
                  <Label for="maintenanceAllowlist">白名單 Email（一行一個）</Label>
                  <Textarea
                    id="maintenanceAllowlist"
                    v-model="draft.maintenanceAllowlist"
                    rows="3"
                    placeholder="admin@rentmate.tw"
                  />
                  <p v-if="errors.maintenanceAllowlist" class="text-sm text-destructive">
                    {{ errors.maintenanceAllowlist }}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    名單內的帳號在維護期間仍可正常使用平台，方便上線前驗證。
                  </p>
                </div>
              </div>
            </div>

            <!-- 下段：維護頁文案 —— 決定「擋住之後那頁長怎樣」，跟開關現在是否開啟無關，可以隨時先準備好 -->
            <div class="space-y-4 border-t pt-6">
              <h4 class="text-sm font-semibold text-muted-foreground">維護頁文案</h4>

              <div class="space-y-2">
                <Label for="siteName">網站名稱</Label>
                <Input id="siteName" v-model="draft.siteName" />
                <p v-if="errors.siteName" class="text-sm text-destructive">{{ errors.siteName }}</p>
                <p class="text-xs text-muted-foreground">顯示於維護頁標題，例如「{{ draft.siteName || '網站名稱' }} 維護中」。</p>
              </div>

              <div class="space-y-2">
                <Label for="maintenanceMessage">維護說明文字</Label>
                <Textarea id="maintenanceMessage" v-model="draft.maintenanceMessage" rows="3" />
                <p v-if="errors.maintenanceMessage" class="text-sm text-destructive">
                  {{ errors.maintenanceMessage }}
                </p>
                <p class="text-xs text-muted-foreground">開啟維護模式時，維護頁會顯示這段文字。</p>
              </div>

              <div class="space-y-2">
                <Label for="supportEmail">客服信箱</Label>
                <Input id="supportEmail" v-model="draft.supportEmail" type="email" />
                <p v-if="errors.supportEmail" class="text-sm text-destructive">{{ errors.supportEmail }}</p>
                <p class="text-xs text-muted-foreground">維護頁會顯示這個信箱，讓被擋在外面的使用者知道找誰求助。</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card class="rounded-2xl border-destructive/20">
        <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
          <div class="md:col-span-1">
            <h3 class="text-lg font-semibold leading-none tracking-tight">重置示範資料</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              把所有後台模組（使用者、工單、押金、設定…）復原成初始的示範狀態。
            </p>
          </div>
          <div class="md:col-span-3">
            <Button variant="destructive" @click="resetOpen = true">
              <RotateCcw class="mr-1 h-4 w-4" />
              重置示範資料
            </Button>
          </div>
        </div>
      </Card>
    </section>

    <div class="flex items-center justify-end gap-3">
      <p v-if="savedAt" class="text-sm text-muted-foreground">已於 {{ savedAt }} 儲存</p>
      <Button variant="outline" :disabled="!isDirty" @click="resetDraft">還原變更</Button>
      <Button :disabled="!isDirty || hasErrors" @click="confirmOpen = true">儲存變更</Button>
    </div>

    <Dialog v-model:open="confirmOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認儲存設定？</DialogTitle>
          <DialogDescription>變更會立即生效。</DialogDescription>
        </DialogHeader>

        <div
          v-if="turningOnMaintenance"
          class="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <AlertTriangle class="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p class="font-medium text-destructive">你正要開啟維護模式</p>
            <p class="mt-1 text-muted-foreground">
              一般使用者將被導向維護頁面。管理後台（/admin）不受影響，你可以隨時回到這裡關閉。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="confirmOpen = false">取消</Button>
          <Button @click="confirmSave">確認儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="resetOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置示範資料</DialogTitle>
          <DialogDescription>
            所有後台模組會回到初始的示範狀態，包含使用者、工單、押金與設定。此操作無法復原。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="resetOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmReset">確認重置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

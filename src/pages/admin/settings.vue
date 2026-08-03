<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { Switch } from '@/components/ui/switch/index'
import { Textarea } from '@/components/ui/textarea/index'
import { AlertTriangle } from 'lucide-vue-next'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { validateSettings } from '@/src/utils/settings-validate'
import type { SystemSettings } from '@/src/mocks/admin/settings'

const { settings, saveSettings } = useAdminSettings()

const draft = ref<SystemSettings>({ ...settings.value })
const confirmOpen = ref(false)
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

function confirmSave(): void {
  saveSettings(draft.value)
  confirmOpen.value = false
  savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
}

function resetDraft(): void {
  draft.value = { ...settings.value }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">系統設定</h1>
      <p class="mt-1 text-muted-foreground">調整平台的基本資訊、維護狀態與使用限制。</p>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>基本資訊</CardTitle>
        <CardDescription>顯示於平台各處的識別資訊。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="siteName">網站名稱</Label>
          <Input id="siteName" v-model="draft.siteName" />
          <p v-if="errors.siteName" class="text-sm text-destructive">{{ errors.siteName }}</p>
        </div>
        <div class="space-y-2">
          <Label for="supportEmail">客服信箱</Label>
          <Input id="supportEmail" v-model="draft.supportEmail" type="email" />
          <p v-if="errors.supportEmail" class="text-sm text-destructive">{{ errors.supportEmail }}</p>
        </div>
      </CardContent>
    </Card>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>系統維護</CardTitle>
        <CardDescription>開啟後，一般使用者將無法使用平台，管理後台不受影響。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between rounded-2xl border bg-muted/20 p-4">
          <div>
            <p class="font-medium">維護模式</p>
            <p class="text-sm text-muted-foreground">
              {{ draft.maintenanceMode ? '已開啟：使用者會看到維護頁' : '已關閉：平台正常運作' }}
            </p>
          </div>
          <Switch v-model="draft.maintenanceMode" />
        </div>

        <div v-if="draft.maintenanceMode" class="space-y-2">
          <Label for="maintenanceMessage">維護說明文字</Label>
          <Textarea id="maintenanceMessage" v-model="draft.maintenanceMessage" rows="3" />
          <p v-if="errors.maintenanceMessage" class="text-sm text-destructive">
            {{ errors.maintenanceMessage }}
          </p>
        </div>
      </CardContent>
    </Card>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>使用限制</CardTitle>
        <CardDescription>影響資料呈現與檔案上傳的預設值。</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-3">
        <div class="space-y-2">
          <Label for="pageSize">表格每頁筆數</Label>
          <Input id="pageSize" v-model.number="draft.pageSize" type="number" min="1" max="100" />
          <p v-if="errors.pageSize" class="text-sm text-destructive">{{ errors.pageSize }}</p>
        </div>
        <div class="space-y-2">
          <Label for="maxUploadMb">上傳上限（MB）</Label>
          <Input id="maxUploadMb" v-model.number="draft.maxUploadMb" type="number" min="1" max="50" />
          <p v-if="errors.maxUploadMb" class="text-sm text-destructive">{{ errors.maxUploadMb }}</p>
        </div>
        <div class="space-y-2">
          <Label for="defaultAiQuota">AI 每日配額預設值</Label>
          <Input id="defaultAiQuota" v-model.number="draft.defaultAiQuota" type="number" min="0" />
          <p v-if="errors.defaultAiQuota" class="text-sm text-destructive">
            {{ errors.defaultAiQuota }}
          </p>
        </div>
      </CardContent>
    </Card>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>AI 平台額度</CardTitle>
        <CardDescription>
          平台向 AI 廠商購買的每月額度與預警門檻，用於 AI 使用量頁的告急判定。
          與上方「AI 每日配額預設值」（單一使用者的額度）無關。
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="platformGeminiTokenQuota">Gemini 每月 token 上限</Label>
          <Input
            id="platformGeminiTokenQuota"
            v-model.number="draft.platformGeminiTokenQuota"
            type="number"
            min="0"
          />
          <p v-if="errors.platformGeminiTokenQuota" class="text-sm text-destructive">
            {{ errors.platformGeminiTokenQuota }}
          </p>
        </div>
        <div class="space-y-2">
          <Label for="platformVisionPageQuota">Vision 每月頁數上限</Label>
          <Input
            id="platformVisionPageQuota"
            v-model.number="draft.platformVisionPageQuota"
            type="number"
            min="0"
          />
          <p v-if="errors.platformVisionPageQuota" class="text-sm text-destructive">
            {{ errors.platformVisionPageQuota }}
          </p>
        </div>
        <div class="space-y-2">
          <Label for="quotaWarnPercent">預警門檻（%）</Label>
          <Input
            id="quotaWarnPercent"
            v-model.number="draft.quotaWarnPercent"
            type="number"
            min="1"
            max="100"
          />
          <p v-if="errors.quotaWarnPercent" class="text-sm text-destructive">
            {{ errors.quotaWarnPercent }}
          </p>
        </div>
        <div class="space-y-2">
          <Label for="quotaCriticalPercent">告急門檻（%）</Label>
          <Input
            id="quotaCriticalPercent"
            v-model.number="draft.quotaCriticalPercent"
            type="number"
            min="1"
            max="100"
          />
          <p v-if="errors.quotaCriticalPercent" class="text-sm text-destructive">
            {{ errors.quotaCriticalPercent }}
          </p>
        </div>
      </CardContent>
    </Card>

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
  </div>
</template>

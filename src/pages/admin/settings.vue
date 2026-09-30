<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { Switch } from '@/components/ui/switch/index'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import { Textarea } from '@/components/ui/textarea/index'
import {
  AlertTriangle,
  Cloud,
  Eye,
  RotateCcw,
  ShieldAlert,
  ShieldOff,
  Undo2,
} from 'lucide-vue-next'
import ActionError from '@/src/components/admin/ActionError.vue'
import MaintenancePreview from '@/src/components/admin/MaintenancePreview.vue'
import SettingsSaveBar from '@/src/components/admin/SettingsSaveBar.vue'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/src/components/admin/admin-tabs'
import { loadAdminSettings, useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { adminMaintenanceCollection } from '@/src/composables/admin/useAdminMaintenance'
import { adminSubscriptionCollection } from '@/src/composables/admin/useAdminSubscription'
import { quotaLevelLabels, useAdminAiUsage } from '@/src/composables/admin/useAdminAiUsage'
import { useSystemHealth } from '@/src/composables/admin/useSystemHealth'
import { resetAdminData } from '@/src/composables/admin/useAdminStore'
import { seedSettings, type SystemSettings } from '@/src/mocks/admin/settings'
import { fetchAdminAccounts, type AdminAccount } from '@/src/services/adminUsersApi'
import {
  fetchAdminPlatformSettings,
  updateAdminPlatformSettings,
  type AdminPlatformSettings,
} from '@/src/services/platformSettingsApi'
import { adminRoster } from '@/src/utils/admin-roster'
import { formatDateTime } from '@/src/utils/admin-format'
import { NO_LOGIN_RECORD_HINT } from '@/src/utils/admin-user-list'
import { isMaintenanceActive } from '@/src/utils/maintenance'
import {
  expiringPreview,
  overduePreview,
  quotaPreview,
  responsePreview,
  retentionPreview,
} from '@/src/utils/settings-impact'
import { sessionLabel } from '@/src/utils/settings-labels'
import { validateSettings } from '@/src/utils/settings-validate'

type SettingsKey = keyof SystemSettings

const { settings, saveSettings } = useAdminSettings()
const { logAction } = useAdminAudit()

/* -------------------- 頁籤 -------------------- */

type SettingsTab = 'thresholds' | 'security' | 'maintenance'

/** 「重置示範資料」是開發用的工具，正式站不出現 */
const isDev = import.meta.env.DEV

const TABS: { value: SettingsTab; label: string }[] = [
  { value: 'thresholds', label: '門檻與提醒' },
  { value: 'security', label: '安全性與帳號' },
  { value: 'maintenance', label: isDev ? '維護與重置' : '維護模式' },
]

const route = useRoute()
const router = useRouter()

// 目前的頁籤記在網址上：重新整理或把連結傳給別人，都會停在同一頁
const activeTab = ref<SettingsTab>(
  TABS.some((tab) => tab.value === route.query.tab) ? (route.query.tab as SettingsTab) : 'thresholds',
)

function selectTab(value: string | number): void {
  activeTab.value = value as SettingsTab
  void router.replace({ query: { ...route.query, tab: String(value) } })
}

function clock(): string {
  return new Date().toLocaleTimeString('zh-TW', { hour12: false })
}

/* -------------------- 門檻與維護（存在後端，所有管理員共用） -------------------- */

const AUDIT_KEYS = ['auditRetentionDays'] as const
const REMINDER_KEYS = ['maintenanceOverdueDays', 'subscriptionExpiringSoonDays'] as const
const QUOTA_KEYS = [
  'platformGeminiTokenQuota',
  'platformVisionPageQuota',
  'quotaWarnPercent',
  'quotaCriticalPercent',
  'aiQuotaCriticalDays',
] as const
const RESPONSE_KEYS = ['responseOkMs', 'responseDegradedMs'] as const
const THRESHOLD_KEYS = [...AUDIT_KEYS, ...REMINDER_KEYS, ...QUOTA_KEYS, ...RESPONSE_KEYS] as const

const MAINTENANCE_STATE_KEYS = [
  'maintenanceMode',
  'maintenanceStartsAt',
  'maintenanceEndsAt',
  'maintenanceAllowlist',
] as const
const MAINTENANCE_COPY_KEYS = ['siteName', 'maintenanceMessage', 'supportEmail'] as const
const MAINTENANCE_KEYS = [...MAINTENANCE_STATE_KEYS, ...MAINTENANCE_COPY_KEYS] as const

// 兩個頁籤共用一份草稿：切換頁籤不會丟掉還沒存的修改
const draft = ref<SystemSettings>({ ...settings.value })
const errors = computed(() => validateSettings(draft.value))
const savedAt = reactive<Record<SettingsTab, string | null>>({ thresholds: null, security: null, maintenance: null })

function copyField<K extends SettingsKey>(target: SystemSettings, source: SystemSettings, key: K): void {
  target[key] = source[key]
}

function differs(keys: readonly SettingsKey[]): boolean {
  return keys.some((key) => draft.value[key] !== settings.value[key])
}

function hasErrors(keys: readonly SettingsKey[]): boolean {
  return keys.some((key) => errors.value[key])
}

function atDefaults(keys: readonly SettingsKey[]): boolean {
  const defaults = seedSettings()
  return keys.every((key) => draft.value[key] === defaults[key])
}

/** 只改草稿，還要按儲存才會生效 —— 跟其他欄位的修改一樣可以還原 */
function resetToDefaults(keys: readonly SettingsKey[]): void {
  const defaults = seedSettings()
  for (const key of keys) copyField(draft.value, defaults, key)
}

function revert(keys: readonly SettingsKey[]): void {
  for (const key of keys) copyField(draft.value, settings.value, key)
}

/**
 * 伺服器上的設定讀好之前不能存：草稿還是預設值，一存就會把伺服器上的值蓋回預設。
 * 讀好時逐欄合併：讀取期間管理員已經改了的欄位保留他打的，其他欄位換成伺服器上的值。
 * 不能整份覆蓋（會吃掉他打的字），也不能整份保留（沒改的欄位會帶著預設值被存回去）。
 */
const siteState = ref<'loading' | 'ready' | 'error'>('loading')

async function loadSite(): Promise<void> {
  siteState.value = 'loading'
  const before = { ...draft.value }
  const ok = await loadAdminSettings()
  if (ok) {
    const merged: SystemSettings = { ...settings.value }
    for (const key of Object.keys(before) as SettingsKey[]) {
      if (draft.value[key] !== before[key]) copyField(merged, draft.value, key)
    }
    draft.value = merged
  }
  siteState.value = ok ? 'ready' : 'error'
}

type SiteTab = 'thresholds' | 'maintenance'
const siteSaving = reactive<Record<SiteTab, boolean>>({ thresholds: false, maintenance: false })
const siteError = reactive<Record<SiteTab, string>>({ thresholds: '', maintenance: '' })

/** 只存這個頁籤的欄位，另一個頁籤還沒存的修改留在草稿裡 */
async function saveKeys(keys: readonly SettingsKey[], tab: SiteTab): Promise<void> {
  const next: SystemSettings = { ...settings.value }
  for (const key of keys) copyField(next, draft.value, key)
  siteSaving[tab] = true
  siteError[tab] = ''
  try {
    await saveSettings(next)
    // 伺服器會修剪前後空白，存完以伺服器的值為準，不然畫面會一直說「有未儲存的變更」
    for (const key of keys) copyField(draft.value, settings.value, key)
    savedAt[tab] = clock()
  } catch (error) {
    siteError[tab] = error instanceof Error ? error.message : '儲存失敗，請稍後再試。'
  } finally {
    siteSaving[tab] = false
  }
}

const thresholdsDirty = computed(() => differs(THRESHOLD_KEYS))
const maintenanceDirty = computed(() => differs(MAINTENANCE_KEYS))

function saveThresholds(): Promise<void> {
  return saveKeys(THRESHOLD_KEYS, 'thresholds')
}

/* -------------------- 門檻的即時預覽 -------------------- */

const retentionText = computed(() => retentionPreview(draft.value.auditRetentionDays))
const overdueImpact = computed(() =>
  overduePreview(adminMaintenanceCollection.value, draft.value.maintenanceOverdueDays),
)
const expiringImpact = computed(() =>
  expiringPreview(adminSubscriptionCollection.value, draft.value.subscriptionExpiringSoonDays),
)

// 傳草稿進去：還沒按儲存，就先看到照新門檻會是什麼等級
const { usages: draftUsages } = useAdminAiUsage(draft)
const quotaText = computed(() =>
  quotaPreview(
    draftUsages.value.map((usage) => ({
      label: usage.provider.label,
      percent: usage.percent,
      levelLabel: quotaLevelLabels[usage.level],
      unset: usage.unset,
    })),
  ),
)

const { responseMs, checkedAt } = useSystemHealth()
const responseText = computed(() =>
  checkedAt.value === null
    ? '正在量測後端的回應時間…'
    : responsePreview(responseMs.value, draft.value.responseOkMs, draft.value.responseDegradedMs),
)

/* -------------------- 安全性（存在後端） -------------------- */

const platform = ref<AdminPlatformSettings | null>(null)
const platformState = ref<'loading' | 'ready' | 'error'>('loading')
const securityDraft = reactive({ passwordMinLength: 8, sessionMinutes: 120 })
const securitySaving = ref(false)
const securityError = ref('')
const confirmSecurityOpen = ref(false)

function applyPlatform(result: AdminPlatformSettings): void {
  platform.value = result
  securityDraft.passwordMinLength = result.passwordMinLength
  securityDraft.sessionMinutes = result.sessionMinutes
}

async function loadPlatform(): Promise<void> {
  platformState.value = 'loading'
  const result = await fetchAdminPlatformSettings()
  if (!result) {
    platformState.value = 'error'
    return
  }
  applyPlatform(result)
  platformState.value = 'ready'
}

const securityDirty = computed(
  () =>
    platform.value !== null &&
    (securityDraft.passwordMinLength !== platform.value.passwordMinLength ||
      securityDraft.sessionMinutes !== platform.value.sessionMinutes),
)

const passwordError = computed(() => {
  const [low, high] = platform.value?.passwordMinLengthRange ?? [8, 64]
  const value = securityDraft.passwordMinLength
  return Number.isInteger(value) && value >= low && value <= high ? '' : `必須是 ${low} 到 ${high} 之間的整數`
})

const securityAtDefaults = computed(
  () =>
    platform.value !== null &&
    securityDraft.passwordMinLength === platform.value.defaults.passwordMinLength &&
    securityDraft.sessionMinutes === platform.value.defaults.sessionMinutes,
)

function resetSecurityDefaults(): void {
  if (!platform.value) return
  securityDraft.passwordMinLength = platform.value.defaults.passwordMinLength
  securityDraft.sessionMinutes = platform.value.defaults.sessionMinutes
}

function revertSecurity(): void {
  if (platform.value) applyPlatform(platform.value)
  securityError.value = ''
}

/** 確認框裡的「這次會改什麼、影響誰」 */
const securityChanges = computed(() => {
  if (!platform.value) return []
  const changes: { text: string; note: string }[] = []
  if (securityDraft.passwordMinLength !== platform.value.passwordMinLength) {
    changes.push({
      text: `密碼最短長度：${platform.value.passwordMinLength} → ${securityDraft.passwordMinLength} 字元`,
      note: '只影響之後註冊的人，已經註冊的人不會被要求改密碼。',
    })
  }
  if (securityDraft.sessionMinutes !== platform.value.sessionMinutes) {
    changes.push({
      text: `登入有效時間：${sessionLabel(platform.value.sessionMinutes)} → ${sessionLabel(securityDraft.sessionMinutes)}`,
      note: '只對之後登入的人生效；現在已經登入的人照原本的期限。',
    })
  }
  return changes
})

async function saveSecurity(): Promise<void> {
  confirmSecurityOpen.value = false
  securitySaving.value = true
  securityError.value = ''
  try {
    applyPlatform(
      await updateAdminPlatformSettings({
        passwordMinLength: securityDraft.passwordMinLength,
        sessionMinutes: securityDraft.sessionMinutes,
      }),
    )
    savedAt.security = clock()
  } catch (error) {
    securityError.value = error instanceof Error ? error.message : '儲存失敗，請稍後再試。'
  } finally {
    securitySaving.value = false
  }
}

/* -------------------- 管理員名單（唯讀） -------------------- */

const adminAccounts = ref<AdminAccount[] | null>(null)
const rosterState = ref<'loading' | 'ready' | 'error'>('loading')
const roster = computed(() => adminRoster(adminAccounts.value ?? []))

async function loadRoster(): Promise<void> {
  const accounts = await fetchAdminAccounts()
  adminAccounts.value = accounts
  rosterState.value = accounts ? 'ready' : 'error'
}

/* -------------------- 維護 -------------------- */

const confirmMaintenanceOpen = ref(false)
const resetOpen = ref(false)

const turningOnMaintenance = computed(
  () => draft.value.maintenanceMode && !settings.value.maintenanceMode,
)

// 開關打開不代表此刻生效：排程可能還沒到，或已經結束
const maintenanceStatusText = computed(() => {
  if (!draft.value.maintenanceMode) return '已關閉'
  return isMaintenanceActive(draft.value) ? '已開啟，此刻生效' : '已開啟，依排程此刻尚未生效'
})

/** 頁籤上方的橫幅：維護開著的時候，不用先切到維護頁籤才找得到「立即解除」 */
const maintenanceBanner = computed(() => {
  if (!settings.value.maintenanceMode) return null
  return isMaintenanceActive(settings.value)
    ? '維護模式開啟中：一般頁面目前都會被導到維護頁'
    : '維護模式已開啟，依排程此刻尚未生效'
})

function saveMaintenance(): Promise<void> {
  confirmMaintenanceOpen.value = false
  return saveKeys(MAINTENANCE_KEYS, 'maintenance')
}

function requestSaveMaintenance(): void {
  if (turningOnMaintenance.value) {
    confirmMaintenanceOpen.value = true
    return
  }
  saveMaintenance()
}

/**
 * 緊急出口：不經確認對話框，直接關閉維護模式並清掉排程。
 * 維護中誤設排程時，多一道確認就多一次點錯的機會。
 */
const liftError = ref('')

async function liftMaintenanceNow(): Promise<void> {
  const next: SystemSettings = {
    ...settings.value,
    maintenanceMode: false,
    maintenanceStartsAt: '',
    maintenanceEndsAt: '',
  }
  liftError.value = ''
  try {
    await saveSettings(next)
    for (const key of MAINTENANCE_STATE_KEYS) copyField(draft.value, next, key)
    savedAt.maintenance = clock()
  } catch (error) {
    liftError.value = error instanceof Error ? error.message : '解除失敗，請稍後再試。'
  }
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

/* -------------------- 還沒儲存就離開 -------------------- */

const dirtyByTab = computed<Record<SettingsTab, boolean>>(() => ({
  thresholds: thresholdsDirty.value,
  security: securityDirty.value,
  maintenance: maintenanceDirty.value,
}))
const anyDirty = computed(() => Object.values(dirtyByTab.value).some(Boolean))

onBeforeRouteLeave(() => {
  if (!anyDirty.value) return true
  return window.confirm('有還沒儲存的變更，離開後會遺失。確定要離開？')
})

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!anyDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  void loadSite()
  void loadPlatform()
  void loadRoster()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="maintenanceBanner"
      class="flex flex-wrap items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-accent-foreground"
    >
      <ShieldAlert class="h-5 w-5 shrink-0" aria-hidden="true" />
      <p class="flex-1 text-sm font-medium">{{ maintenanceBanner }}</p>
      <Button size="sm" variant="outline" class="bg-background text-foreground" @click="liftMaintenanceNow">
        <ShieldOff class="mr-1 h-4 w-4" />
        立即解除維護
      </Button>
    </div>
    <ActionError v-if="liftError" :message="liftError" @dismiss="liftError = ''" />

    <Tabs :model-value="activeTab" @update:model-value="selectTab">
      <TabsList :class="ADMIN_TAB_LIST">
        <TabsTrigger v-for="tab in TABS" :key="tab.value" :value="tab.value" :class="ADMIN_TAB_TRIGGER">
          {{ tab.label }}
          <!-- 有還沒儲存的修改：切頁籤不會丟，但要讓人看得到 -->
          <span v-if="dirtyByTab[tab.value]" class="ml-1.5 inline-block size-2 rounded-full bg-accent" aria-hidden="true" />
          <span v-if="dirtyByTab[tab.value]" class="sr-only">（有未儲存的變更）</span>
        </TabsTrigger>
      </TabsList>

      <!-- ==================== 門檻與提醒 ==================== -->
      <TabsContent value="thresholds" class="mt-6 space-y-4">
        <p class="flex items-center gap-2 text-sm text-foreground/70">
          <Cloud class="h-4 w-4 shrink-0" aria-hidden="true" />
          <span v-if="siteState === 'loading'">正在讀取伺服器上的設定…</span>
          <span v-else-if="siteState === 'error'" class="text-destructive">
            讀不到伺服器上的設定，重新整理後再試；讀到之前不能儲存。
          </span>
          <span v-else>這一頁的設定存在伺服器，所有管理員看到同一份。</span>
        </p>

        <Card class="rounded-3xl">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="space-y-3 md:col-span-1">
              <div>
                <h3 class="text-base font-semibold">稽核紀錄</h3>
                <p class="mt-1.5 text-sm text-muted-foreground">稽核紀錄頁要顯示多久以內的紀錄。</p>
              </div>
              <Button variant="ghost" size="sm" class="-ml-3" :disabled="atDefaults(AUDIT_KEYS)" @click="resetToDefaults(AUDIT_KEYS)">
                <Undo2 class="mr-1 h-4 w-4" />
                恢復預設值
              </Button>
            </div>
            <div class="space-y-4 md:col-span-3">
              <div class="space-y-2">
                <Label for="auditRetentionDays">稽核紀錄保留天數（天）</Label>
                <Input id="auditRetentionDays" v-model.number="draft.auditRetentionDays" type="number" class="max-w-[9rem]" />
                <p v-if="errors.auditRetentionDays" class="text-sm text-destructive">{{ errors.auditRetentionDays }}</p>
                <p class="text-xs text-muted-foreground">
                  設為 0 或負數代表不限制。原始紀錄不會被刪除，只是超過天數的不再顯示。
                  例外：斷線、恢復、後端停機這類服務狀態，後端只保留 30 天，不受這個設定影響。
                </p>
              </div>
              <p class="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm text-foreground/80">
                <Eye class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {{ retentionText }}
              </p>
            </div>
          </div>
        </Card>

        <Card class="rounded-3xl">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="space-y-3 md:col-span-1">
              <div>
                <h3 class="text-base font-semibold">提醒門檻</h3>
                <p class="mt-1.5 text-sm text-muted-foreground">工單逾期與訂閱到期，要多早開始提醒。</p>
              </div>
              <Button variant="ghost" size="sm" class="-ml-3" :disabled="atDefaults(REMINDER_KEYS)" @click="resetToDefaults(REMINDER_KEYS)">
                <Undo2 class="mr-1 h-4 w-4" />
                恢復預設值
              </Button>
            </div>
            <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2 md:col-span-3">
              <div class="space-y-2">
                <Label for="maintenanceOverdueDays">報修逾期提醒門檻（天）</Label>
                <Input id="maintenanceOverdueDays" v-model.number="draft.maintenanceOverdueDays" type="number" class="max-w-[9rem]" min="1" max="90" />
                <p v-if="errors.maintenanceOverdueDays" class="text-sm text-destructive">{{ errors.maintenanceOverdueDays }}</p>
                <!-- 原本寫「不會自動改變工單狀態」，但工單頁確實會自動標成逾期，並記進稽核紀錄 -->
                <p class="text-xs text-muted-foreground">
                  工單「已通報房東」超過這個天數仍沒有進度，系統會自動標成「逾期未回應」。
                </p>
                <p class="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm text-foreground/80">
                  <Eye class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {{ overdueImpact.text }}
                </p>
              </div>
              <div class="space-y-2">
                <Label for="subscriptionExpiringSoonDays">訂閱到期提醒天數（天）</Label>
                <Input id="subscriptionExpiringSoonDays" v-model.number="draft.subscriptionExpiringSoonDays" type="number" class="max-w-[9rem]" min="1" max="90" />
                <p v-if="errors.subscriptionExpiringSoonDays" class="text-sm text-destructive">{{ errors.subscriptionExpiringSoonDays }}</p>
                <p class="text-xs text-muted-foreground">到期前這麼多天內，使用者列表會標示「訂閱即將到期」。</p>
                <p class="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm text-foreground/80">
                  <Eye class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {{ expiringImpact.text }}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card class="rounded-3xl">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="space-y-3 md:col-span-1">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-semibold">AI 平台額度</h3>
                </div>
                <p class="mt-1.5 text-sm text-muted-foreground">
                  平台向 AI 廠商購買的每月額度與預警門檻，用於系統監控頁的 AI 用量。
                </p>
              </div>
              <Button variant="ghost" size="sm" class="-ml-3" :disabled="atDefaults(QUOTA_KEYS)" @click="resetToDefaults(QUOTA_KEYS)">
                <Undo2 class="mr-1 h-4 w-4" />
                恢復預設值
              </Button>
            </div>
            <div class="space-y-4 md:col-span-3">
              <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <div class="space-y-2">
                  <Label for="platformGeminiTokenQuota">Gemini 每月 token 上限</Label>
                  <Input id="platformGeminiTokenQuota" v-model.number="draft.platformGeminiTokenQuota" type="number" class="max-w-[9rem]" min="0" />
                  <p v-if="errors.platformGeminiTokenQuota" class="text-sm text-destructive">{{ errors.platformGeminiTokenQuota }}</p>
                </div>
                <div class="space-y-2">
                  <Label for="platformVisionPageQuota">Vision 每月頁數上限（頁）</Label>
                  <Input id="platformVisionPageQuota" v-model.number="draft.platformVisionPageQuota" type="number" class="max-w-[9rem]" min="0" />
                  <p v-if="errors.platformVisionPageQuota" class="text-sm text-destructive">{{ errors.platformVisionPageQuota }}</p>
                </div>
                <div class="space-y-2">
                  <Label for="aiQuotaCriticalDays">剩餘天數告急門檻（天）</Label>
                  <Input id="aiQuotaCriticalDays" v-model.number="draft.aiQuotaCriticalDays" type="number" class="max-w-[9rem]" min="1" max="30" />
                  <p v-if="errors.aiQuotaCriticalDays" class="text-sm text-destructive">{{ errors.aiQuotaCriticalDays }}</p>
                </div>
                <div class="space-y-2">
                  <Label for="quotaWarnPercent">預警門檻（%）</Label>
                  <Input id="quotaWarnPercent" v-model.number="draft.quotaWarnPercent" type="number" class="max-w-[9rem]" min="1" max="100" />
                  <p v-if="errors.quotaWarnPercent" class="text-sm text-destructive">{{ errors.quotaWarnPercent }}</p>
                </div>
                <div class="space-y-2">
                  <Label for="quotaCriticalPercent">告急門檻（%）</Label>
                  <Input id="quotaCriticalPercent" v-model.number="draft.quotaCriticalPercent" type="number" class="max-w-[9rem]" min="1" max="100" />
                  <p v-if="errors.quotaCriticalPercent" class="text-sm text-destructive">{{ errors.quotaCriticalPercent }}</p>
                </div>
              </div>
              <p class="text-xs text-muted-foreground">
                用量達預警或告急的比例時分別標示；依消耗速度推算的剩餘天數低於告急門檻時，不必等比例達標也直接告急。
              </p>
              <p class="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm text-foreground/80">
                <Eye class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {{ quotaText }}
              </p>
            </div>
          </div>
        </Card>

        <Card class="rounded-3xl">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="space-y-3 md:col-span-1">
              <div>
                <h3 class="text-base font-semibold">系統監控門檻</h3>
                <p class="mt-1.5 text-sm text-muted-foreground">
                  後端回應時間的分級，用於系統監控頁。健康檢查 5 秒就逾時，門檻設超過 5000 毫秒不會生效。
                </p>
              </div>
              <Button variant="ghost" size="sm" class="-ml-3" :disabled="atDefaults(RESPONSE_KEYS)" @click="resetToDefaults(RESPONSE_KEYS)">
                <Undo2 class="mr-1 h-4 w-4" />
                恢復預設值
              </Button>
            </div>
            <div class="space-y-4 md:col-span-3">
              <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="responseOkMs">正常門檻（毫秒）</Label>
                  <Input id="responseOkMs" v-model.number="draft.responseOkMs" type="number" class="max-w-[9rem]" min="50" max="5000" />
                  <p v-if="errors.responseOkMs" class="text-sm text-destructive">{{ errors.responseOkMs }}</p>
                  <p class="text-xs text-muted-foreground">回應時間低於此值，判定為「正常」。</p>
                </div>
                <div class="space-y-2">
                  <Label for="responseDegradedMs">變慢門檻（毫秒）</Label>
                  <Input id="responseDegradedMs" v-model.number="draft.responseDegradedMs" type="number" class="max-w-[9rem]" min="50" max="5000" />
                  <p v-if="errors.responseDegradedMs" class="text-sm text-destructive">{{ errors.responseDegradedMs }}</p>
                  <p class="text-xs text-muted-foreground">達到此值判定為「無回應」；必須大於正常門檻。</p>
                </div>
              </div>
              <p class="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm text-foreground/80">
                <Eye class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {{ responseText }}
              </p>
            </div>
          </div>
        </Card>

        <SettingsSaveBar
          :dirty="thresholdsDirty"
          :invalid="hasErrors(THRESHOLD_KEYS) || siteState !== 'ready'"
          :saving="siteSaving.thresholds"
          :error="siteError.thresholds"
          :saved-at="savedAt.thresholds"
          @save="saveThresholds"
          @revert="revert(THRESHOLD_KEYS)"
        />
      </TabsContent>

      <!-- ==================== 安全性與帳號 ==================== -->
      <TabsContent value="security" class="mt-6 space-y-4">
        <p class="flex items-center gap-2 text-sm text-foreground/70">
          <Cloud class="h-4 w-4 shrink-0" aria-hidden="true" />
          密碼與登入的設定所有管理員共用，會直接套用在註冊與登入。
        </p>

        <Card class="rounded-3xl">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="space-y-3 md:col-span-1">
              <div>
                <h3 class="text-base font-semibold">密碼與登入</h3>
                <p class="mt-1.5 text-sm text-muted-foreground">租客與房東的密碼長度，以及登入後多久要重新登入。</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="-ml-3"
                :disabled="platformState !== 'ready' || securityAtDefaults"
                @click="resetSecurityDefaults"
              >
                <Undo2 class="mr-1 h-4 w-4" />
                恢復預設值
              </Button>
            </div>
            <div class="md:col-span-3">
              <p v-if="platformState === 'loading'" class="text-sm text-muted-foreground">讀取中…</p>
              <p
                v-else-if="platformState === 'error'"
                class="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              >
                讀不到後端的設定，請確認後端已經啟動、而且你用管理員身分登入。
              </p>
              <div v-else class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="passwordMinLength">密碼最短長度（字元）</Label>
                  <Input
                    id="passwordMinLength"
                    v-model.number="securityDraft.passwordMinLength"
                    type="number"
                    class="max-w-[9rem]"
                    :min="platform?.passwordMinLengthRange[0]"
                    :max="platform?.passwordMinLengthRange[1]"
                  />
                  <p v-if="passwordError" class="text-sm text-destructive">{{ passwordError }}</p>
                  <p class="text-xs text-muted-foreground">
                    只影響之後註冊的人。系統目前沒有修改密碼的功能，已經註冊的人不會被要求改。
                  </p>
                </div>
                <div class="space-y-2">
                  <Label for="sessionMinutes">登入有效時間</Label>
                  <Select
                    :model-value="String(securityDraft.sessionMinutes)"
                    @update:model-value="(value) => (securityDraft.sessionMinutes = Number(value))"
                  >
                    <SelectTrigger id="sessionMinutes" class="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="minutes in platform?.sessionMinuteOptions ?? []" :key="minutes" :value="String(minutes)">
                        {{ sessionLabel(minutes) }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p class="text-xs text-muted-foreground">
                    從登入起算，重新整理不會延長；只對之後登入的人生效。
                    管理員固定 {{ sessionLabel(platform?.adminSessionMinutes ?? 480) }}、閒置
                    {{ platform?.adminIdleMinutes ?? 20 }} 分鐘自動登出，不受這個設定影響 —— 設錯時你還進得來改回去。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <SettingsSaveBar
          :dirty="securityDirty"
          :invalid="Boolean(passwordError)"
          :saving="securitySaving"
          :saved-at="savedAt.security"
          :error="securityError"
          @save="confirmSecurityOpen = true"
          @revert="revertSecurity"
        />

        <Card class="rounded-3xl">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="md:col-span-1">
              <h3 class="text-base font-semibold">登入保護</h3>
              <p class="mt-1.5 text-sm text-muted-foreground">目前實際在擋的東西。這些規則寫在程式與伺服器設定裡，這裡不能改。</p>
            </div>
            <ul class="space-y-3 text-sm md:col-span-3">
              <li>
                <p class="font-medium">伺服器限速</p>
                <p class="text-muted-foreground">伺服器對登入請求有速率限制，短時間內大量嘗試會被擋下。這是真正擋暴力猜密碼的那一層。</p>
              </li>
              <li>
                <p class="font-medium">管理員閒置登出</p>
                <p class="text-muted-foreground">
                  管理員 {{ platform?.adminIdleMinutes ?? 20 }} 分鐘沒有操作就自動登出（登出前一分鐘會先提醒）。由伺服器判斷，關掉分頁或改電腦時鐘都繞不過；背景自動更新的頁面不算操作。
                </p>
              </li>
              <li>
                <p class="font-medium">管理員登入驗證碼</p>
                <p class="text-muted-foreground">管理員帳密正確之後，還要輸入寄到信箱的驗證碼；最多試 3 次，錯滿整組作廢、要重新輸入帳密。</p>
              </li>
              <li>
                <p class="font-medium">登入頁的失敗計數</p>
                <p class="text-muted-foreground">
                  同一個信箱在同一台瀏覽器連續輸錯 5 次，登入頁會請對方等 15 分鐘。計數存在使用者的瀏覽器裡，清除瀏覽器資料就能繞過 —— 它只是提示，不是防護。
                </p>
              </li>
            </ul>
          </div>
        </Card>

        <Card class="rounded-3xl">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="md:col-span-1">
              <h3 class="text-base font-semibold">管理員名單</h3>
              <p class="mt-1.5 text-sm text-muted-foreground">現在誰能進後台。太久沒登入的帳號，建議移除。</p>
            </div>
            <div class="space-y-3 md:col-span-3">
              <p v-if="rosterState === 'loading'" class="text-sm text-muted-foreground">讀取中…</p>
              <p
                v-else-if="rosterState === 'error'"
                class="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              >
                讀不到管理員名單，請確認後端狀態。
              </p>
              <ul v-else class="divide-y">
                <li v-for="row in roster" :key="row.id" class="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{{ row.name }}</p>
                    <p class="truncate text-xs text-muted-foreground">{{ row.email }}</p>
                  </div>
                  <div class="flex items-center gap-3">
                    <span
                      class="text-sm tabular-nums text-foreground/70"
                      :title="row.lastLoginAt ? formatDateTime(row.lastLoginAt) : NO_LOGIN_RECORD_HINT"
                    >
                      {{ row.lastLoginAt ? `${row.lastLoginLabel}登入` : row.lastLoginLabel }}
                    </span>
                    <StatusDot v-if="row.flag" :tone="row.flag.tone" :label="row.flag.label" emphasize />
                  </div>
                </li>
              </ul>
              <!-- 刻意不開放從網頁授權：見 backend/routers/admin.py 與 manage_admin.py 的說明 -->
              <p class="text-xs text-muted-foreground">
                新增或移除管理員要在伺服器上執行 manage_admin.py。刻意不開放從網頁授權 —— 就算網頁被攻破，也拿不到管理員權限。
              </p>
            </div>
          </div>
        </Card>
      </TabsContent>

      <!-- ==================== 維護與重置 ==================== -->
      <TabsContent value="maintenance" class="mt-6 space-y-4">
        <p class="flex items-center gap-2 text-sm text-foreground/70">
          <Cloud class="h-4 w-4 shrink-0" aria-hidden="true" />
          開啟後，所有裝置的一般頁面都會導到維護頁；已經開著的頁面，換頁時才會跳過去。
        </p>

        <Card class="rounded-3xl">
          <div class="space-y-6 p-6">
            <div>
              <h3 class="text-base font-semibold">系統維護</h3>
              <p class="mt-1.5 text-sm text-muted-foreground">
                開啟後導向維護頁。管理後台與內部人員登入頁（/staff-login）不受影響。
              </p>
            </div>

            <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="space-y-6">
                <div class="space-y-4">
                  <h4 class="text-xs font-semibold tracking-wide text-foreground/70">維護狀態</h4>
                  <div class="flex items-center justify-between rounded-2xl border p-4">
                    <div>
                      <p class="font-medium">維護模式</p>
                      <p class="text-sm text-muted-foreground">{{ maintenanceStatusText }}</p>
                    </div>
                    <Switch v-model="draft.maintenanceMode" />
                  </div>

                  <div v-if="draft.maintenanceMode" class="space-y-4">
                    <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                      <div class="space-y-2">
                        <Label for="maintenanceStartsAt">開始時間（選填）</Label>
                        <Input id="maintenanceStartsAt" v-model="draft.maintenanceStartsAt" type="datetime-local" />
                      </div>
                      <div class="space-y-2">
                        <Label for="maintenanceEndsAt">結束時間（選填）</Label>
                        <Input id="maintenanceEndsAt" v-model="draft.maintenanceEndsAt" type="datetime-local" />
                        <p v-if="errors.maintenanceEndsAt" class="text-sm text-destructive">{{ errors.maintenanceEndsAt }}</p>
                      </div>
                    </div>
                    <p class="text-xs text-muted-foreground">兩者留空代表開啟後持續生效，直到手動關閉。</p>

                    <div class="space-y-2">
                      <Label for="maintenanceAllowlist">白名單 Email（一行一個）</Label>
                      <Textarea id="maintenanceAllowlist" v-model="draft.maintenanceAllowlist" rows="3" placeholder="admin@rentmate.tw" />
                      <p v-if="errors.maintenanceAllowlist" class="text-sm text-destructive">{{ errors.maintenanceAllowlist }}</p>
                      <p class="text-xs text-muted-foreground">名單內的帳號在維護期間仍可正常使用，方便上線前驗證。</p>
                    </div>
                  </div>
                </div>

                <!-- 文案跟開關是否開啟無關，可以隨時先準備好 -->
                <div class="space-y-4 border-t pt-6">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h4 class="text-xs font-semibold tracking-wide text-foreground/70">維護頁文案</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      :disabled="atDefaults(MAINTENANCE_COPY_KEYS)"
                      @click="resetToDefaults(MAINTENANCE_COPY_KEYS)"
                    >
                      <Undo2 class="mr-1 h-4 w-4" />
                      恢復預設值
                    </Button>
                  </div>
                  <div class="space-y-2">
                    <Label for="siteName">網站名稱</Label>
                    <Input id="siteName" v-model="draft.siteName" />
                    <p v-if="errors.siteName" class="text-sm text-destructive">{{ errors.siteName }}</p>
                  </div>
                  <div class="space-y-2">
                    <Label for="maintenanceMessage">維護說明文字</Label>
                    <Textarea id="maintenanceMessage" v-model="draft.maintenanceMessage" rows="3" />
                    <p v-if="errors.maintenanceMessage" class="text-sm text-destructive">{{ errors.maintenanceMessage }}</p>
                  </div>
                  <div class="space-y-2">
                    <Label for="supportEmail">客服信箱</Label>
                    <Input id="supportEmail" v-model="draft.supportEmail" type="email" />
                    <p v-if="errors.supportEmail" class="text-sm text-destructive">{{ errors.supportEmail }}</p>
                    <p class="text-xs text-muted-foreground">維護頁會顯示這個信箱，讓被擋在外面的人知道找誰。</p>
                  </div>
                </div>
              </div>

              <div class="lg:sticky lg:top-4 lg:self-start">
                <MaintenancePreview
                  :site-name="draft.siteName"
                  :message="draft.maintenanceMessage"
                  :support-email="draft.supportEmail"
                  :ends-at="draft.maintenanceEndsAt"
                />
              </div>
            </div>
          </div>
        </Card>

        <SettingsSaveBar
          :dirty="maintenanceDirty"
          :invalid="hasErrors(MAINTENANCE_KEYS) || siteState !== 'ready'"
          :saving="siteSaving.maintenance"
          :error="siteError.maintenance"
          :saved-at="savedAt.maintenance"
          @save="requestSaveMaintenance"
          @revert="revert(MAINTENANCE_KEYS)"
        />

        <!-- 危險區：無法復原的操作，框起來跟上面分開。開發用，正式站不出現 -->
        <Card v-if="isDev" class="rounded-3xl border-destructive/40">
          <div class="grid gap-6 p-6 md:grid-cols-4 md:gap-8">
            <div class="md:col-span-1">
              <h3 class="flex items-center gap-2 text-base font-semibold text-destructive">
                <ShieldAlert class="h-4 w-4" aria-hidden="true" />
                重置示範資料
              </h3>
              <p class="mt-1.5 text-sm text-muted-foreground">無法復原。</p>
            </div>
            <div class="space-y-3 md:col-span-3">
              <p class="text-sm text-muted-foreground">
                把還存在瀏覽器裡的後台示範資料（使用者、工單、押金…）復原成初始狀態。存在後端的資料（真實帳號、稽核紀錄、系統設定、公告與輪播、通知模板）不受影響。
              </p>
              <Button variant="destructive" @click="resetOpen = true">
                <RotateCcw class="mr-1 h-4 w-4" />
                重置示範資料
              </Button>
            </div>
          </div>
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog v-model:open="confirmSecurityOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認修改密碼與登入設定？</DialogTitle>
          <DialogDescription>存在後端，所有管理員都會看到新的值，並寫進稽核紀錄。</DialogDescription>
        </DialogHeader>
        <ul class="space-y-3 text-sm">
          <li v-for="change in securityChanges" :key="change.text">
            <p class="font-medium">{{ change.text }}</p>
            <p class="text-muted-foreground">{{ change.note }}</p>
          </li>
        </ul>
        <DialogFooter>
          <Button variant="outline" @click="confirmSecurityOpen = false">取消</Button>
          <Button @click="saveSecurity">確認儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="confirmMaintenanceOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>開啟維護模式？</DialogTitle>
          <DialogDescription>變更會立即生效。</DialogDescription>
        </DialogHeader>
        <div class="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle class="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <p>
            所有使用者的一般頁面都會被導向維護頁（最慢一分鐘內生效）。管理後台（/admin）不受影響，你可以隨時回到這裡關閉。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="confirmMaintenanceOpen = false">取消</Button>
          <Button @click="saveMaintenance">確認開啟</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="resetOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置示範資料</DialogTitle>
          <DialogDescription>
            瀏覽器裡的後台示範資料會回到初始狀態，包含使用者、工單與押金；存在後端的資料不受影響。此操作無法復原。
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

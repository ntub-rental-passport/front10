<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button/index'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import LevelBadge from '@/src/components/admin/LevelBadge.vue'
import AnnouncementBanner from '@/src/components/content/AnnouncementBanner.vue'
import { STATUS_CHIP_CLASS } from '@/src/components/admin/status-dot'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import { useNow } from '@/src/composables/useNow'
import {
  announcementPlacement,
  announcementPlacementSummary,
  formatAnnouncementShortDate,
  resolveAnnouncementPhase,
  type AnnouncementPhase,
  type AnnouncementPlacement,
} from '@/src/utils/announcement'
import { dateKey } from '@/src/utils/date-key'
import type { Announcement, AnnouncementAudience, AnnouncementLevel } from '@/src/mocks/admin/content'

const { announcements, saveAnnouncement, removeAnnouncement } = useAdminContent()

// 狀態與排序一律靠這個「現在」算，不要在別處各自 new Date()——否則頁面開著
// 跨過整點時，生效中／已過期的分組不會跟著動，直到使用者重新整理才會發現。
const now = useNow()

const audienceLabels: Record<AnnouncementAudience, string> = {
  all: '全部',
  tenant: '租客',
  landlord: '房東',
}

/* ---------------------------------------------------------------------- *
 * 左欄：依狀態分組的清單
 * ---------------------------------------------------------------------- */

const SECTIONS: { phase: AnnouncementPhase; label: string }[] = [
  { phase: 'active', label: '生效中' },
  { phase: 'scheduled', label: '排程中' },
  { phase: 'draft', label: '未發布' },
  { phase: 'expired', label: '已過期' },
]

function endAtAscending(a: Announcement, b: Announcement): number {
  // 生效中依結束時間由近到遠排，長期（endAt 為 null）視為無限遠，排最後
  const av = a.endAt === null ? Number.POSITIVE_INFINITY : new Date(a.endAt).getTime()
  const bv = b.endAt === null ? Number.POSITIVE_INFINITY : new Date(b.endAt).getTime()
  return av - bv
}

function startAtAscending(a: Announcement, b: Announcement): number {
  return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
}

function updatedAtDescending(a: Announcement, b: Announcement): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function endAtDescending(a: Announcement, b: Announcement): number {
  // 已過期的公告一定有 endAt（resolvePhase 判定 expired 的條件本身就要求
  // endAt !== null），這裡補 0 只是防呆，邏輯上不會真的用到
  const av = a.endAt === null ? 0 : new Date(a.endAt).getTime()
  const bv = b.endAt === null ? 0 : new Date(b.endAt).getTime()
  return bv - av
}

const grouped = computed<Record<AnnouncementPhase, Announcement[]>>(() => {
  const current = now.value
  const buckets: Record<AnnouncementPhase, Announcement[]> = {
    active: [],
    scheduled: [],
    draft: [],
    expired: [],
  }
  for (const item of announcements.value) {
    buckets[resolveAnnouncementPhase(item, current)].push(item)
  }
  buckets.active.sort(endAtAscending)
  buckets.scheduled.sort(startAtAscending)
  buckets.draft.sort(updatedAtDescending)
  buckets.expired.sort(endAtDescending)
  return buckets
})

// 已過期預設收合——這段通常最長，但已經沒有人在看，展開只是為了偶爾回頭查
const expiredCollapsed = ref(true)

function placementOf(item: Announcement): AnnouncementPlacement {
  return announcementPlacement(item, now.value)
}

function placementSummaryOf(item: Announcement): string {
  return announcementPlacementSummary(placementOf(item))
}

function daysBetween(from: Date, to: Date): number {
  // 兩邊都先壓成本地午夜再比較天數，避免 now 帶著的時分秒讓「還剩幾天」
  // 在同一天內因為時刻不同而跳動
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** 列表右側的時間提示；未發布沒有時間可講，回傳空字串讓 template 不顯示。 */
function rowTiming(item: Announcement, phase: AnnouncementPhase): string {
  const current = now.value
  if (phase === 'active') {
    return item.endAt === null ? '長期' : `還剩 ${daysBetween(current, new Date(item.endAt))} 天`
  }
  if (phase === 'scheduled') {
    return `${daysBetween(current, new Date(item.startAt))} 天後開始`
  }
  if (phase === 'expired') {
    return item.endAt === null ? '' : `${formatAnnouncementShortDate(item.endAt)} 結束`
  }
  return ''
}

/* ---------------------------------------------------------------------- *
 * 右欄：選取狀態與草稿
 * ---------------------------------------------------------------------- */

type PanelMode = 'empty' | 'edit' | 'create'

const panelMode = ref<PanelMode>('empty')
const selectedId = ref<string | null>(null)

interface DraftState {
  id?: string
  title: string
  body: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  published: boolean
  startAt: string
  endAt: string
}

/**
 * ISO → <input type="date"> 的值。
 *
 * ⚠️ 不可以寫成 `iso.slice(0, 10)`。fromDateInput 存進去的是**本地午夜**，
 * 在 UTC+8 會變成前一天的 16:00Z —— 直接切 ISO 字串會把日期倒退一天，
 * 而且每次開編輯再存檔就再退一天。
 *
 * dateKey() 取的是本地日期部件，來回轉換才會穩定。
 */
function toDateInput(iso: string): string {
  return dateKey(new Date(iso))
}

function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString()
}

function emptyDraft(): DraftState {
  return {
    title: '',
    body: '',
    level: 'info',
    audience: 'all',
    published: true,
    startAt: toDateInput(new Date().toISOString()),
    endAt: '',
  }
}

function draftFromItem(item: Announcement): DraftState {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    level: item.level,
    audience: item.audience,
    published: item.published,
    startAt: toDateInput(item.startAt),
    endAt: item.endAt ? toDateInput(item.endAt) : '',
  }
}

const draft = ref<DraftState>(emptyDraft())
// 切換列或按新增前用來比對「有沒有還沒存的變更」的快照，見 isDirty。
const originalDraft = ref<DraftState>(emptyDraft())

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(originalDraft.value))

function isSelected(item: Announcement): boolean {
  return panelMode.value === 'edit' && selectedId.value === item.id
}

/* ---- 有未儲存變更時，切列或新增要先確認是否放棄 ---- */

const discardConfirmOpen = ref(false)
const pendingNavigation = ref<(() => void) | null>(null)

function guardedNavigate(action: () => void): void {
  if (isDirty.value) {
    pendingNavigation.value = action
    discardConfirmOpen.value = true
    return
  }
  action()
}

function confirmDiscard(): void {
  const action = pendingNavigation.value
  discardConfirmOpen.value = false
  pendingNavigation.value = null
  action?.()
}

function cancelDiscard(): void {
  discardConfirmOpen.value = false
  pendingNavigation.value = null
}

function loadItem(item: Announcement): void {
  const snapshot = draftFromItem(item)
  draft.value = snapshot
  originalDraft.value = { ...snapshot }
  selectedId.value = item.id
  panelMode.value = 'edit'
}

function loadCreate(): void {
  const snapshot = emptyDraft()
  draft.value = snapshot
  originalDraft.value = { ...snapshot }
  selectedId.value = null
  panelMode.value = 'create'
}

function selectItem(item: Announcement): void {
  if (isSelected(item)) return
  guardedNavigate(() => loadItem(item))
}

function startCreate(): void {
  if (panelMode.value === 'create') return
  guardedNavigate(() => loadCreate())
}

function canSubmit(): boolean {
  return draft.value.title.trim() !== '' && draft.value.body.trim() !== '' && draft.value.startAt !== ''
}

function save(): void {
  if (!canSubmit()) return
  const creating = panelMode.value === 'create'
  saveAnnouncement({
    id: creating ? undefined : draft.value.id,
    title: draft.value.title,
    body: draft.value.body,
    level: draft.value.level,
    audience: draft.value.audience,
    published: draft.value.published,
    startAt: fromDateInput(draft.value.startAt),
    endAt: draft.value.endAt ? fromDateInput(draft.value.endAt) : null,
  })

  if (creating) {
    // saveAnnouncement 新增時把新項目 unshift 進 announcements 最前面（見
    // useAdminContent.ts），它本身不回傳新 id——存檔後讀 [0] 就是剛剛建立
    // 的那一筆，這是唯一能拿到產生出來的 id 的辦法，面板才能切到編輯模式
    // 並讓清單裡正確反白選中它。
    const created = announcements.value[0]
    selectedId.value = created.id
    panelMode.value = 'edit'
    draft.value = { ...draft.value, id: created.id }
  }
  originalDraft.value = { ...draft.value }
}

/* ---- 刪除：面板底部觸發，沿用既有的確認對話框 ---- */

const deleteTarget = ref<Announcement | null>(null)

function requestDelete(): void {
  const current = announcements.value.find((item) => item.id === selectedId.value)
  if (current) deleteTarget.value = current
}

function confirmDelete(): void {
  if (!deleteTarget.value) return
  const removedId = deleteTarget.value.id
  removeAnnouncement(removedId)
  if (selectedId.value === removedId) {
    selectedId.value = null
    panelMode.value = 'empty'
  }
  deleteTarget.value = null
}

/* ---------------------------------------------------------------------- *
 * 右欄上半部：即時預覽——一定要吃「草稿」而不是已存檔的內容，
 * 這樣改等級、改受眾的當下上面就會跟著變，這正是把編輯與預覽放在一起的理由。
 * ---------------------------------------------------------------------- */

const draftPlacementInput = computed(() => ({
  audience: draft.value.audience,
  published: draft.value.published,
  level: draft.value.level,
  // 草稿的日期是 <input type="date"> 字串，可能暫時是空的（例如使用者正在
  // 清空重填）；退回「現在」避免 new Date('') 產生 Invalid Date 讓預覽算出
  // 詭異的結果，這只影響預覽判斷，不影響實際存檔內容。
  startAt: draft.value.startAt ? fromDateInput(draft.value.startAt) : new Date().toISOString(),
  endAt: draft.value.endAt ? fromDateInput(draft.value.endAt) : null,
}))

const draftPlacement = computed<AnnouncementPlacement>(() =>
  announcementPlacement(draftPlacementInput.value, now.value),
)
const draftPlacementText = computed(() => announcementPlacementSummary(draftPlacement.value))

const draftAppearsSomewhere = computed(
  () => draftPlacement.value.kind === 'live' || draftPlacement.value.kind === 'scheduled',
)

// 'live' 與 'scheduled' 是唯一帶 locations 欄位的兩種 kind；先判斷 kind 讓
// TypeScript 把 placement 收斂成那兩種，才能安全讀 .locations，不用強制轉型。
const showBannerSample = computed(() => {
  const placement = draftPlacement.value
  return (
    (placement.kind === 'live' || placement.kind === 'scheduled') &&
    placement.locations.includes('dashboard-banner')
  )
})
const showInboxSample = computed(() => {
  const placement = draftPlacement.value
  return (
    (placement.kind === 'live' || placement.kind === 'scheduled') &&
    !placement.locations.includes('dashboard-banner')
  )
})

const summaryBoxClass = computed(() => [
  'rounded-lg px-3 py-2 text-xs font-medium',
  draftAppearsSomewhere.value ? 'bg-success/10 text-foreground' : 'bg-muted text-muted-foreground',
])

// 只給上方樣品用的臨時物件，不會存檔；id／updatedAt 隨便填，AnnouncementBanner 不看這兩個欄位
const previewAnnouncement = computed<Announcement>(() => ({
  id: draft.value.id ?? 'preview',
  title: draft.value.title,
  body: draft.value.body,
  level: draft.value.level,
  audience: draft.value.audience,
  published: draft.value.published,
  startAt: draftPlacementInput.value.startAt,
  endAt: draftPlacementInput.value.endAt,
  updatedAt: new Date().toISOString(),
}))
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <!-- ============ 左：依狀態分組的清單 ============ -->
      <div class="space-y-6">
        <div class="flex justify-end">
          <Button @click="startCreate">新增公告</Button>
        </div>

        <div
          v-if="announcements.length === 0"
          class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
        >
          <p>尚無公告。</p>
          <Button class="mt-3" size="sm" @click="startCreate">新增第一則公告</Button>
        </div>

        <template v-else>
          <div v-for="section in SECTIONS" :key="section.phase">
            <template v-if="grouped[section.phase].length > 0">
              <!-- 已過期預設收合，其餘三段一律展開——狀態本身已經排序過重要性 -->
              <button
                v-if="section.phase === 'expired'"
                type="button"
                class="flex w-full items-center gap-1.5 py-2 text-left text-sm font-semibold text-foreground/70"
                @click="expiredCollapsed = !expiredCollapsed"
              >
                <component :is="expiredCollapsed ? ChevronRight : ChevronDown" class="h-4 w-4 shrink-0" />
                {{ section.label }}（{{ grouped[section.phase].length }}）
              </button>
              <h3 v-else class="py-2 text-sm font-semibold text-foreground/70">
                {{ section.label }}（{{ grouped[section.phase].length }}）
              </h3>

              <div v-if="section.phase !== 'expired' || !expiredCollapsed" class="space-y-2 pb-2">
                <!--
                  已過期的不再整列淡化。舊版要淡化，是因為已過期的混在清單裡、需要一個方法
                  讓眼睛跳過；現在它自成一段、預設收合、段落標題就寫著「已過期」，淡化變成
                  重複訊號。代價卻很實在：opacity 會讓字和底一起變淡，深色下這一列的等級
                  膠囊掉到 2.42、說明行 3.59。

                  列本身用 bg-card＋shadow-sm，跟專案的 <Card> 元件同一組：只有細框、
                  沒有底色的話，卡片是透明的、直接貼在頁面底上，看起來像沒有卡片。
                -->
                <button
                  v-for="item in grouped[section.phase]"
                  :key="item.id"
                  type="button"
                  class="flex w-full flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition"
                  :class="[
                    isSelected(item)
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:border-primary/40 hover:shadow-md',
                  ]"
                  @click="selectItem(item)"
                >
                  <div class="flex items-center gap-2">
                    <LevelBadge :level="item.level" />
                    <span class="min-w-0 flex-1 truncate font-medium">{{ item.title }}</span>
                  </div>
                  <p class="truncate text-xs text-foreground/70">
                    {{ audienceLabels[item.audience] }} · {{ placementSummaryOf(item) }}
                    <template v-if="rowTiming(item, section.phase)"> · {{ rowTiming(item, section.phase) }}</template>
                  </p>
                </button>
              </div>
            </template>
          </div>
        </template>
      </div>

      <!-- ============ 右：詳情面板（預覽＋編輯同一處，釘住） ============ -->
      <div class="lg:sticky lg:top-4 lg:self-start">
        <div
          v-if="panelMode === 'empty'"
          class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
        >
          選一則公告來預覽與編輯
        </div>

        <div v-else class="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <!-- 上半部：租客會看到的樣子，即時反映下方還沒存檔的編輯內容 -->
          <section class="space-y-3">
            <h2 class="text-sm font-semibold">租客會看到的樣子</h2>
            <p :class="summaryBoxClass">{{ draftPlacementText }}</p>

            <AnnouncementBanner v-if="showBannerSample" :announcement="previewAnnouncement" />
            <div
              v-else-if="showInboxSample"
              class="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground"
            >
              <LevelBadge :level="draft.level" prefixed />
              <span>只會顯示成通知中心裡的一則列表項目，不會有儀表板橫幅那種樣式。</span>
            </div>
          </section>

          <!-- 下半部：編輯表單 -->
          <section class="space-y-4 border-t border-border pt-5">
            <h2 class="text-sm font-semibold">{{ panelMode === 'create' ? '新增公告' : '編輯公告' }}</h2>

            <div class="space-y-2">
              <Label for="an-title">標題</Label>
              <Input id="an-title" v-model="draft.title" />
            </div>
            <div class="space-y-2">
              <Label for="an-body">內容</Label>
              <Textarea id="an-body" v-model="draft.body" rows="3" />
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label>等級</Label>
                <Select v-model="draft.level">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">一般</SelectItem>
                    <SelectItem value="warning">注意</SelectItem>
                    <SelectItem value="urgent">緊急</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="space-y-2">
                <Label>受眾</Label>
                <Select v-model="draft.audience">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="tenant">租客</SelectItem>
                    <SelectItem value="landlord">房東</SelectItem>
                  </SelectContent>
                </Select>
                <p class="text-xs text-foreground/70">「全部」目前只有租客端會顯示公告。</p>
                <!--
                  房東端目前沒有任何一行程式碼讀公告（見 announcementPlacement 的說明），
                  選了「房東」要當場講清楚，不能等存檔後才在列表發現公告根本沒送出去。
                -->
                <p
                  v-if="draftPlacement.kind === 'landlord-unsupported'"
                  :class="['rounded-lg px-2.5 py-1.5 text-xs font-medium', STATUS_CHIP_CLASS.warn]"
                >
                  這則公告目前不會出現在任何地方：房東端不顯示公告。
                </p>
              </div>
            </div>
            <div class="flex items-center justify-between rounded-xl border px-3 py-2">
              <Label class="mb-0">發布</Label>
              <Switch v-model="draft.published" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="an-start">開始日</Label>
                <Input id="an-start" v-model="draft.startAt" type="date" />
              </div>
              <div class="space-y-2">
                <Label for="an-end">結束日（可留空）</Label>
                <Input id="an-end" v-model="draft.endAt" type="date" />
              </div>
            </div>

            <div class="flex justify-end">
              <Button :disabled="!canSubmit()" @click="save">儲存</Button>
            </div>
          </section>

          <!-- 刪除：只有編輯既有公告時才看得到，新增中還沒有東西可以刪 -->
          <section v-if="panelMode === 'edit'" class="border-t border-border pt-4">
            <Button variant="outline" class="text-destructive" @click="requestDelete">刪除公告</Button>
          </section>
        </div>
      </div>
    </div>

    <!-- 放棄未儲存變更的確認 -->
    <Dialog :open="discardConfirmOpen" @update:open="(o: boolean) => { if (!o) cancelDiscard() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>放棄未儲存的變更？</DialogTitle>
          <DialogDescription>切換到別的公告會遺失目前還沒存檔的編輯內容。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="cancelDiscard">取消</Button>
          <Button variant="destructive" @click="confirmDiscard">放棄變更</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 刪除確認：沿用既有的做法 -->
    <Dialog :open="deleteTarget !== null" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除公告？</DialogTitle>
          <DialogDescription>「{{ deleteTarget?.title }}」將被永久刪除，無法復原。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="confirmDelete">確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

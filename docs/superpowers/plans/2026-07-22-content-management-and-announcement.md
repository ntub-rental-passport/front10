# 內容管理與公告連動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立後台「內容管理」模組（公告、FAQ、法律文件、Banner 四種內容類型），並讓公告連動到使用者 dashboard 頂端顯示橫幅（連動點 1）。

**Architecture:** 沿用既有後台模式（seed 型別 + composable + page），資料存 localStorage。內容管理頁以 tabs 分成四個子元件，各自呼叫同一個 `useAdminContent` composable。公告的「是否生效」抽為純函式 `isAnnouncementActive` 並以 vitest 測試；使用者 dashboard 透過 `activeAnnouncements` computed 顯示 `AnnouncementBanner`。

**Tech Stack:** Vue 3 (script setup) + TypeScript + Vite + Tailwind CSS 4 + reka-ui + vitest

**設計來源:** `docs/superpowers/specs/2026-07-22-admin-console-expansion-design.md`（第 5.2、6.3、7 節；連動點 1）

**前置狀態（已由前一份計畫完成）:** `admin-seed.ts` 已拆為 barrel；`AuditActionType` 已含 `'內容管理'`；vitest 已就緒（`environment: 'node'`，測試檔 `src/**/*.test.ts`）；`createAdminCollection(name, seed, migrate?)` 可用。

**本計畫涵蓋 spec 第 5 步。** 後台總覽的「生效中公告數」統計卡屬 spec 第 8 步（既有模組整合），不在本計畫範圍。

---

## 檔案結構

| 檔案 | 責任 |
|------|------|
| `src/mocks/admin/content.ts` | 四種內容型別與種子資料 |
| `src/utils/announcement.ts` | `isAnnouncementActive` 純函式 |
| `src/utils/announcement.test.ts` | 上者的單元測試 |
| `src/composables/admin/useAdminContent.ts` | 四種內容的 CRUD、排序、`activeAnnouncements`、稽核 |
| `src/components/AnnouncementBanner.vue` | 使用者端公告橫幅（依 level 配色） |
| `src/components/admin/content/AnnouncementsTab.vue` | 公告管理分頁 |
| `src/components/admin/content/FaqTab.vue` | FAQ 管理分頁 |
| `src/components/admin/content/LegalDocsTab.vue` | 法律文件管理分頁 |
| `src/components/admin/content/BannersTab.vue` | Banner 管理分頁 |
| `src/pages/admin/content.vue` | 內容管理頁殼（Tabs 容器） |
| `src/mocks/admin-seed.ts` | barrel 加一行 |
| `src/pages/dashboard.vue` | 加入公告橫幅（連動點 1） |
| `src/router/index.ts` | 加 `/admin/content` 子路由 |
| `src/components/admin-layout.vue` | 側邊欄加「內容管理」 |

---

## Task 1: 內容型別與種子資料

**Files:**
- Create: `src/mocks/admin/content.ts`
- Modify: `src/mocks/admin-seed.ts`（barrel 加一行）

- [ ] **Step 1: 建立型別與種子**

建立 `src/mocks/admin/content.ts`：

```ts
import { daysAgo, daysAhead } from './helpers'

export type AnnouncementLevel = 'info' | 'warning' | 'urgent'

export interface Announcement {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  published: boolean
  startAt: string
  endAt: string | null
  updatedAt: string
}

export type FaqCategory = '租屋流程' | '契約分析' | '租金補貼' | '帳號問題'

export interface FaqEntry {
  id: string
  question: string
  answer: string
  category: FaqCategory
  order: number
  published: boolean
  updatedAt: string
}

export type LegalDocSlug = 'terms' | 'privacy'

export interface LegalDoc {
  id: string
  slug: LegalDocSlug
  title: string
  body: string
  version: number
  updatedAt: string
}

export interface Banner {
  id: string
  title: string
  imageUrl: string
  linkUrl: string
  order: number
  published: boolean
  updatedAt: string
}

export function seedAnnouncements(): Announcement[] {
  return [
    {
      id: 'an-1',
      title: '系統維護預告',
      body: '本平台將於本週日凌晨 2:00–4:00 進行維護，屆時暫停服務。',
      level: 'warning',
      published: true,
      startAt: daysAgo(1),
      endAt: daysAhead(5),
      updatedAt: daysAgo(1),
    },
    {
      id: 'an-2',
      title: '租金補貼開放申請',
      body: '300 億元中央擴大租金補貼受理中，請至租補專區試算並提出申請。',
      level: 'info',
      published: true,
      startAt: daysAgo(3),
      endAt: null,
      updatedAt: daysAgo(3),
    },
    {
      id: 'an-3',
      title: '颱風假服務調整（已過期）',
      body: '颱風期間客服回覆較慢，敬請見諒。',
      level: 'urgent',
      published: true,
      startAt: daysAgo(30),
      endAt: daysAgo(20),
      updatedAt: daysAgo(30),
    },
    {
      id: 'an-4',
      title: '新功能預告（未發布）',
      body: '點交存證影像比對即將上線，敬請期待。',
      level: 'info',
      published: false,
      startAt: daysAgo(2),
      endAt: null,
      updatedAt: daysAgo(2),
    },
  ]
}

export function seedFaqs(): FaqEntry[] {
  return [
    { id: 'faq-1', question: '如何上傳租約進行分析？', answer: '於「契約分析」頁點選上傳，支援 PNG、JPG、JPEG、WEBP、BMP 圖檔。', category: '契約分析', order: 0, published: true, updatedAt: daysAgo(10) },
    { id: 'faq-2', question: '押金最多可以收幾個月？', answer: '依租賃專法，押金不得逾二個月租金總額。', category: '租屋流程', order: 1, published: true, updatedAt: daysAgo(10) },
    { id: 'faq-3', question: '租金補貼要準備什麼文件？', answer: '身分證明、租賃契約、存摺影本等，詳見租補專區的應備文件清單。', category: '租金補貼', order: 0, published: true, updatedAt: daysAgo(8) },
    { id: 'faq-4', question: '忘記密碼怎麼辦？', answer: '請於登入頁點選「忘記密碼」，系統會寄送重設連結至註冊信箱。', category: '帳號問題', order: 0, published: false, updatedAt: daysAgo(5) },
  ]
}

export function seedLegalDocs(): LegalDoc[] {
  return [
    { id: 'legal-terms', slug: 'terms', title: '服務條款', body: '歡迎使用 RentMate 租隊友。使用本服務即表示您同意以下條款……', version: 2, updatedAt: daysAgo(40) },
    { id: 'legal-privacy', slug: 'privacy', title: '隱私政策', body: '我們重視您的個人資料保護。本政策說明我們如何蒐集與使用您的資料……', version: 3, updatedAt: daysAgo(25) },
  ]
}

export function seedBanners(): Banner[] {
  return [
    { id: 'ban-1', title: '租補試算上線', imageUrl: 'https://placehold.co/1200x400/5660D6/FFFFFF?text=Subsidy', linkUrl: '/app/subsidy', order: 0, published: true, updatedAt: daysAgo(6) },
    { id: 'ban-2', title: '契約分析教學', imageUrl: 'https://placehold.co/1200x400/0E9488/FFFFFF?text=Contract', linkUrl: '/app/contract', order: 1, published: true, updatedAt: daysAgo(6) },
    { id: 'ban-3', title: '點交存證（下架中）', imageUrl: 'https://placehold.co/1200x400/D97706/FFFFFF?text=Handover', linkUrl: '/app/handover', order: 2, published: false, updatedAt: daysAgo(6) },
  ]
}
```

- [ ] **Step 2: barrel 加入 content**

在 `src/mocks/admin-seed.ts` 末端加一行：

```ts
export * from './admin/content'
```

- [ ] **Step 3: 型別檢查**

Run: `npm run lint:types`
Expected: 無錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/mocks/admin/content.ts src/mocks/admin-seed.ts
git commit -m "feat: add content management seed data and types"
```
（commit 訊息不加任何 Co-Authored-By；作者為既有 git 設定 11246017。以下所有 commit 皆同。）

---

## Task 2: isAnnouncementActive 純函式（TDD）

**Files:**
- Create: `src/utils/announcement.test.ts`
- Create: `src/utils/announcement.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `src/utils/announcement.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { isAnnouncementActive } from './announcement'
import type { Announcement } from '@/src/mocks/admin/content'

function make(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a',
    title: 't',
    body: 'b',
    level: 'info',
    published: true,
    startAt: '2026-07-01T00:00:00.000Z',
    endAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const now = new Date('2026-07-15T00:00:00.000Z')

describe('isAnnouncementActive', () => {
  it('已發布且在區間內為生效', () => {
    expect(isAnnouncementActive(make(), now)).toBe(true)
  })

  it('未發布一律不生效', () => {
    expect(isAnnouncementActive(make({ published: false }), now)).toBe(false)
  })

  it('尚未到 startAt 不生效', () => {
    expect(isAnnouncementActive(make({ startAt: '2026-07-20T00:00:00.000Z' }), now)).toBe(false)
  })

  it('已超過 endAt 不生效', () => {
    expect(isAnnouncementActive(make({ endAt: '2026-07-10T00:00:00.000Z' }), now)).toBe(false)
  })

  it('endAt 為 null 表示永久有效', () => {
    expect(isAnnouncementActive(make({ endAt: null }), now)).toBe(true)
  })

  it('now 正好等於 startAt 視為生效', () => {
    expect(isAnnouncementActive(make({ startAt: '2026-07-15T00:00:00.000Z' }), now)).toBe(true)
  })

  it('now 正好等於 endAt 視為生效', () => {
    expect(isAnnouncementActive(make({ endAt: '2026-07-15T00:00:00.000Z' }), now)).toBe(true)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，找不到 `./announcement` 模組。

- [ ] **Step 3: 實作**

建立 `src/utils/announcement.ts`：

```ts
import type { Announcement } from '@/src/mocks/admin/content'

export function isAnnouncementActive(a: Announcement, now: Date): boolean {
  if (!a.published) return false
  const current = now.getTime()
  if (current < new Date(a.startAt).getTime()) return false
  if (a.endAt !== null && current > new Date(a.endAt).getTime()) return false
  return true
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS，`announcement.test.ts` 的 7 個測試全通過，settings 的 16 個仍通過（共 23）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/announcement.ts src/utils/announcement.test.ts
git commit -m "feat: add isAnnouncementActive with unit tests"
```

---

## Task 3: useAdminContent composable

**Files:**
- Create: `src/composables/admin/useAdminContent.ts`

- [ ] **Step 1: 建立 composable**

建立 `src/composables/admin/useAdminContent.ts`：

```ts
import { computed } from 'vue'
import { createAdminCollection, newId } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { isAnnouncementActive } from '@/src/utils/announcement'
import {
  seedAnnouncements,
  seedBanners,
  seedFaqs,
  seedLegalDocs,
  type Announcement,
  type Banner,
  type FaqEntry,
  type LegalDoc,
} from '@/src/mocks/admin-seed'

const announcements = createAdminCollection<Announcement[]>('content-announcements', seedAnnouncements)
const faqs = createAdminCollection<FaqEntry[]>('content-faqs', seedFaqs)
const legalDocs = createAdminCollection<LegalDoc[]>('content-legal', seedLegalDocs)
const banners = createAdminCollection<Banner[]>('content-banners', seedBanners)

function nowIso(): string {
  return new Date().toISOString()
}

function move<T extends { id: string; order: number }>(list: T[], id: string, direction: 'up' | 'down'): void {
  const sorted = [...list].sort((a, b) => a.order - b.order)
  const index = sorted.findIndex((item) => item.id === id)
  if (index === -1) return
  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= sorted.length) return
  const a = sorted[index]
  const b = sorted[swapWith]
  const temp = a.order
  a.order = b.order
  b.order = temp
}

export function useAdminContent() {
  const { logAction } = useAdminAudit()

  const activeAnnouncements = computed(() => {
    const now = new Date()
    return announcements.value
      .filter((item) => isAnnouncementActive(item, now))
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
  })

  // --- 公告 ---
  function saveAnnouncement(input: Omit<Announcement, 'id' | 'updatedAt'> & { id?: string }): void {
    if (input.id) {
      const target = announcements.value.find((item) => item.id === input.id)
      if (!target) return
      Object.assign(target, input, { updatedAt: nowIso() })
      logAction('內容管理', '公告', `更新公告「${input.title}」`)
    } else {
      announcements.value.unshift({ ...input, id: newId('an'), updatedAt: nowIso() })
      logAction('內容管理', '公告', `新增公告「${input.title}」`)
    }
  }

  function removeAnnouncement(id: string): void {
    const target = announcements.value.find((item) => item.id === id)
    if (!target) return
    announcements.value = announcements.value.filter((item) => item.id !== id)
    logAction('內容管理', '公告', `刪除公告「${target.title}」`)
  }

  // --- FAQ ---
  function saveFaq(input: Omit<FaqEntry, 'id' | 'updatedAt' | 'order'> & { id?: string; order?: number }): void {
    if (input.id) {
      const target = faqs.value.find((item) => item.id === input.id)
      if (!target) return
      Object.assign(target, input, { updatedAt: nowIso() })
      logAction('內容管理', 'FAQ', `更新問答「${input.question}」`)
    } else {
      const maxOrder = faqs.value.reduce((max, item) => Math.max(max, item.order), -1)
      faqs.value.push({ ...input, order: maxOrder + 1, id: newId('faq'), updatedAt: nowIso() })
      logAction('內容管理', 'FAQ', `新增問答「${input.question}」`)
    }
  }

  function removeFaq(id: string): void {
    const target = faqs.value.find((item) => item.id === id)
    if (!target) return
    faqs.value = faqs.value.filter((item) => item.id !== id)
    logAction('內容管理', 'FAQ', `刪除問答「${target.question}」`)
  }

  function moveFaq(id: string, direction: 'up' | 'down'): void {
    move(faqs.value, id, direction)
  }

  // --- 法律文件 ---
  function saveLegalDoc(id: string, title: string, body: string): void {
    const target = legalDocs.value.find((item) => item.id === id)
    if (!target) return
    target.title = title
    target.body = body
    target.version += 1
    target.updatedAt = nowIso()
    logAction('內容管理', '法律文件', `更新「${title}」至 v${target.version}`)
  }

  // --- Banner ---
  function saveBanner(input: Omit<Banner, 'id' | 'updatedAt' | 'order'> & { id?: string; order?: number }): void {
    if (input.id) {
      const target = banners.value.find((item) => item.id === input.id)
      if (!target) return
      Object.assign(target, input, { updatedAt: nowIso() })
      logAction('內容管理', 'Banner', `更新輪播「${input.title}」`)
    } else {
      const maxOrder = banners.value.reduce((max, item) => Math.max(max, item.order), -1)
      banners.value.push({ ...input, order: maxOrder + 1, id: newId('ban'), updatedAt: nowIso() })
      logAction('內容管理', 'Banner', `新增輪播「${input.title}」`)
    }
  }

  function removeBanner(id: string): void {
    const target = banners.value.find((item) => item.id === id)
    if (!target) return
    banners.value = banners.value.filter((item) => item.id !== id)
    logAction('內容管理', 'Banner', `刪除輪播「${target.title}」`)
  }

  function moveBanner(id: string, direction: 'up' | 'down'): void {
    move(banners.value, id, direction)
  }

  return {
    announcements,
    faqs,
    legalDocs,
    banners,
    activeAnnouncements,
    saveAnnouncement,
    removeAnnouncement,
    saveFaq,
    removeFaq,
    moveFaq,
    saveLegalDoc,
    saveBanner,
    removeBanner,
    moveBanner,
  }
}
```

- [ ] **Step 2: 型別檢查與測試**

Run: `npm run lint:types && npm test`
Expected: 型別無錯誤，23 個測試通過。

- [ ] **Step 3: Commit**

```bash
git add src/composables/admin/useAdminContent.ts
git commit -m "feat: add content management composable"
```

---

## Task 4: 公告橫幅元件與 dashboard 連動（連動點 1）

**Files:**
- Create: `src/components/AnnouncementBanner.vue`
- Modify: `src/pages/dashboard.vue`
- Modify: `src/router/index.ts`
- Modify: `src/components/admin-layout.vue`

- [ ] **Step 1: 建立橫幅元件**

建立 `src/components/AnnouncementBanner.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Info, TriangleAlert, Megaphone } from 'lucide-vue-next'
import type { Announcement } from '@/src/mocks/admin/content'

const props = defineProps<{ announcement: Announcement }>()

const styleMap = {
  info: { wrap: 'border-primary/30 bg-primary/5 text-foreground', icon: 'text-primary', comp: Info },
  warning: { wrap: 'border-amber-300 bg-amber-50 text-amber-900', icon: 'text-amber-600', comp: TriangleAlert },
  urgent: { wrap: 'border-destructive/40 bg-destructive/5 text-destructive', icon: 'text-destructive', comp: Megaphone },
} as const

const style = computed(() => styleMap[props.announcement.level])
</script>

<template>
  <div :class="['flex items-start gap-3 rounded-2xl border p-4', style.wrap]">
    <component :is="style.comp" :class="['mt-0.5 h-5 w-5 shrink-0', style.icon]" />
    <div class="min-w-0">
      <p class="font-semibold">{{ announcement.title }}</p>
      <p class="mt-0.5 text-sm opacity-90">{{ announcement.body }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: dashboard 顯示橫幅**

修改 `src/pages/dashboard.vue`。

在 `<script setup>` 的 import 區塊末端（最後一個 import 之後）加入：

```ts
import AnnouncementBanner from '@/src/components/AnnouncementBanner.vue'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'

const { activeAnnouncements } = useAdminContent()
```

在 `<template>` 中，第一個 `<div class="flex min-h-full min-w-0 flex-col gap-5 pb-6">`（位於 `src/pages/dashboard.vue:68`）開標籤的**正下方**、成為它的第一個子元素，插入：

```vue
    <div v-if="activeAnnouncements.length > 0" class="flex flex-col gap-3">
      <AnnouncementBanner
        v-for="item in activeAnnouncements"
        :key="item.id"
        :announcement="item"
      />
    </div>
```

- [ ] **Step 3: 加入 /admin/content 路由**

在 `src/router/index.ts` 的 `/admin` 的 `children` 陣列中，於 `review` 子路由之後加入：

```ts
        { path: 'content', component: () => import('@/src/pages/admin/content.vue') },
```

- [ ] **Step 4: 側邊欄加入內容管理**

在 `src/components/admin-layout.vue` 的 `lucide-vue-next` import 中加入 `Megaphone`（依字母序，位於 `LayoutDashboard` 與 `ScrollText` 之間）。

在 `adminNavItems` 陣列中，於「物件與評價審核」（`ClipboardCheck`）那一項之後插入：

```ts
  { label: '內容管理', path: '/admin/content', icon: Megaphone },
```

- [ ] **Step 5: 建立佔位頁避免路由 404**

因為 content 頁在 Task 5 才建立，本步驟先建立最小可編譯的 `src/pages/admin/content.vue`，讓路由與 dev server 能通過編譯：

```vue
<script setup lang="ts">
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-3xl font-black tracking-tight">內容管理</h1>
    <p class="text-muted-foreground">建置中……</p>
  </div>
</template>
```

（Task 5 會用完整內容取代此檔。）

- [ ] **Step 6: 型別檢查與測試**

Run: `npm run lint:types && npm test`
Expected: 型別無錯誤，23 個測試通過。

- [ ] **Step 7: Commit**

```bash
git add src/components/AnnouncementBanner.vue src/pages/dashboard.vue src/router/index.ts src/components/admin-layout.vue src/pages/admin/content.vue
git commit -m "feat: show active announcements on user dashboard"
```

---

## Task 5: 內容管理頁殼與公告分頁

**Files:**
- Create: `src/components/admin/content/AnnouncementsTab.vue`
- Modify: `src/pages/admin/content.vue`（以完整內容取代 Task 4 的佔位）

- [ ] **Step 1: 建立公告分頁元件**

建立 `src/components/admin/content/AnnouncementsTab.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import { formatDate } from '@/src/utils/admin-format'
import type { Announcement, AnnouncementLevel } from '@/src/mocks/admin/content'

const { announcements, saveAnnouncement, removeAnnouncement } = useAdminContent()

const levelLabels: Record<AnnouncementLevel, string> = {
  info: '一般',
  warning: '注意',
  urgent: '緊急',
}

const dialogOpen = ref(false)
const deleteTarget = ref<Announcement | null>(null)

interface DraftState {
  id?: string
  title: string
  body: string
  level: AnnouncementLevel
  published: boolean
  startAt: string
  endAt: string
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString()
}

const draft = ref<DraftState>(emptyDraft())

function emptyDraft(): DraftState {
  return {
    title: '',
    body: '',
    level: 'info',
    published: true,
    startAt: toDateInput(new Date().toISOString()),
    endAt: '',
  }
}

function openCreate(): void {
  draft.value = emptyDraft()
  dialogOpen.value = true
}

function openEdit(item: Announcement): void {
  draft.value = {
    id: item.id,
    title: item.title,
    body: item.body,
    level: item.level,
    published: item.published,
    startAt: toDateInput(item.startAt),
    endAt: item.endAt ? toDateInput(item.endAt) : '',
  }
  dialogOpen.value = true
}

function submit(): void {
  saveAnnouncement({
    id: draft.value.id,
    title: draft.value.title,
    body: draft.value.body,
    level: draft.value.level,
    published: draft.value.published,
    startAt: fromDateInput(draft.value.startAt),
    endAt: draft.value.endAt ? fromDateInput(draft.value.endAt) : null,
  })
  dialogOpen.value = false
}

function confirmDelete(): void {
  if (deleteTarget.value) removeAnnouncement(deleteTarget.value.id)
  deleteTarget.value = null
}

const canSubmit = () => draft.value.title.trim() !== '' && draft.value.body.trim() !== '' && draft.value.startAt !== ''
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <Button @click="openCreate">新增公告</Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>標題</TableHead>
          <TableHead>等級</TableHead>
          <TableHead>狀態</TableHead>
          <TableHead>生效期間</TableHead>
          <TableHead class="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="item in announcements" :key="item.id">
          <TableCell class="font-medium">{{ item.title }}</TableCell>
          <TableCell>{{ levelLabels[item.level] }}</TableCell>
          <TableCell>
            <Badge :variant="item.published ? 'default' : 'secondary'">
              {{ item.published ? '已發布' : '未發布' }}
            </Badge>
          </TableCell>
          <TableCell class="text-sm text-muted-foreground">
            {{ formatDate(item.startAt) }} ～ {{ item.endAt ? formatDate(item.endAt) : '長期' }}
          </TableCell>
          <TableCell class="text-right">
            <div class="flex justify-end gap-2">
              <Button variant="outline" size="sm" @click="openEdit(item)">編輯</Button>
              <Button variant="destructive" size="sm" @click="deleteTarget = item">刪除</Button>
            </div>
          </TableCell>
        </TableRow>
        <TableRow v-if="announcements.length === 0">
          <TableCell colspan="5" class="py-8 text-center text-muted-foreground">尚無公告。</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯公告' : '新增公告' }}</DialogTitle>
          <DialogDescription>公告會顯示在使用者工作區頂端。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="an-title">標題</Label>
            <Input id="an-title" v-model="draft.title" />
          </div>
          <div class="space-y-2">
            <Label for="an-body">內容</Label>
            <Textarea id="an-body" v-model="draft.body" rows="3" />
          </div>
          <div class="grid grid-cols-2 gap-4">
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
            <div class="flex items-center justify-between rounded-xl border px-3">
              <Label class="mb-0">發布</Label>
              <Switch v-model="draft.published" />
            </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
```

- [ ] **Step 2: 建立內容管理頁殼（僅公告分頁）**

以下列完整內容**取代** `src/pages/admin/content.vue`（Task 4 建立的佔位版）。此版只掛載公告分頁，讓 Task 5 能獨立通過編譯；Task 6 會把 FAQ／法律文件／Banner 三個分頁加回：

```vue
<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import AnnouncementsTab from '@/src/components/admin/content/AnnouncementsTab.vue'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">內容管理</h1>
      <p class="mt-1 text-muted-foreground">管理公告、常見問題、法律文件與首頁輪播。</p>
    </div>

    <Tabs default-value="announcements">
      <TabsList>
        <TabsTrigger value="announcements">公告</TabsTrigger>
      </TabsList>
      <TabsContent value="announcements" class="mt-4"><AnnouncementsTab /></TabsContent>
    </Tabs>
  </div>
</template>
```

- [ ] **Step 3: 型別檢查與測試**

Run: `npm run lint:types && npm test`
Expected: 型別無錯誤（此版 content.vue 只依賴 AnnouncementsTab），23 個測試通過。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/content/AnnouncementsTab.vue src/pages/admin/content.vue
git commit -m "feat: add announcements management tab"
```

---

## Task 6: FAQ、法律文件、Banner 三個分頁

**Files:**
- Create: `src/components/admin/content/FaqTab.vue`
- Create: `src/components/admin/content/LegalDocsTab.vue`
- Create: `src/components/admin/content/BannersTab.vue`
- Modify: `src/pages/admin/content.vue`（加回三個 tab）

- [ ] **Step 1: 建立 FaqTab**

建立 `src/components/admin/content/FaqTab.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
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
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import type { FaqCategory, FaqEntry } from '@/src/mocks/admin/content'

const { faqs, saveFaq, removeFaq, moveFaq } = useAdminContent()

const categories: FaqCategory[] = ['租屋流程', '契約分析', '租金補貼', '帳號問題']

const grouped = computed(() =>
  categories.map((category) => ({
    category,
    items: faqs.value
      .filter((item) => item.category === category)
      .sort((a, b) => a.order - b.order),
  })),
)

const dialogOpen = ref(false)
const deleteTarget = ref<FaqEntry | null>(null)

interface DraftState {
  id?: string
  question: string
  answer: string
  category: FaqCategory
  published: boolean
}

const draft = ref<DraftState>(emptyDraft())

function emptyDraft(): DraftState {
  return { question: '', answer: '', category: '租屋流程', published: true }
}

function openCreate(): void {
  draft.value = emptyDraft()
  dialogOpen.value = true
}

function openEdit(item: FaqEntry): void {
  draft.value = {
    id: item.id,
    question: item.question,
    answer: item.answer,
    category: item.category,
    published: item.published,
  }
  dialogOpen.value = true
}

function submit(): void {
  saveFaq({ ...draft.value })
  dialogOpen.value = false
}

function confirmDelete(): void {
  if (deleteTarget.value) removeFaq(deleteTarget.value.id)
  deleteTarget.value = null
}

const canSubmit = () => draft.value.question.trim() !== '' && draft.value.answer.trim() !== ''
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-end">
      <Button @click="openCreate">新增問答</Button>
    </div>

    <div v-for="group in grouped" :key="group.category" class="space-y-2">
      <h3 class="text-sm font-semibold text-muted-foreground">{{ group.category }}</h3>
      <div v-if="group.items.length === 0" class="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        此分類尚無問答。
      </div>
      <div
        v-for="(item, index) in group.items"
        :key="item.id"
        class="flex items-start justify-between gap-3 rounded-2xl border bg-muted/10 p-4"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="font-medium">{{ item.question }}</p>
            <Badge :variant="item.published ? 'default' : 'secondary'">
              {{ item.published ? '已發布' : '未發布' }}
            </Badge>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">{{ item.answer }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" :disabled="index === 0" @click="moveFaq(item.id, 'up')">
            <ChevronUp class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" :disabled="index === group.items.length - 1" @click="moveFaq(item.id, 'down')">
            <ChevronDown class="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" @click="openEdit(item)">編輯</Button>
          <Button variant="destructive" size="sm" @click="deleteTarget = item">刪除</Button>
        </div>
      </div>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯問答' : '新增問答' }}</DialogTitle>
          <DialogDescription>常見問題會顯示於使用者說明頁。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="faq-q">問題</Label>
            <Input id="faq-q" v-model="draft.question" />
          </div>
          <div class="space-y-2">
            <Label for="faq-a">回答</Label>
            <Textarea id="faq-a" v-model="draft.answer" rows="3" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>分類</Label>
              <Select v-model="draft.category">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in categories" :key="c" :value="c">{{ c }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex items-center justify-between rounded-xl border px-3">
              <Label class="mb-0">發布</Label>
              <Switch v-model="draft.published" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除問答？</DialogTitle>
          <DialogDescription>「{{ deleteTarget?.question }}」將被永久刪除。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="confirmDelete">確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 2: 建立 LegalDocsTab**

建立 `src/components/admin/content/LegalDocsTab.vue`：

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Textarea } from '@/components/ui/textarea/index'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import { formatDateTime } from '@/src/utils/admin-format'

const { legalDocs, saveLegalDoc } = useAdminContent()

const drafts = reactive<Record<string, { title: string; body: string }>>({})

for (const doc of legalDocs.value) {
  drafts[doc.id] = { title: doc.title, body: doc.body }
}

function isDirty(id: string, title: string, body: string): boolean {
  return drafts[id] && (drafts[id].title !== title || drafts[id].body !== body)
}

function save(id: string): void {
  saveLegalDoc(id, drafts[id].title, drafts[id].body)
}
</script>

<template>
  <div class="space-y-6">
    <Card v-for="doc in legalDocs" :key="doc.id" class="rounded-[1.5rem]">
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>{{ doc.title }}</CardTitle>
            <CardDescription>目前版本 v{{ doc.version }}｜最後更新 {{ formatDateTime(doc.updatedAt) }}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label :for="`legal-title-${doc.id}`">標題</Label>
          <Input :id="`legal-title-${doc.id}`" v-model="drafts[doc.id].title" />
        </div>
        <div class="space-y-2">
          <Label :for="`legal-body-${doc.id}`">內容</Label>
          <Textarea :id="`legal-body-${doc.id}`" v-model="drafts[doc.id].body" rows="6" />
        </div>
        <div class="flex justify-end">
          <Button :disabled="!isDirty(doc.id, doc.title, doc.body)" @click="save(doc.id)">
            儲存並發布新版本
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 3: 建立 BannersTab**

建立 `src/components/admin/content/BannersTab.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
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
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import type { Banner } from '@/src/mocks/admin/content'

const { banners, saveBanner, removeBanner, moveBanner } = useAdminContent()

const ordered = computed(() => [...banners.value].sort((a, b) => a.order - b.order))

const dialogOpen = ref(false)
const deleteTarget = ref<Banner | null>(null)

interface DraftState {
  id?: string
  title: string
  imageUrl: string
  linkUrl: string
  published: boolean
}

const draft = ref<DraftState>(emptyDraft())

function emptyDraft(): DraftState {
  return { title: '', imageUrl: '', linkUrl: '', published: true }
}

function openCreate(): void {
  draft.value = emptyDraft()
  dialogOpen.value = true
}

function openEdit(item: Banner): void {
  draft.value = {
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    published: item.published,
  }
  dialogOpen.value = true
}

function submit(): void {
  saveBanner({ ...draft.value })
  dialogOpen.value = false
}

function confirmDelete(): void {
  if (deleteTarget.value) removeBanner(deleteTarget.value.id)
  deleteTarget.value = null
}

const canSubmit = () => draft.value.title.trim() !== '' && draft.value.imageUrl.trim() !== ''
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <Button @click="openCreate">新增輪播</Button>
    </div>

    <div v-if="ordered.length === 0" class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      尚無輪播圖。
    </div>

    <div
      v-for="(item, index) in ordered"
      :key="item.id"
      class="flex items-center gap-4 rounded-2xl border bg-muted/10 p-4"
    >
      <img :src="item.imageUrl" :alt="item.title" class="h-16 w-28 shrink-0 rounded-lg object-cover" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="font-medium">{{ item.title }}</p>
          <Badge :variant="item.published ? 'default' : 'secondary'">
            {{ item.published ? '已發布' : '未發布' }}
          </Badge>
        </div>
        <p class="mt-1 truncate text-sm text-muted-foreground">{{ item.linkUrl }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" :disabled="index === 0" @click="moveBanner(item.id, 'up')">
          <ChevronUp class="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" :disabled="index === ordered.length - 1" @click="moveBanner(item.id, 'down')">
          <ChevronDown class="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" @click="openEdit(item)">編輯</Button>
        <Button variant="destructive" size="sm" @click="deleteTarget = item">刪除</Button>
      </div>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯輪播' : '新增輪播' }}</DialogTitle>
          <DialogDescription>圖片以外部網址提供，右側即時預覽。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="ban-title">標題</Label>
            <Input id="ban-title" v-model="draft.title" />
          </div>
          <div class="space-y-2">
            <Label for="ban-image">圖片網址</Label>
            <Input id="ban-image" v-model="draft.imageUrl" placeholder="https://..." />
          </div>
          <div v-if="draft.imageUrl" class="overflow-hidden rounded-xl border">
            <img :src="draft.imageUrl" alt="預覽" class="max-h-40 w-full object-cover" />
          </div>
          <div class="space-y-2">
            <Label for="ban-link">連結網址</Label>
            <Input id="ban-link" v-model="draft.linkUrl" placeholder="/app/..." />
          </div>
          <div class="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label class="mb-0">發布</Label>
            <Switch v-model="draft.published" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除輪播？</DialogTitle>
          <DialogDescription>「{{ deleteTarget?.title }}」將被永久刪除。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="confirmDelete">確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 4: content.vue 加回三個 tab**

以下列完整內容取代 `src/pages/admin/content.vue`（即 Task 5 Step 2 的四分頁完整版）：

```vue
<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import AnnouncementsTab from '@/src/components/admin/content/AnnouncementsTab.vue'
import FaqTab from '@/src/components/admin/content/FaqTab.vue'
import LegalDocsTab from '@/src/components/admin/content/LegalDocsTab.vue'
import BannersTab from '@/src/components/admin/content/BannersTab.vue'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">內容管理</h1>
      <p class="mt-1 text-muted-foreground">管理公告、常見問題、法律文件與首頁輪播。</p>
    </div>

    <Tabs default-value="announcements">
      <TabsList>
        <TabsTrigger value="announcements">公告</TabsTrigger>
        <TabsTrigger value="faq">常見問題</TabsTrigger>
        <TabsTrigger value="legal">法律文件</TabsTrigger>
        <TabsTrigger value="banner">首頁輪播</TabsTrigger>
      </TabsList>
      <TabsContent value="announcements" class="mt-4"><AnnouncementsTab /></TabsContent>
      <TabsContent value="faq" class="mt-4"><FaqTab /></TabsContent>
      <TabsContent value="legal" class="mt-4"><LegalDocsTab /></TabsContent>
      <TabsContent value="banner" class="mt-4"><BannersTab /></TabsContent>
    </Tabs>
  </div>
</template>
```

- [ ] **Step 5: 型別檢查與測試**

Run: `npm run lint:types && npm test`
Expected: 型別無錯誤，23 個測試通過。

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/content/FaqTab.vue src/components/admin/content/LegalDocsTab.vue src/components/admin/content/BannersTab.vue src/pages/admin/content.vue
git commit -m "feat: add FAQ, legal docs, and banner management tabs"
```

---

## 完成標準

- [ ] `npm run lint:types` 無錯誤
- [ ] `npm test` 23 個測試通過（settings 16 + announcement 7）
- [ ] 後台 `/admin/content` 四個分頁皆可新增／編輯／刪除／排序
- [ ] 法律文件儲存後 version 遞增
- [ ] Banner 以網址預覽、可排序
- [ ] 使用者 `/app` dashboard 頂端顯示生效中的公告橫幅（連動點 1）
- [ ] 後台新增一則「已發布、生效中」的公告後，`/app` 立即出現對應橫幅

## 手動驗證（連動點 1）

實作完成後，由控制端於瀏覽器驗證：

1. 以管理員登入，進 `/admin/content` → 公告分頁列出 4 筆種子公告
2. 新增一則公告（已發布、開始日為今天、結束日留空）→ 列表出現該筆
3. 前往 `/app`（使用者 dashboard）→ 頂端出現剛新增的公告橫幅，配色符合等級
4. 回後台把該公告改為「未發布」並儲存 → `/app` 該橫幅消失
5. 確認過期公告（種子 an-3）與未發布公告（an-4）**不**顯示於 `/app`
6. FAQ 分頁：新增、上下移動排序、刪除皆正常
7. 法律文件：編輯內容並儲存 → version +1、更新時間變動
8. Banner：貼上圖片網址即時預覽、排序、刪除正常
9. 前往 `/admin/audit` → 上述操作皆有「內容管理」稽核紀錄

## 後續計畫

1. **權限與角色 RBAC + 側邊欄分群**（spec 第 6 步）
2. **通知模板 + renderTemplate**（spec 第 7 步）
3. **既有模組整合**（spec 第 8 步，含後台總覽的公告統計卡）

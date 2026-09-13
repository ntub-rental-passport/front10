# React 19 → Vue 3 全專案遷移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將租隊友 RentMate 前端從 React 19 完整遷移至 Vue 3，保留所有功能並優化架構。

**Architecture:** 使用 Vue 3 Composition API（`<script setup lang="ts">`）+ Vue Router 4 + shadcn-vue（Reka UI）。路由定義獨立至 `src/router/index.ts`，導覽邏輯抽離至 `src/composables/useNavigation.ts`，所有頁面改寫為 `.vue` SFC。

**Tech Stack:** Vue 3.5, Vite 6, TypeScript 5.8, Tailwind CSS v4, shadcn-vue (Reka UI), Vue Router 4, lucide-vue-next, @vueuse/core

---

## 檔案對照

| 舊檔案（React） | 新檔案（Vue） |
|---|---|
| `src/main.tsx` | `src/main.ts` |
| `src/App.tsx` | `src/App.vue` |
| `src/components/layout.tsx` | `src/components/layout.vue` |
| `src/pages/dashboard.tsx` | `src/pages/dashboard.vue` |
| `src/pages/contract.tsx` | `src/pages/contract.vue` |
| `src/pages/subsidy.tsx` | `src/pages/subsidy.vue` + `src/components/subsidy/*.vue` |
| `src/pages/garbage.tsx` | `src/pages/garbage.vue` |
| `src/pages/handover.tsx` | `src/pages/handover.vue` |
| `src/pages/outage.tsx` | `src/pages/outage.vue` |
| `src/pages/notes.tsx` | `src/pages/notes.vue` |
| `src/pages/account.tsx` | `src/pages/account.vue` |
| `components/ui/*.tsx` (16 個) | `components/ui/*.vue`（由 shadcn-vue CLI 生成） |
| `vite.config.ts` | `vite.config.ts`（修改） |
| `tsconfig.json` | `tsconfig.json`（修改） |
| `package.json` | `package.json`（修改） |
| `index.html` | `index.html`（修改） |
| 新增 | `src/router/index.ts` |
| 新增 | `src/composables/useNavigation.ts` |

---

## Task 1: 更新設定檔（package.json、vite.config.ts、tsconfig.json、index.html）

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Modify: `index.html`
- Modify: `src/index.css`

- [ ] **Step 1: 更新 package.json — 移除 React 依賴、加入 Vue 依賴**

將 `package.json` 完整替換為以下內容：

```json
{
  "name": "vue-rentmate",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@fontsource-variable/geist": "^5.2.8",
    "@google/genai": "^1.29.0",
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-vue": "^5.2.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "lucide-vue-next": "^0.513.0",
    "motion": "^12.23.24",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0",
    "vite": "^6.2.0",
    "vue": "^3.5.13",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "tsx": "^4.21.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0",
    "vue-tsc": "^2.2.0"
  }
}
```

> 注意：`reka-ui`、`@vueuse/core` 等 shadcn-vue 底層依賴將由 Task 2 的 CLI 自動加入，不需要手動指定版本。

- [ ] **Step 2: 更新 vite.config.ts — 換用 @vitejs/plugin-vue**

```ts
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [vue(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
```

- [ ] **Step 3: 更新 tsconfig.json — 設定 Vue 型別支援**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "preserve",
    "jsxImportSource": "vue",
    "paths": {
      "@/*": ["./*"]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

- [ ] **Step 4: 更新 index.html — 修改 title 與入口腳本**

```html
<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>租隊友 RentMate</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

> 注意：掛載 id 從 `root` 改為 `app`（Vue 慣例），入口從 `main.tsx` 改為 `main.ts`。

- [ ] **Step 5: 修改 src/index.css — 移除 shadcn React 的 CSS import**

移除第 3 行 `@import "shadcn/tailwind.css";`，因為 `shadcn` npm 套件（React 版）將被移除。其餘內容不變。

修改後第 1-5 行應為：
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@fontsource-variable/geist";

@custom-variant dark (&:is(.dark *));
```

- [ ] **Step 6: 安裝依賴**

```bash
npm install
```

預期輸出：安裝完成，無 peer dependency 錯誤。

- [ ] **Step 7: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html src/index.css
git commit -m "chore: replace React dependencies with Vue 3 core stack"
```

---

## Task 2: 初始化 shadcn-vue 並生成所有 UI 元件

**Files:**
- Create/Modify: `components.json`
- Create: `components/ui/*.vue`（16 個元件）

- [ ] **Step 1: 執行 shadcn-vue init**

```bash
npx shadcn-vue@latest init
```

CLI 會詢問以下問題，依序回答：

| 問題 | 回答 |
|---|---|
| Would you like to use TypeScript? | `yes` |
| Which framework are you using? | `Vite` |
| Where is your global CSS file? | `src/index.css` |
| Would you like to use CSS variables for theming? | `yes` |
| Are you using a custom tailwind prefix (eg. tw-)? | （直接 Enter，不填）|
| Configure the import alias for components | `@/components` |
| Configure the import alias for utils | `@/lib/utils` |
| Are you using React Server Components? | `no` |

執行完成後會自動安裝 `reka-ui`、`@vueuse/core`、`lucide-vue-next` 等依賴並更新 `components.json`。

> 如果 CLI 警告 Tailwind v4 相關問題，請繼續進行，CSS 變數已在 `src/index.css` 中完整定義，不需要重新設定。

- [ ] **Step 2: 新增所有需要的 UI 元件**

```bash
npx shadcn-vue@latest add avatar badge button card checkbox dialog input label progress radio-group scroll-area select separator sheet skeleton switch table tabs textarea toggle toggle-group
```

預期輸出：16 個元件逐一生成至 `components/ui/` 目錄。

- [ ] **Step 3: 確認元件已生成**

```bash
ls components/ui/
```

預期輸出包含：`avatar.vue`、`badge.vue`、`button.vue`、`card.vue`、`checkbox.vue`、`dialog.vue`、`input.vue`、`label.vue`、`progress.vue`、`radio-group.vue`、`scroll-area.vue`、`select.vue`、`separator.vue`、`sheet.vue`、`skeleton.vue`、`switch.vue`、`table.vue`、`tabs.vue`、`textarea.vue`、`toggle.vue`、`toggle-group.vue`

- [ ] **Step 4: Commit**

```bash
git add components/ui/ components.json package.json package-lock.json
git commit -m "feat: initialize shadcn-vue and generate all UI components"
```

---

## Task 3: 刪除所有 React 原始碼

**Files:**
- Delete: `src/main.tsx`
- Delete: `src/App.tsx`
- Delete: `src/components/layout.tsx`
- Delete: `src/pages/*.tsx`（8 個）

- [ ] **Step 1: 刪除所有 React .tsx 檔案**

```bash
rm src/main.tsx src/App.tsx src/components/layout.tsx
rm src/pages/dashboard.tsx src/pages/contract.tsx src/pages/subsidy.tsx
rm src/pages/garbage.tsx src/pages/handover.tsx src/pages/outage.tsx
rm src/pages/notes.tsx src/pages/account.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove all React .tsx source files"
```

---

## Task 4: 建立路由與 Composable 基礎設施

**Files:**
- Create: `src/router/index.ts`
- Create: `src/composables/useNavigation.ts`

- [ ] **Step 1: 建立 src/router/index.ts**

```ts
import { createRouter, createWebHistory } from 'vue-router'
import Layout from '@/src/components/layout.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: Layout,
      children: [
        { path: '', component: () => import('@/src/pages/dashboard.vue') },
        { path: 'contract', component: () => import('@/src/pages/contract.vue') },
        { path: 'subsidy', component: () => import('@/src/pages/subsidy.vue') },
        { path: 'garbage', component: () => import('@/src/pages/garbage.vue') },
        { path: 'handover', component: () => import('@/src/pages/handover.vue') },
        { path: 'outage', component: () => import('@/src/pages/outage.vue') },
        { path: 'notes', component: () => import('@/src/pages/notes.vue') },
        { path: 'account', component: () => import('@/src/pages/account.vue') },
      ],
    },
  ],
})

export default router
```

- [ ] **Step 2: 建立 src/composables/useNavigation.ts**

```ts
import { Home, FileText, PiggyBank, Trash2, CheckSquare, Zap, ClipboardList, User } from 'lucide-vue-next'

export interface NavItem {
  icon: typeof Home
  label: string
  path: string
}

export function useNavigation() {
  const navItems: NavItem[] = [
    { icon: Home, label: '總覽', path: '/' },
    { icon: FileText, label: '契約分析', path: '/contract' },
    { icon: PiggyBank, label: '租金補貼', path: '/subsidy' },
    { icon: Trash2, label: '垃圾清運', path: '/garbage' },
    { icon: CheckSquare, label: '點交清單', path: '/handover' },
    { icon: Zap, label: '停水停電', path: '/outage' },
    { icon: ClipboardList, label: '記事板', path: '/notes' },
    { icon: User, label: '我的帳戶', path: '/account' },
  ]

  return { navItems }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/router/index.ts src/composables/useNavigation.ts
git commit -m "feat: add Vue Router configuration and useNavigation composable"
```

---

## Task 5: 建立應用程式入口與 App.vue

**Files:**
- Create: `src/main.ts`
- Create: `src/App.vue`

- [ ] **Step 1: 建立 src/main.ts**

```ts
import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index'
import './index.css'

createApp(App).use(router).mount('#app')
```

- [ ] **Step 2: 建立 src/App.vue**

```vue
<script setup lang="ts">
</script>

<template>
  <RouterView />
</template>
```

- [ ] **Step 3: 確認 Vite 可以啟動（基礎骨架可運作）**

```bash
npm run dev
```

預期：瀏覽器開啟 `http://localhost:3000`，不報錯（此時畫面是空白，因為 layout.vue 尚未建立）。若有 Module not found 錯誤，檢查路由中 import 的頁面路徑是否正確。

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/App.vue
git commit -m "feat: add Vue app entry point and root App.vue"
```

---

## Task 6: 建立 Layout

**Files:**
- Create: `src/components/layout.vue`

- [ ] **Step 1: 建立 src/components/layout.vue**

```vue
<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { Home } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { useNavigation } from '@/src/composables/useNavigation'

const route = useRoute()
const { navItems } = useNavigation()

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="flex h-screen w-full bg-muted/20">
    <!-- Desktop Sidebar -->
    <aside class="hidden w-64 flex-col border-r bg-background sm:flex">
      <div class="flex h-14 items-center border-b px-4 font-bold text-primary">
        <Home class="mr-2 h-5 w-5" />
        租隊友 RentMate
      </div>
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            isActive(item.path)
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )"
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
      <div class="container mx-auto p-4 md:p-6 max-w-5xl">
        <RouterView />
      </div>
    </main>

    <!-- Mobile Bottom Nav -->
    <nav class="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t bg-background sm:hidden">
      <RouterLink
        v-for="item in navItems.slice(0, 5)"
        :key="item.path"
        :to="item.path"
        :class="cn(
          'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
          isActive(item.path) ? 'text-primary' : 'text-muted-foreground'
        )"
      >
        <component :is="item.icon" class="h-5 w-5" />
        {{ item.label }}
      </RouterLink>
    </nav>
  </div>
</template>
```

- [ ] **Step 2: 驗證 Layout 可渲染**

```bash
npm run dev
```

預期：sidebar 可見、導覽連結正常，點擊連結不報錯（頁面目前空白）。

- [ ] **Step 3: Commit**

```bash
git add src/components/layout.vue
git commit -m "feat: migrate layout to Vue 3 with RouterLink and composable"
```

---

## Task 7: 遷移 garbage、handover、outage、account 頁面

**Files:**
- Create: `src/pages/garbage.vue`
- Create: `src/pages/handover.vue`
- Create: `src/pages/outage.vue`
- Create: `src/pages/account.vue`

- [ ] **Step 1: 建立 src/pages/garbage.vue**

```vue
<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MapPin, Search, Bell, Heart, Navigation } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">垃圾車清運查詢</h1>
      <p class="text-muted-foreground">查詢附近清運地點，設定倒垃圾提醒。</p>
    </div>

    <div class="flex gap-2">
      <div class="relative flex-1">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="輸入地址或地標..." class="pl-8" />
      </div>
      <Button variant="secondary">
        <Navigation class="mr-2 h-4 w-4" />
        定位
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <div class="md:col-span-2 space-y-4">
        <Card class="h-[400px] overflow-hidden relative">
          <div class="absolute inset-0 bg-muted flex items-center justify-center">
            <div class="text-center text-muted-foreground">
              <MapPin class="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>互動式地圖載入中...</p>
            </div>
          </div>
          <div class="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur p-4 rounded-lg shadow-lg border">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-bold">和平東路二段100號前</h3>
                <p class="text-sm text-muted-foreground">距離 150 公尺</p>
              </div>
              <Badge>預計 19:30 抵達</Badge>
            </div>
            <div class="mt-3 flex gap-2">
              <Button size="sm" class="flex-1">
                <Bell class="mr-2 h-4 w-4" />
                設定提醒
              </Button>
              <Button size="sm" variant="outline">
                <Heart class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div class="space-y-4">
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">我的最愛站點</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex justify-between items-center p-2 hover:bg-muted rounded-md transition-colors cursor-pointer">
              <div>
                <p class="font-medium text-sm">租屋處巷口</p>
                <p class="text-xs text-muted-foreground">19:30 - 19:40</p>
              </div>
              <Bell class="h-4 w-4 text-primary" />
            </div>
            <div class="flex justify-between items-center p-2 hover:bg-muted rounded-md transition-colors cursor-pointer">
              <div>
                <p class="font-medium text-sm">捷運站出口</p>
                <p class="text-xs text-muted-foreground">21:00 - 21:15</p>
              </div>
              <Bell class="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">今日清運項目</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="flex flex-wrap gap-2">
              <Badge variant="outline" class="bg-primary/10">一般垃圾</Badge>
              <Badge variant="outline" class="bg-primary/10">廚餘</Badge>
              <Badge variant="outline" class="bg-secondary/20">紙類</Badge>
              <Badge variant="outline" class="bg-secondary/20">塑膠</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 建立 src/pages/handover.vue**

```vue
<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Camera, FileDown, CheckCircle2, AlertCircle, Plus } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">點交清單與存證</h1>
        <p class="text-muted-foreground">拍攝家具現況，AI 協助辨識清晰度，一鍵匯出證據包。</p>
      </div>
      <Button>
        <FileDown class="mr-2 h-4 w-4" />
        匯出 PDF
      </Button>
    </div>

    <div class="flex gap-4 border-b pb-4">
      <Button variant="default">搬入點交 (2026/03/01)</Button>
      <Button variant="ghost">搬出點交 (尚未建立)</Button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <!-- Item 1 -->
      <Card>
        <CardHeader class="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle class="text-lg">冷氣機</CardTitle>
            <CardDescription>客廳</CardDescription>
          </div>
          <Badge variant="secondary" class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <CheckCircle2 class="mr-1 h-3 w-3" />
            已存證
          </Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="aspect-video bg-muted rounded-md overflow-hidden">
            <img
              src="https://picsum.photos/seed/ac/400/300"
              alt="冷氣機"
              class="object-cover w-full h-full"
              referrerpolicy="no-referrer"
            />
          </div>
          <div class="text-sm">
            <p><strong>備註：</strong> 外觀無損，運轉正常。濾網已清洗。</p>
            <p class="text-xs text-muted-foreground mt-1">拍攝時間：2026/03/01 14:30</p>
          </div>
        </CardContent>
      </Card>

      <!-- Item 2 -->
      <Card>
        <CardHeader class="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle class="text-lg">雙人床墊</CardTitle>
            <CardDescription>主臥室</CardDescription>
          </div>
          <Badge variant="secondary" class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <CheckCircle2 class="mr-1 h-3 w-3" />
            已存證
          </Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="aspect-video bg-muted rounded-md overflow-hidden">
            <img
              src="https://picsum.photos/seed/bed/400/300"
              alt="床墊"
              class="object-cover w-full h-full"
              referrerpolicy="no-referrer"
            />
          </div>
          <div class="text-sm">
            <p><strong>備註：</strong> 左下角有輕微污漬，已向房東確認不扣押金。</p>
            <p class="text-xs text-muted-foreground mt-1">拍攝時間：2026/03/01 14:45</p>
          </div>
        </CardContent>
      </Card>

      <!-- Item 3 - Needs Action -->
      <Card class="border-primary/50 shadow-sm">
        <CardHeader class="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle class="text-lg">洗衣機</CardTitle>
            <CardDescription>陽台</CardDescription>
          </div>
          <Badge variant="destructive">
            <AlertCircle class="mr-1 h-3 w-3" />
            待拍攝
          </Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="aspect-video bg-muted/50 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer">
            <Camera class="h-8 w-8 mb-2" />
            <span class="text-sm font-medium">點擊拍攝或上傳</span>
          </div>
          <div class="text-sm text-muted-foreground">
            <p>請拍攝外觀與內部滾筒。</p>
          </div>
        </CardContent>
      </Card>

      <!-- Add New Item -->
      <Card class="border-dashed flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer min-h-[300px]">
        <Plus class="h-10 w-10 mb-2" />
        <span class="font-medium">新增點交項目</span>
      </Card>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 建立 src/pages/outage.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Zap, Droplets, Search, BellRing } from 'lucide-vue-next'

const searchAddress = ref('台北市大安區')
const powerNotif = ref(true)
const waterNotif = ref(true)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">停水停電資訊</h1>
      <p class="text-muted-foreground">查詢租屋處災情資訊，設定即時推播通知。</p>
    </div>

    <div class="flex gap-2 max-w-md">
      <div class="relative flex-1">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input v-model="searchAddress" placeholder="輸入地址或行政區..." class="pl-8" />
      </div>
      <Button>查詢</Button>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <div class="space-y-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <Zap class="h-5 w-5 text-amber-500" />
          停電資訊
        </h2>
        <Card class="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardHeader class="pb-2">
            <div class="flex justify-between items-start">
              <CardTitle class="text-lg">計畫性工作停電</CardTitle>
              <Badge variant="outline" class="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-100">明日</Badge>
            </div>
            <CardDescription class="text-amber-700 dark:text-amber-400">台北市大安區</CardDescription>
          </CardHeader>
          <CardContent class="text-sm space-y-2">
            <p><strong>時間：</strong> 2026/04/09 14:00 - 16:00</p>
            <p><strong>範圍：</strong> 和平東路二段 80 巷至 120 巷</p>
            <p><strong>原因：</strong> 變壓器更換工程</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <div class="flex justify-between items-start">
              <CardTitle class="text-lg text-muted-foreground">無其他停電資訊</CardTitle>
              <Badge variant="secondary">正常</Badge>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div class="space-y-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <Droplets class="h-5 w-5 text-blue-500" />
          停水資訊
        </h2>
        <Card>
          <CardHeader class="pb-2">
            <div class="flex justify-between items-start">
              <CardTitle class="text-lg text-muted-foreground">目前供水正常</CardTitle>
              <Badge variant="secondary">正常</Badge>
            </div>
            <CardDescription>台北市大安區無停水計畫</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>

    <Card class="mt-8 bg-muted/50">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <BellRing class="h-5 w-5" />
          通知設定
        </CardTitle>
        <CardDescription>當租屋處有停水停電計畫時，系統將透過 PWA 推播通知您。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">停電通知</Label>
            <p class="text-sm text-muted-foreground">接收計畫性與突發性停電通知</p>
          </div>
          <Switch v-model:checked="powerNotif" />
        </div>
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">停水通知</Label>
            <p class="text-sm text-muted-foreground">接收計畫性與突發性停水通知</p>
          </div>
          <Switch v-model:checked="waterNotif" />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 4: 建立 src/pages/account.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Moon, Bell, Shield, HelpCircle, FileText, LogOut } from 'lucide-vue-next'

const name = ref('莊育翔')
const phone = ref('0912-345-678')
const darkMode = ref(false)
const pushNotif = ref(true)
const biometric = ref(false)
</script>

<template>
  <div class="space-y-6 max-w-3xl mx-auto">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">我的帳戶</h1>
      <p class="text-muted-foreground">管理您的個人資料、系統設定與安全隱私。</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>個人資料</CardTitle>
        <CardDescription>更新您的基本資訊與聯絡方式</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="flex items-center gap-6">
          <Avatar class="h-20 w-20">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>我</AvatarFallback>
          </Avatar>
          <Button variant="outline">更換頭像</Button>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="name">姓名</Label>
            <Input id="name" v-model="name" />
          </div>
          <div class="space-y-2">
            <Label for="email">電子郵件</Label>
            <Input id="email" type="email" model-value="user@example.com" disabled />
          </div>
          <div class="space-y-2">
            <Label for="phone">手機號碼</Label>
            <Input id="phone" type="tel" v-model="phone" />
          </div>
        </div>
        <Button>儲存變更</Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>系統設定</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Moon class="h-5 w-5 text-muted-foreground" />
            <div>
              <p class="font-medium">深色模式</p>
              <p class="text-sm text-muted-foreground">切換深色或淺色主題</p>
            </div>
          </div>
          <Switch v-model:checked="darkMode" />
        </div>
        <Separator />
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Bell class="h-5 w-5 text-muted-foreground" />
            <div>
              <p class="font-medium">推播通知</p>
              <p class="text-sm text-muted-foreground">允許系統發送重要提醒</p>
            </div>
          </div>
          <Switch v-model:checked="pushNotif" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>安全與隱私</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Shield class="h-5 w-5 text-muted-foreground" />
            <div>
              <p class="font-medium">生物辨識登入</p>
              <p class="text-sm text-muted-foreground">使用 Face ID 或 Touch ID 快速登入</p>
            </div>
          </div>
          <Switch v-model:checked="biometric" />
        </div>
        <Separator />
        <Button variant="outline" class="w-full justify-start">重設密碼</Button>
      </CardContent>
    </Card>

    <div class="grid gap-4 md:grid-cols-2">
      <Button variant="outline" class="h-auto py-4 justify-start gap-3">
        <HelpCircle class="h-5 w-5 text-muted-foreground" />
        <div class="text-left">
          <p class="font-medium">客服中心</p>
          <p class="text-xs text-muted-foreground">常見問題與聯絡我們</p>
        </div>
      </Button>
      <Button variant="outline" class="h-auto py-4 justify-start gap-3">
        <FileText class="h-5 w-5 text-muted-foreground" />
        <div class="text-left">
          <p class="font-medium">法律與隱私</p>
          <p class="text-xs text-muted-foreground">服務條款與隱私權政策</p>
        </div>
      </Button>
    </div>

    <Button variant="destructive" class="w-full">
      <LogOut class="mr-2 h-4 w-4" />
      登出帳號
    </Button>
  </div>
</template>
```

- [ ] **Step 5: 驗證 4 個頁面可正常渲染**

```bash
npm run dev
```

依序點擊：垃圾清運、點交清單、停水停電、我的帳戶，確認每個頁面可見且無 console 錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/pages/garbage.vue src/pages/handover.vue src/pages/outage.vue src/pages/account.vue
git commit -m "feat: migrate garbage, handover, outage, account pages to Vue 3"
```

---

## Task 8: 遷移 Dashboard 頁面

**Files:**
- Create: `src/pages/dashboard.vue`

- [ ] **Step 1: 建立 src/pages/dashboard.vue**

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, PiggyBank, Trash2, Zap, CheckSquare, AlertTriangle } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">租屋總覽</h1>
      <p class="text-muted-foreground">歡迎回來，這是您目前的租屋狀態與待辦事項。</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">本月租金</CardTitle>
          <PiggyBank class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">$12,000</div>
          <p class="text-xs text-muted-foreground">繳款期限: 5/10</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">契約狀態</CardTitle>
          <FileText class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">有效</div>
          <p class="text-xs text-muted-foreground">剩餘 8 個月</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">待辦事項</CardTitle>
          <CheckSquare class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">3</div>
          <p class="text-xs text-muted-foreground">記事板</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">近期提醒</CardTitle>
          <AlertTriangle class="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold text-destructive">1</div>
          <p class="text-xs text-muted-foreground">明日 14:00 停水</p>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>快速功能</CardTitle>
          <CardDescription>常用的租屋管理工具</CardDescription>
        </CardHeader>
        <CardContent class="grid grid-cols-2 gap-4">
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/contract">
              <FileText class="h-6 w-6" />
              契約分析
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/subsidy">
              <PiggyBank class="h-6 w-6" />
              租金補貼
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/garbage">
              <Trash2 class="h-6 w-6" />
              垃圾清運
            </RouterLink>
          </Button>
          <Button as-child variant="outline" class="h-24 flex-col gap-2">
            <RouterLink to="/outage">
              <Zap class="h-6 w-6" />
              停水停電
            </RouterLink>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>近期動態</CardTitle>
          <CardDescription>您與室友的最新活動</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div class="flex items-center gap-4">
              <div class="h-2 w-2 rounded-full bg-primary" />
              <div class="flex-1 space-y-1">
                <p class="text-sm font-medium leading-none">室友 A 新增了待辦事項</p>
                <p class="text-sm text-muted-foreground">打掃公共區域 (本週日)</p>
              </div>
              <div class="text-xs text-muted-foreground">2小時前</div>
            </div>
            <div class="flex items-center gap-4">
              <div class="h-2 w-2 rounded-full bg-primary" />
              <div class="flex-1 space-y-1">
                <p class="text-sm font-medium leading-none">系統提醒</p>
                <p class="text-sm text-muted-foreground">租金補貼申請已通過初審</p>
              </div>
              <div class="text-xs text-muted-foreground">昨天</div>
            </div>
            <div class="flex items-center gap-4">
              <div class="h-2 w-2 rounded-full bg-muted" />
              <div class="flex-1 space-y-1">
                <p class="text-sm font-medium leading-none text-muted-foreground">完成點交清單</p>
                <p class="text-sm text-muted-foreground">已匯出 PDF 證據包</p>
              </div>
              <div class="text-xs text-muted-foreground">3天前</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
```

> **注意：** `Button as-child` 搭配 `RouterLink` 是 shadcn-vue 的 Reka UI asChild 機制，讓 Button 的樣式套用在 RouterLink 上。若 shadcn-vue 版本不支援，可改用：`<RouterLink to="/contract" class="...button-classes...">` 直接在 RouterLink 上套用 Button 的 CSS classes。

- [ ] **Step 2: 驗證 Dashboard 快速功能連結可正常點擊**

```bash
npm run dev
```

點擊「快速功能」區塊中的 4 個按鈕，確認能正確導航至對應頁面。

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard.vue
git commit -m "feat: migrate dashboard page to Vue 3 with RouterLink"
```

---

## Task 9: 遷移 Contract 頁面

**Files:**
- Create: `src/pages/contract.vue`

- [ ] **Step 1: 建立 src/pages/contract.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, AlertTriangle, CheckCircle2, Bot } from 'lucide-vue-next'

const isUploaded = ref(false)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">契約分析</h1>
      <p class="text-muted-foreground">上傳租賃契約，AI 將為您辨識潛在風險並提供談判建議。</p>
    </div>

    <Card v-if="!isUploaded" class="border-dashed border-2">
      <CardContent class="flex flex-col items-center justify-center h-64 space-y-4">
        <div class="rounded-full bg-primary/10 p-4">
          <Upload class="h-8 w-8 text-primary" />
        </div>
        <div class="text-center">
          <h3 class="text-lg font-semibold">上傳租屋契約</h3>
          <p class="text-sm text-muted-foreground mt-1">支援 PDF 或圖片格式 (JPG, PNG)</p>
        </div>
        <Button @click="isUploaded = true">選擇檔案</Button>
      </CardContent>
    </Card>

    <Tabs v-else default-value="analysis" class="w-full">
      <TabsList class="grid w-full grid-cols-3">
        <TabsTrigger value="preview">契約預覽</TabsTrigger>
        <TabsTrigger value="analysis">風險分析</TabsTrigger>
        <TabsTrigger value="negotiation">AI 談判輔助</TabsTrigger>
      </TabsList>

      <TabsContent value="preview" class="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>契約內容預覽</CardTitle>
            <CardDescription>OCR 辨識結果，可點擊編輯修正錯誤</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="bg-muted p-4 rounded-md font-mono text-sm whitespace-pre-wrap h-96 overflow-y-auto">{{ contractText }}</div>
          </CardContent>
          <CardFooter class="justify-between">
            <Button variant="outline" @click="isUploaded = false">重新上傳</Button>
            <Button>儲存電子檔</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="analysis" class="mt-4">
        <div class="space-y-4">
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="flex items-center gap-2">
                <AlertTriangle class="h-5 w-5 text-destructive" />
                高風險條款 (2)
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="border rounded-lg p-4 space-y-2">
                <div class="flex justify-between items-start">
                  <h4 class="font-semibold">押金超收</h4>
                  <Badge variant="destructive">高風險</Badge>
                </div>
                <p class="text-sm text-muted-foreground bg-muted p-2 rounded">
                  原文：押金新台幣 45,000 元整 (相當於三個月租金)。
                </p>
                <p class="text-sm">
                  <strong>AI 解析：</strong> 依據《租賃住宅市場發展及管理條例》，押金不得超過兩個月租金總額。此條款違反法規，房客有權要求依法調整為兩個月。
                </p>
              </div>
              <div class="border rounded-lg p-4 space-y-2">
                <div class="flex justify-between items-start">
                  <h4 class="font-semibold">修繕責任轉嫁</h4>
                  <Badge variant="destructive">高風險</Badge>
                </div>
                <p class="text-sm text-muted-foreground bg-muted p-2 rounded">
                  原文：房屋及附屬設備損壞時，不論原因為何，概由乙方負責修繕。
                </p>
                <p class="text-sm">
                  <strong>AI 解析：</strong> 依據《民法》第429條，除契約另有訂定或另有習慣外，租賃物之修繕由出租人負擔。此條款將所有修繕責任轉嫁給承租人，對您極為不利。
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="flex items-center gap-2">
                <CheckCircle2 class="h-5 w-5 text-green-500" />
                合規條款 (5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">租金金額、租期、水電費計價方式等條款符合一般常規與法規限制。</p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="negotiation" class="mt-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Bot class="h-5 w-5 text-primary" />
              AI 談判腳本建議
            </CardTitle>
            <CardDescription>針對高風險條款，提供您與房東溝通的建議說法</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <div class="space-y-2">
              <h4 class="font-semibold text-primary">針對「押金超收」</h4>
              <div class="bg-primary/5 p-4 rounded-lg border border-primary/20 text-sm">
                「房東您好，我非常喜歡這間房子，也很有誠意承租。不過我查了一下內政部的租賃法規，目前規定押金最高只能收兩個月。為了符合法規，我們是不是可以把押金調整為 30,000 元呢？我會好好愛惜您的房子的。」
              </div>
              <div class="flex justify-end">
                <Button variant="ghost" size="sm">複製文字</Button>
              </div>
            </div>
            <div class="space-y-2">
              <h4 class="font-semibold text-primary">針對「修繕責任」</h4>
              <div class="bg-primary/5 p-4 rounded-lg border border-primary/20 text-sm">
                「房東，關於合約第四條修繕責任的部分，『不論原因為何皆由乙方負責』這點我比較擔心。如果是房屋結構或設備自然老化的損壞，依法應該是由房東負責修繕的。我們是否能改成『因乙方人為破壞由乙方負責，自然耗損由甲方負責』這樣比較公平呢？」
              </div>
              <div class="flex justify-end">
                <Button variant="ghost" size="sm">複製文字</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script lang="ts">
// 為了可讀性，將長字串定義在此
const contractText = `房屋租賃契約書
立契約書人：
出租人：王大明 (以下簡稱甲方)
承租人：李小華 (以下簡稱乙方)

第一條：租賃標的
房屋座落：台北市大安區和平東路二段100號5樓
...
第三條：租金與押金
每月租金新台幣 15,000 元整。
押金新台幣 45,000 元整 (相當於三個月租金)。

第四條：修繕責任
房屋及附屬設備損壞時，不論原因為何，概由乙方負責修繕。
...`
</script>
```

> **注意：** 上方使用兩個 `<script>` 區塊——`<script setup>` 用於元件邏輯，一般 `<script>` 用於定義常數。或者可以直接將 `contractText` 放在 `<script setup>` 內作為普通 `const`，這樣更簡潔：在 `<script setup>` 中加入 `const contractText = \`...\`` 並移除第二個 `<script>` 區塊。

- [ ] **Step 2: 簡化 contract.vue 的 contractText（將兩個 script 合併）**

將 `contract.vue` 的兩個 `<script>` 區塊合併，`contractText` 直接定義在 `<script setup>` 中：

在 `<script setup>` 末尾（`const isUploaded = ref(false)` 之後）加入：

```ts
const contractText = `房屋租賃契約書
立契約書人：
出租人：王大明 (以下簡稱甲方)
承租人：李小華 (以下簡稱乙方)

第一條：租賃標的
房屋座落：台北市大安區和平東路二段100號5樓
...
第三條：租金與押金
每月租金新台幣 15,000 元整。
押金新台幣 45,000 元整 (相當於三個月租金)。

第四條：修繕責任
房屋及附屬設備損壞時，不論原因為何，概由乙方負責修繕。
...`
```

並移除末尾的第二個 `<script lang="ts">` 區塊。

- [ ] **Step 3: 驗證契約分析頁面**

```bash
npm run dev
```

點擊「契約分析」，確認：
1. 初始狀態顯示上傳區
2. 點擊「選擇檔案」後切換至 Tabs 檢視
3. 三個 Tab 可正常切換
4. 點擊「重新上傳」回到初始狀態

- [ ] **Step 4: Commit**

```bash
git add src/pages/contract.vue
git commit -m "feat: migrate contract page to Vue 3 with ref state"
```

---

## Task 10: 遷移 Subsidy 頁面（多子元件）

**Files:**
- Create: `src/components/subsidy/MenuCard.vue`
- Create: `src/components/subsidy/StepIndicator.vue`
- Create: `src/components/subsidy/Step1.vue`
- Create: `src/components/subsidy/Step2.vue`
- Create: `src/components/subsidy/ApplicationForm.vue`
- Create: `src/pages/subsidy.vue`

- [ ] **Step 1: 建立 src/components/subsidy/MenuCard.vue**

```vue
<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight } from 'lucide-vue-next'
import type { Component } from 'vue'

const props = defineProps<{
  icon: Component
  title: string
  description: string
}>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <Card
    class="cursor-pointer hover:border-primary/50 transition-colors shadow-sm"
    @click="emit('click')"
  >
    <CardContent class="p-5 flex items-center gap-5">
      <div class="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
        <component :is="props.icon" />
      </div>
      <div class="flex-1 space-y-1">
        <h3 class="font-bold text-lg">{{ props.title }}</h3>
        <p class="text-sm text-muted-foreground">{{ props.description }}</p>
      </div>
      <ChevronRight class="h-5 w-5 text-muted-foreground shrink-0" />
    </CardContent>
  </Card>
</template>
```

- [ ] **Step 2: 建立 src/components/subsidy/StepIndicator.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  current: number
  step: number
  label: string
}>()

const isActive = computed(() => props.current === props.step)
const isPast = computed(() => props.current > props.step)
</script>

<template>
  <div
    :class="cn(
      'flex items-center gap-2 whitespace-nowrap',
      isActive ? 'text-[#e11d48] font-bold' : isPast ? 'text-foreground' : 'text-muted-foreground'
    )"
  >
    <div
      :class="cn(
        'flex h-6 w-6 items-center justify-center rounded text-xs font-bold',
        isActive ? 'bg-[#e11d48] text-white' : isPast ? 'bg-muted text-foreground border' : 'border text-muted-foreground'
      )"
    >
      {{ props.step }}
    </div>
    <span>{{ props.label }}</span>
  </div>
</template>
```

- [ ] **Step 3: 建立 src/components/subsidy/Step1.vue**

```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User } from 'lucide-vue-next'

const emit = defineEmits<{ next: []; back: [] }>()
</script>

<template>
  <div class="space-y-8 max-w-2xl mx-auto py-4">
    <div class="flex items-center gap-3 border-b pb-4 mb-8 bg-[#0f766e] text-white p-4 rounded-t-lg -mx-6 md:-mx-8 -mt-6 md:-mt-8">
      <User class="h-6 w-6" />
      <h2 class="text-xl font-bold">驗證身分</h2>
    </div>

    <div class="space-y-8 px-2 md:px-8">
      <div class="grid md:grid-cols-[140px_1fr] items-center gap-2 md:gap-6">
        <Label class="md:text-right text-muted-foreground">
          <span class="text-red-500 mr-1">*</span>申請人身分證字號
        </Label>
        <Input placeholder="例：A123456789" class="max-w-md" />
      </div>
      <div class="grid md:grid-cols-[140px_1fr] items-center gap-2 md:gap-6">
        <Label class="md:text-right text-muted-foreground">
          <span class="text-red-500 mr-1">*</span>申請人健保卡號
        </Label>
        <Input placeholder="例：123456789012" class="max-w-md" />
      </div>
      <div class="grid md:grid-cols-[140px_1fr] items-center gap-2 md:gap-6">
        <Label class="md:text-right text-muted-foreground">
          <span class="text-red-500 mr-1">*</span>驗證碼
        </Label>
        <div class="flex flex-col sm:flex-row gap-4 max-w-md">
          <Input placeholder="例：123456" class="flex-1" />
        </div>
      </div>
      <div class="grid md:grid-cols-[140px_1fr] items-center gap-2 md:gap-6">
        <div class="hidden md:block"></div>
        <div class="flex items-center gap-4">
          <div class="bg-gray-100 px-6 py-3 text-3xl font-mono tracking-widest italic line-through decoration-gray-400 select-none">
            276087
          </div>
          <Button variant="outline" size="sm" class="h-10">收聽驗證碼</Button>
        </div>
      </div>
    </div>

    <div class="flex justify-center gap-4 pt-12">
      <Button
        variant="outline"
        class="w-28 text-[#0f766e] border-[#0f766e] hover:bg-[#0f766e]/10"
        @click="emit('back')"
      >
        回上一頁
      </Button>
      <Button class="w-28 bg-[#0f766e] hover:bg-[#0f766e]/90" @click="emit('next')">
        登入
      </Button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 建立 src/components/subsidy/Step2.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { FileText } from 'lucide-vue-next'

const emit = defineEmits<{ next: []; back: [] }>()

const name = ref('莊育翔')
const birthDate = ref('2000-01-01')
const email = ref('user@example.com')
const phone = ref('0912-345-678')
const maritalStatus = ref('single')
const rentAddress = ref('台北市大安區和平東路二段100號5樓')
const contractStart = ref('2026-03-01')
const contractEnd = ref('2027-02-28')
const monthlyRent = ref('15,000')
const rentalType = ref('suite')
</script>

<template>
  <div class="space-y-8 py-4">
    <div class="flex items-center gap-3 border-b pb-4 mb-8 bg-[#0f766e] text-white p-4 rounded-t-lg -mx-6 md:-mx-8 -mt-6 md:-mt-8">
      <FileText class="h-6 w-6" />
      <h2 class="text-xl font-bold">一、申請人基本資料</h2>
    </div>

    <div class="grid md:grid-cols-2 gap-x-8 gap-y-6 px-2 md:px-4">
      <div class="space-y-2">
        <Label><span class="text-red-500 mr-1">*</span>申請人姓名</Label>
        <Input v-model="name" />
      </div>
      <div class="space-y-2">
        <Label><span class="text-red-500 mr-1">*</span>出生年月日</Label>
        <Input type="date" v-model="birthDate" />
      </div>
      <div class="space-y-2">
        <Label><span class="text-red-500 mr-1">*</span>國民身分證統一編號</Label>
        <Input model-value="A123456789" disabled class="bg-muted" />
      </div>
      <div class="space-y-2">
        <Label><span class="text-red-500 mr-1">*</span>電子郵件信箱</Label>
        <Input type="email" v-model="email" />
      </div>
      <div class="space-y-2">
        <Label><span class="text-red-500 mr-1">*</span>手機號碼</Label>
        <Input type="tel" v-model="phone" />
      </div>
      <div class="space-y-2">
        <Label>電話</Label>
        <Input type="tel" placeholder="選填" />
      </div>
      <div class="space-y-3 md:col-span-2">
        <Label><span class="text-red-500 mr-1">*</span>婚姻狀態</Label>
        <RadioGroup v-model="maritalStatus" class="flex gap-6">
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="single" id="single" />
            <Label for="single" class="font-normal">單身 (未婚、離婚或喪偶)</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="married" id="married" />
            <Label for="married" class="font-normal">已婚</Label>
          </div>
        </RadioGroup>
      </div>
    </div>

    <div class="space-y-6 pt-6 px-2 md:px-4">
      <h3 class="text-lg font-bold border-b pb-2 text-[#0f766e]">租賃房屋地址及相關資訊</h3>
      <div class="bg-blue-50/50 border border-blue-100 p-5 rounded-xl space-y-6">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-blue-800">系統已自動從您的契約中擷取部分資料</span>
          <Badge variant="secondary" class="bg-blue-100 text-blue-700 hover:bg-blue-100">AI 自動帶入</Badge>
        </div>
        <div class="space-y-2">
          <Label>租賃地址 (門牌)</Label>
          <Input v-model="rentAddress" />
        </div>
        <div class="grid md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <Label>租賃契約起訖日</Label>
            <div class="flex items-center gap-2">
              <Input type="date" v-model="contractStart" />
              <span class="text-muted-foreground">至</span>
              <Input type="date" v-model="contractEnd" />
            </div>
          </div>
          <div class="space-y-2">
            <Label>每月租金</Label>
            <div class="relative">
              <span class="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <Input class="pl-8" v-model="monthlyRent" />
            </div>
          </div>
          <div class="space-y-3 md:col-span-2">
            <Label>租屋型態</Label>
            <RadioGroup v-model="rentalType" class="flex flex-wrap gap-6">
              <div class="flex items-center space-x-2">
                <RadioGroupItem value="whole" id="whole" />
                <Label for="whole" class="font-normal">整戶 (層)</Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem value="suite" id="suite" />
                <Label for="suite" class="font-normal">獨立套房 (1房1廳1衛)</Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem value="sub_suite" id="sub_suite" />
                <Label for="sub_suite" class="font-normal">分租套房</Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem value="room" id="room" />
                <Label for="room" class="font-normal">分租雅房</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-center gap-4 pt-8">
      <Button
        variant="outline"
        class="w-28 text-[#0f766e] border-[#0f766e] hover:bg-[#0f766e]/10"
        @click="emit('back')"
      >
        回上一頁
      </Button>
      <Button class="w-28 bg-[#0f766e] hover:bg-[#0f766e]/90" @click="emit('next')">
        下一步
      </Button>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 建立 src/components/subsidy/ApplicationForm.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, ArrowLeft } from 'lucide-vue-next'
import StepIndicator from './StepIndicator.vue'
import Step1 from './Step1.vue'
import Step2 from './Step2.vue'

const emit = defineEmits<{ back: [] }>()

const step = ref(1)
</script>

<template>
  <div class="space-y-6 max-w-4xl mx-auto">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" class="shrink-0" @click="emit('back')">
        <ArrowLeft class="h-5 w-5" />
      </Button>
      <h1 class="text-2xl font-bold tracking-tight">300億元中央擴大租金補貼專案</h1>
    </div>

    <!-- Stepper -->
    <div class="flex items-center justify-start md:justify-center gap-2 md:gap-4 text-sm overflow-x-auto py-4 px-2 bg-amber-50/50 rounded-lg border border-amber-100">
      <StepIndicator :current="step" :step="1" label="驗證身分" />
      <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
      <StepIndicator :current="step" :step="2" label="填寫資料" />
      <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
      <StepIndicator :current="step" :step="3" label="上傳文件" />
      <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
      <StepIndicator :current="step" :step="4" label="核對資料" />
      <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
      <StepIndicator :current="step" :step="5" label="完成申請" />
    </div>

    <Card class="border-t-4 border-t-[#0f766e] shadow-md">
      <CardContent class="p-6 md:p-8">
        <Step1 v-if="step === 1" @next="step = 2" @back="emit('back')" />
        <Step2 v-else-if="step === 2" @next="step = 3" @back="step = 1" />
        <div v-else class="text-center py-16 space-y-4">
          <h3 class="text-xl font-medium text-muted-foreground">步驟 {{ step }} 開發中</h3>
          <Button variant="outline" @click="step--">回上一頁</Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 6: 建立 src/pages/subsidy.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Calculator, FileEdit, Paperclip, TrendingUp } from 'lucide-vue-next'
import MenuCard from '@/src/components/subsidy/MenuCard.vue'
import ApplicationForm from '@/src/components/subsidy/ApplicationForm.vue'

const view = ref<'menu' | 'application'>('menu')
</script>

<template>
  <ApplicationForm v-if="view === 'application'" @back="view = 'menu'" />

  <div v-else class="space-y-6 max-w-4xl mx-auto">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">租補管理</h1>
    </div>

    <div class="bg-[#13a884] text-white p-8 rounded-2xl space-y-3 shadow-sm">
      <div class="text-sm font-medium opacity-90">租金補貼申請</div>
      <h2 class="text-2xl md:text-3xl font-bold">減輕租屋負擔，保障居住權益</h2>
      <div class="text-sm opacity-90">115 年度補貼方案受理中</div>
    </div>

    <div class="space-y-4">
      <MenuCard
        :icon="Calculator"
        title="資格試算"
        description="輸入條件，快速評估補貼資格與金額"
        @click="() => {}"
      />
      <MenuCard
        :icon="FileEdit"
        title="申請流程"
        description="填寫申請表單，系統自動帶入契約資料"
        @click="view = 'application'"
      />
      <MenuCard
        :icon="Paperclip"
        title="補件上傳"
        description="上傳補充文件與必備資料"
        @click="() => {}"
      />
      <MenuCard
        :icon="TrendingUp"
        title="進度追蹤"
        description="查看目前申請處理狀態"
        @click="() => {}"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 7: 驗證 Subsidy 頁面完整流程**

```bash
npm run dev
```

確認：
1. 主選單 4 個項目可見
2. 點擊「申請流程」→ 切換到 ApplicationForm
3. 步驟指示器正確顯示（步驟1 高亮）
4. 點擊「登入」→ 進入步驟2（填寫資料）
5. 點擊「回上一頁」→ 回到步驟1
6. 點擊左上角返回箭頭 → 回到主選單

- [ ] **Step 8: Commit**

```bash
git add src/pages/subsidy.vue src/components/subsidy/
git commit -m "feat: migrate subsidy page and sub-components to Vue 3"
```

---

## Task 11: 遷移 Notes 頁面

**Files:**
- Create: `src/pages/notes.vue`

- [ ] **Step 1: 建立 src/pages/notes.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  User,
  List,
  LayoutGrid,
  ShieldCheck,
  Sparkles
} from 'lucide-vue-next'

const view = ref('list')

// 靜態資料直接定義在 setup 中
const roommatesTasks = [
  { id: 1, title: '倒垃圾', tag: '輪值', badgeClass: 'bg-blue-50 text-blue-600 border-blue-200', description: '週四晚上 20:30 前，記得分類廚餘', date: '2026-03-13', assignee: '小林', creator: '小林', updated: '03/12' },
  { id: 2, title: '清潔廁所', tag: '輪值', badgeClass: 'bg-blue-50 text-blue-600 border-blue-200', description: '每週六早上輪流清潔，請確認清潔劑夠用', date: '2026-03-16', assignee: '阿明', creator: '小林', updated: '03/10' },
  { id: 3, title: '房東來訪通知', tag: '公告', badgeClass: 'bg-red-50 text-red-600 border-red-200', description: '3/18 下午 2 點房東要來檢查熱水器，請保持客廳整潔', date: '2026-03-18', assignee: '全體', creator: '小林', updated: '03/11' },
  { id: 4, title: '繳水電費', tag: '提醒', badgeClass: 'bg-amber-50 text-amber-600 border-amber-200', description: '三月份水費 $420、電費 $1,240，請各自匯款給小林', date: '2026-03-14', assignee: '全體', creator: '阿明', updated: '03/09' },
]

const weekDays = [
  { label: '週日', class: 'text-muted-foreground' }, { label: '週一', class: 'text-muted-foreground' },
  { label: '週二', class: 'text-muted-foreground' }, { label: '週三', class: 'text-muted-foreground' },
  { label: '週四', class: 'text-muted-foreground' }, { label: '週五', class: 'text-primary' },
  { label: '週六', class: 'text-muted-foreground' },
]

const weekDates = [
  { num: 8, class: '' }, { num: 9, class: '' }, { num: 10, class: '' }, { num: 11, class: '' }, { num: 12, class: '' },
  { num: 13, class: 'bg-primary text-primary-foreground rounded-full w-10 mx-auto block py-2' },
  { num: 14, class: '' },
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">記事板</h1>
      </div>
      <div class="flex gap-2">
        <Badge variant="secondary" class="bg-green-100 text-green-700 hover:bg-green-100 border-none">
          <ShieldCheck class="mr-1 h-3 w-3" />
          資料安全
        </Badge>
        <Badge variant="secondary" class="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none">
          <Sparkles class="mr-1 h-3 w-3" />
          AI 就緒
        </Badge>
      </div>
    </div>

    <Tabs default-value="personal" class="w-full">
      <div class="flex justify-between items-center mb-6">
        <TabsList class="h-10">
          <TabsTrigger value="personal" class="flex gap-2">
            個人記事
            <Badge variant="secondary" class="h-5 w-5 p-0 flex items-center justify-center rounded-full">2</Badge>
          </TabsTrigger>
          <TabsTrigger value="roommates" class="flex gap-2">
            室友協作
            <Badge variant="secondary" class="h-5 w-5 p-0 flex items-center justify-center rounded-full">4</Badge>
          </TabsTrigger>
        </TabsList>

        <div class="flex items-center gap-2">
          <div class="hidden sm:flex bg-muted p-1 rounded-md">
            <Button variant="ghost" size="sm" class="h-8 bg-background shadow-sm">全部</Button>
            <Button variant="ghost" size="sm" class="h-8">待辦</Button>
            <Button variant="ghost" size="sm" class="h-8">完成</Button>
          </div>

          <TabsContent value="roommates" class="m-0">
            <ToggleGroup
              type="single"
              :model-value="view"
              class="bg-muted p-1 rounded-md h-10"
              @update:model-value="(v) => v && (view = v)"
            >
              <ToggleGroupItem value="list" aria-label="List view" class="h-8 px-2">
                <List class="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="calendar" aria-label="Calendar view" class="h-8 px-2">
                <LayoutGrid class="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </TabsContent>

          <Button class="h-10">
            <Plus class="mr-2 h-4 w-4" />
            新增
          </Button>
        </div>
      </div>

      <!-- 個人記事 Tab -->
      <TabsContent value="personal" class="mt-0">
        <div class="grid gap-6 md:grid-cols-3">
          <div class="md:col-span-2 space-y-4">
            <!-- Task 1 -->
            <Card class="hover:border-primary/50 transition-colors">
              <CardContent class="p-4 flex gap-4">
                <Checkbox class="mt-1" />
                <div class="flex-1 space-y-2">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium">繳交三月房租</h3>
                    <Badge variant="outline" class="bg-red-50 text-red-600 border-red-200">匯款</Badge>
                  </div>
                  <p class="text-sm text-muted-foreground">記得 ATM 轉帳給陳大文，帳號末四碼 5678</p>
                  <div class="flex items-center gap-4 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1"><CalendarIcon class="h-3 w-3" /> 2026-03-10</span>
                    <span class="flex items-center gap-1"><Clock class="h-3 w-3" /> 09:00</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive">
                  <Trash2 class="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            <!-- Task 2 -->
            <Card class="hover:border-primary/50 transition-colors">
              <CardContent class="p-4 flex gap-4">
                <Checkbox class="mt-1" />
                <div class="flex-1 space-y-2">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium">外出前確認事項</h3>
                    <Badge variant="outline" class="bg-blue-50 text-blue-600 border-blue-200">提醒</Badge>
                  </div>
                  <p class="text-sm text-muted-foreground">帶鑰匙、悠遊卡、雨傘 (週末有雨)</p>
                  <div class="flex items-center gap-4 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1"><CalendarIcon class="h-3 w-3" /> 2026-03-15</span>
                    <span class="flex items-center gap-1"><Clock class="h-3 w-3" /> 08:30</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive">
                  <Trash2 class="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            <!-- Task 3 (completed) -->
            <Card class="opacity-60 bg-muted/30">
              <CardContent class="p-4 flex gap-4">
                <Checkbox :checked="true" class="mt-1" />
                <div class="flex-1 space-y-2">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium line-through">冷氣濾網清洗</h3>
                    <Badge variant="outline" class="bg-green-50 text-green-600 border-green-200">維護</Badge>
                  </div>
                  <p class="text-sm text-muted-foreground line-through">上次清洗是一月，建議每三個月一次</p>
                  <div class="flex items-center gap-4 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1"><CalendarIcon class="h-3 w-3" /> 2026-03-20</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive">
                  <Trash2 class="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-base">個人摘要</CardTitle>
              </CardHeader>
              <CardContent class="space-y-4">
                <div class="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
                  <span class="text-sm text-muted-foreground">待辦事項</span>
                  <span class="text-xl font-bold text-primary">2</span>
                </div>
                <div class="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
                  <span class="text-sm text-muted-foreground">今日提醒</span>
                  <span class="text-xl font-bold text-amber-500">0</span>
                </div>
                <div class="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
                  <span class="text-sm text-muted-foreground">已完成</span>
                  <span class="text-xl font-bold text-green-500">1</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-base">標籤分佈</CardTitle>
              </CardHeader>
              <CardContent class="space-y-4">
                <div class="flex items-center gap-3">
                  <Badge variant="outline" class="w-16 justify-center bg-red-50 text-red-600 border-red-200">匯款</Badge>
                  <Progress :model-value="33" class="h-2 [&>div]:bg-red-500" />
                  <span class="text-sm font-medium w-4 text-right">1</span>
                </div>
                <div class="flex items-center gap-3">
                  <Badge variant="outline" class="w-16 justify-center bg-blue-50 text-blue-600 border-blue-200">提醒</Badge>
                  <Progress :model-value="33" class="h-2 [&>div]:bg-blue-500" />
                  <span class="text-sm font-medium w-4 text-right">1</span>
                </div>
                <div class="flex items-center gap-3">
                  <Badge variant="outline" class="w-16 justify-center bg-green-50 text-green-600 border-green-200">維護</Badge>
                  <Progress :model-value="33" class="h-2 [&>div]:bg-green-500" />
                  <span class="text-sm font-medium w-4 text-right">1</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <!-- 室友協作 Tab -->
      <TabsContent value="roommates" class="mt-0">
        <!-- List View -->
        <div v-if="view === 'list'" class="grid gap-6 md:grid-cols-3">
          <div class="md:col-span-2 space-y-4">
            <Card v-for="task in roommatesTasks" :key="task.id" class="hover:border-primary/50 transition-colors">
              <CardContent class="p-4 flex gap-4">
                <Checkbox class="mt-1" />
                <div class="flex-1 space-y-2">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium">{{ task.title }}</h3>
                    <Badge variant="outline" :class="task.badgeClass">{{ task.tag }}</Badge>
                  </div>
                  <p class="text-sm text-muted-foreground">{{ task.description }}</p>
                  <div class="flex items-center gap-4 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1"><CalendarIcon class="h-3 w-3" /> {{ task.date }}</span>
                    <span class="flex items-center gap-1 font-medium text-foreground"><User class="h-3 w-3" /> 負責：{{ task.assignee }}</span>
                    <span>建立：{{ task.creator }}</span>
                    <span>更新 {{ task.updated }}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive">
                  <Trash2 class="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <div class="space-y-6">
            <Card>
              <CardHeader class="pb-2"><CardTitle class="text-base">協作摘要</CardTitle></CardHeader>
              <CardContent class="space-y-4">
                <div class="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
                  <span class="text-sm text-muted-foreground">待處理</span>
                  <span class="text-xl font-bold text-primary">4</span>
                </div>
                <div class="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
                  <span class="text-sm text-muted-foreground">已完成</span>
                  <span class="text-xl font-bold text-green-500">1</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader class="pb-2"><CardTitle class="text-base">室友負責分佈</CardTitle></CardHeader>
              <CardContent class="space-y-4">
                <div class="space-y-1">
                  <div class="flex justify-between text-sm">
                    <span class="font-medium">小林</span>
                    <span class="text-muted-foreground text-xs">0/1 完成</span>
                  </div>
                  <Progress :model-value="0" class="h-1.5" />
                </div>
                <div class="space-y-1">
                  <div class="flex justify-between text-sm">
                    <span class="font-medium">阿明</span>
                    <span class="text-muted-foreground text-xs">0/1 完成</span>
                  </div>
                  <Progress :model-value="0" class="h-1.5" />
                </div>
                <div class="space-y-1">
                  <div class="flex justify-between text-sm">
                    <span class="font-medium">小美</span>
                    <span class="text-muted-foreground text-xs">1/1 完成</span>
                  </div>
                  <Progress :model-value="100" class="h-1.5" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader class="pb-2"><CardTitle class="text-base">事項類型</CardTitle></CardHeader>
              <CardContent class="space-y-3">
                <div class="flex justify-between items-center">
                  <Badge variant="outline" class="bg-blue-50 text-blue-600 border-blue-200">輪值</Badge>
                  <span class="text-sm font-medium">3 項</span>
                </div>
                <div class="flex justify-between items-center">
                  <Badge variant="outline" class="bg-amber-50 text-amber-600 border-amber-200">提醒</Badge>
                  <span class="text-sm font-medium">1 項</span>
                </div>
                <div class="flex justify-between items-center">
                  <Badge variant="outline" class="bg-red-50 text-red-600 border-red-200">公告</Badge>
                  <span class="text-sm font-medium">1 項</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Calendar View -->
        <Card v-else>
          <CardHeader><CardTitle>本週分工排程</CardTitle></CardHeader>
          <CardContent>
            <div class="grid grid-cols-7 gap-2 text-center mb-4">
              <div v-for="day in weekDays" :key="day.label" class="text-sm font-medium" :class="day.class">{{ day.label }}</div>
              <div v-for="date in weekDates" :key="date.num" class="py-2 font-semibold">
                <span :class="date.class">{{ date.num }}</span>
              </div>
            </div>
            <div class="grid grid-cols-7 gap-2 min-h-[120px]">
              <div class="border-t pt-2" v-for="i in 5" :key="i"></div>
              <div class="border-t pt-2 space-y-2">
                <div class="bg-blue-100 text-blue-800 p-2 rounded-md text-xs text-left">
                  <div class="font-semibold">倒垃圾</div>
                  <div>小林</div>
                </div>
              </div>
              <div class="border-t pt-2 space-y-2">
                <div class="bg-amber-100 text-amber-800 p-2 rounded-md text-xs text-left">
                  <div class="font-semibold">繳水電費</div>
                  <div>全體</div>
                </div>
              </div>
            </div>
            <div class="flex gap-4 mt-8 pt-4 border-t">
              <Badge variant="outline" class="bg-blue-50 text-blue-600 border-blue-200">輪值</Badge>
              <Badge variant="outline" class="bg-amber-50 text-amber-600 border-amber-200">提醒</Badge>
              <Badge variant="outline" class="bg-red-50 text-red-600 border-red-200">公告</Badge>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>

```


- [ ] **Step 2: 驗證 Notes 頁面**

```bash
npm run dev
```

確認：
1. 「個人記事」Tab 顯示 3 個 task
2. 「室友協作」Tab 顯示 4 個 task
3. 切換 list/calendar view 按鈕正常
4. Progress bar 正確顯示

- [ ] **Step 3: Commit**

```bash
git add src/pages/notes.vue
git commit -m "feat: migrate notes page to Vue 3 with tabs and toggle group"
```

---

## Task 12: 最終型別檢查與驗證

**Files:** 無（純驗證）

- [ ] **Step 1: 執行 TypeScript 型別檢查**

```bash
npm run lint
```

預期輸出：無錯誤。若有錯誤，常見原因：
- shadcn-vue 元件的 prop 名稱（請查閱 shadcn-vue 文件確認各元件 API）
- `.vue` 副檔名缺失（確認所有 import 都有 `.vue`）
- Reka UI 的 `v-model:checked`（Switch, Checkbox）vs `v-model`（RadioGroup）

- [ ] **Step 2: 執行開發伺服器並完整巡覽所有頁面**

```bash
npm run dev
```

逐一點擊所有 8 個頁面，確認無 console 錯誤：
- [ ] `/` 總覽
- [ ] `/contract` 契約分析（含上傳 → Tab 切換 → 重新上傳）
- [ ] `/subsidy` 租金補貼（含進入申請流程 → 步驟1 → 步驟2 → 返回）
- [ ] `/garbage` 垃圾清運
- [ ] `/handover` 點交清單
- [ ] `/outage` 停水停電
- [ ] `/notes` 記事板（含個人/室友 Tab 切換，list/calendar 切換）
- [ ] `/account` 我的帳戶

- [ ] **Step 3: 執行建置確認無建置錯誤**

```bash
npm run build
```

預期輸出：`✓ built in X.XXs`，dist/ 目錄生成。

- [ ] **Step 4: 最終 Commit**

```bash
git add -A
git commit -m "feat: complete React 19 to Vue 3 migration for RentMate frontend"
```

---

## 常見問題排解

### shadcn-vue 元件 API 差異

若發現某個元件的 prop 或事件與 React 版不同，請查閱 [shadcn-vue.com](https://www.shadcn-vue.com/) 對應元件文件。常見差異：

| React shadcn | shadcn-vue |
|---|---|
| `defaultChecked` | `v-model:checked` 初始值 |
| `defaultValue` | `:default-value` 或 `v-model` |
| `onValueChange` | `@update:modelValue` |
| `asChild` | `as-child` |

### 路由 import 路徑

若出現 `Cannot find module` 錯誤，確認：
1. 路由中使用 `() => import('@/src/pages/xxx.vue')` 的懶載入
2. 所有 import 都加上 `.vue` 副檔名

### Tailwind CSS v4 與 shadcn-vue

若 shadcn-vue CLI 生成的元件樣式與預期不符（因為 v4 的 CSS 變數語法），通常不需要修改 `src/index.css`——現有的 CSS 變數已完整定義，shadcn-vue 的 Tailwind 類別會自動對應。

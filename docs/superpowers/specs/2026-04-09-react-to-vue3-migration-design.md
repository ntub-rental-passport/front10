# 設計規格：React 19 → Vue 3 全專案遷移

**日期：** 2026-04-09
**專案：** 租隊友 RentMate 前端介面
**範疇：** 將整個前端專案從 React 19 遷移至 Vue 3，功能完全一致並順帶優化結構

---

## 1. 目標

- 將所有 `.tsx` 元件改寫為 Vue 3 SFC（`.vue`）格式
- 使用 `<script setup lang="ts">` Composition API 語法
- 以 **shadcn-vue + Reka UI** 取代 `@base-ui/react`
- 以 **Vue Router 4** 取代 `react-router-dom`
- 以 **lucide-vue-next** 取代 `lucide-react`
- 路由定義、導覽項目抽離為獨立模組（結構優化）
- 不新增功能，僅遷移現有功能並改善程式碼結構

---

## 2. 技術棧對照

| 現有（React） | 遷移後（Vue） | 說明 |
|---|---|---|
| `react` / `react-dom` | `vue` | 核心框架 |
| `@vitejs/plugin-react` | `@vitejs/plugin-vue` | Vite 外掛 |
| `@base-ui/react` | `reka-ui`（由 shadcn-vue CLI 管理） | Headless UI 原語 |
| `react-router-dom` | `vue-router` | 路由管理 |
| `lucide-react` | `lucide-vue-next` | 圖示庫（PascalCase 用法不變） |
| `motion`（framer） | `motion`（import 改為 `motion/vue`） | 動畫，套件本身保留 |
| `.tsx` 檔案 | `.vue` SFC 檔案 | 元件格式 |
| Tailwind CSS v4 | Tailwind CSS v4 | 不變 |
| `class-variance-authority` | 不變 | 不變 |
| `clsx` / `tailwind-merge` | 不變 | 不變 |
| `@google/genai` | 不變 | 框架無關 |
| `express` / `dotenv` | 不變 | 框架無關 |

---

## 3. 檔案結構

### 遷移前
```
前端介面/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   └── layout.tsx
│   └── pages/
│       ├── dashboard.tsx
│       ├── contract.tsx
│       ├── subsidy.tsx
│       ├── garbage.tsx
│       ├── handover.tsx
│       ├── outage.tsx
│       ├── notes.tsx
│       └── account.tsx
├── components/
│   └── ui/
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── progress.tsx
│       ├── radio-group.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       ├── skeleton.tsx
│       ├── switch.tsx
│       ├── table.tsx
│       ├── tabs.tsx
│       ├── textarea.tsx
│       ├── toggle-group.tsx
│       └── toggle.tsx
└── lib/
    └── utils.ts
```

### 遷移後
```
前端介面/
├── src/
│   ├── main.ts                  ← createApp() 取代 createRoot()
│   ├── App.vue                  ← 僅掛載 RouterView，路由移至 router/
│   ├── index.css                ← 不變
│   ├── router/
│   │   └── index.ts             ← 新增：Vue Router 路由定義
│   ├── composables/
│   │   └── useNavigation.ts     ← 新增：導覽項目與邏輯
│   ├── components/
│   │   └── layout.vue           ← RouterLink + RouterView
│   └── pages/
│       ├── dashboard.vue
│       ├── contract.vue
│       ├── subsidy.vue
│       ├── garbage.vue
│       ├── handover.vue
│       ├── outage.vue
│       ├── notes.vue
│       └── account.vue
├── components/
│   └── ui/
│       ├── avatar.vue
│       ├── badge.vue
│       ├── button.vue
│       ├── card.vue
│       ├── checkbox.vue
│       ├── dialog.vue
│       ├── input.vue
│       ├── label.vue
│       ├── progress.vue
│       ├── radio-group.vue
│       ├── scroll-area.vue
│       ├── select.vue
│       ├── separator.vue
│       ├── sheet.vue
│       ├── skeleton.vue
│       ├── switch.vue
│       ├── table.vue
│       ├── tabs.vue
│       ├── textarea.vue
│       ├── toggle-group.vue
│       └── toggle.vue
└── lib/
    └── utils.ts                 ← 不變（cn 函式）
```

---

## 4. 語法轉換規則

### 4.1 元件基本結構

```tsx
// React (.tsx)
import { useState } from 'react'

interface Props { title: string }

export function MyComponent({ title }: Props) {
  const [count, setCount] = useState(0)
  return <div className="...">{title}: {count}</div>
}
```

```vue
<!-- Vue 3 (.vue) -->
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ title: string }>()
const count = ref(0)
</script>

<template>
  <div class="...">{{ props.title }}: {{ count }}</div>
</template>
```

### 4.2 Hooks 對應

| React | Vue 3 |
|---|---|
| `useState<T>(init)` | `ref<T>(init)` |
| `useEffect(() => {}, [])` | `onMounted(() => {})` |
| `useEffect(() => {}, [dep])` | `watch(dep, callback)` |
| `useMemo(() => x, [dep])` | `computed(() => x)` |
| `useCallback(fn, [dep])` | 直接使用函式（setup 內不需要） |
| `useRef<T>()` | `ref<T>()` / `useTemplateRef()` |

### 4.3 Router 對應

| React Router DOM | Vue Router 4 |
|---|---|
| `<BrowserRouter>` | `createWebHistory()` in `router/index.ts` |
| `<Routes><Route>` | `routes` 陣列 in `router/index.ts` |
| `<Link to="/path">` | `<RouterLink to="/path">` |
| `<Outlet />` | `<RouterView />` |
| `useLocation()` | `useRoute()` |
| `useNavigate()` | `useRouter().push()` |

### 4.4 JSX 屬性對應

| React JSX | Vue Template |
|---|---|
| `className=` | `class=` |
| `onClick={fn}` | `@click="fn"` |
| `onChange={fn}` | `@change="fn"` / `v-model` |
| `{condition && <El />}` | `<El v-if="condition" />` |
| `{list.map(x => <El />)}` | `<El v-for="x in list" :key="x.id" />` |
| `children` prop | `<slot />` |
| `{...props}` spread | `v-bind="$attrs"` 或明確傳遞 |

### 4.5 Controlled Component → v-model（重要）

React 中常見的受控元件寫法，在 Vue 中一律簡化為 `v-model`：

```tsx
// React（冗長）
const [text, setText] = useState('')
<input value={text} onChange={(e) => setText(e.target.value)} />
```

```vue
<!-- Vue（簡潔）-->
<script setup lang="ts">
const text = ref('')
</script>
<template>
  <input v-model="text" />
</template>
```

這是遷移中減少程式碼最顯著的地方，所有表單輸入欄位、checkbox、select 都應改用 `v-model`。

### 4.6 Import 必須加 `.vue` 副檔名

在 Vue 3 + Vite + TypeScript 環境中，引入 SFC 時**必須**加上 `.vue` 副檔名，否則會出現 `Module not found` 錯誤：

```ts
// 正確
import Dashboard from '@/pages/dashboard.vue'
import { Button } from '@/components/ui/button.vue'

// 錯誤（會報錯）
import Dashboard from '@/pages/dashboard'
```

### 4.7 lucide-vue-next 圖示使用

在 `<script setup>` 中 import 後，直接在 template 使用 PascalCase，與 React 用法一致：

```vue
<script setup lang="ts">
import { FileText, Home } from 'lucide-vue-next'
</script>
<template>
  <FileText class="h-4 w-4" />
  <!-- 或 kebab-case 也可以：<file-text class="h-4 w-4" /> -->
</template>
```

### 4.8 事件與 emit

```tsx
// React
interface Props { onSave: (value: string) => void }
function Component({ onSave }: Props) {
  return <button onClick={() => onSave('hello')}>儲存</button>
}
```

```vue
<!-- Vue 3 -->
<script setup lang="ts">
const emit = defineEmits<{ save: [value: string] }>()
</script>
<template>
  <button @click="emit('save', 'hello')">儲存</button>
</template>
```

---

## 5. 設定檔變更

### 5.1 package.json

**移除：**
- `react`, `react-dom`, `@vitejs/plugin-react`, `@base-ui/react`, `react-router-dom`, `lucide-react`

**新增：**
- `vue`, `@vitejs/plugin-vue`, `reka-ui`, `vue-router`, `lucide-vue-next`
- `motion` 套件保留（已原生支援 Vue，import 路徑從 `motion/react` 改為 `motion/vue`）

### 5.2 vite.config.ts

```ts
import vue from '@vitejs/plugin-vue'
// 取代 import react from '@vitejs/plugin-react'

plugins: [vue(), tailwindcss()]
```

### 5.3 tsconfig.json

保留 `"jsx": "preserve"` 並新增 `"jsxImportSource": "vue"`：

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "vue",
    "moduleResolution": "bundler"
  }
}
```

> **原因：** `vue-tsc`（Vue 官方型別檢查工具）底層依賴 JSX 機制對 `<template>` 進行嚴格型別檢查。保留此設定可確保 VS Code Volar 擴充套件提供準確的自動完成與報錯提示。

---

## 6. 優化項目

### 6.1 路由模組化
原本路由定義在 `App.tsx` 中，遷移後移至 `src/router/index.ts`，符合 Vue 慣例，讓 `App.vue` 保持極簡。

### 6.2 導覽邏輯抽離
原本 `navItems` 陣列寫在 `layout.tsx` 中。遷移後抽至 `src/composables/useNavigation.ts`，讓 Layout 更乾淨，未來也易於擴充。

### 6.3 SFC 分離關注點
Vue SFC 的 `<template>` / `<script>` / `<style>` 三段式結構比 React 的 JSX 混合更清楚分離模板與邏輯。

---

## 7. 遷移順序

建議按以下順序執行，確保每一步都可以驗證：

1. **更新設定檔** — `package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`
2. **初始化 shadcn-vue** — 使用 CLI 重新生成所有 UI 元件：
   ```bash
   npx shadcn-vue@latest init
   npx shadcn-vue@latest add avatar badge button card checkbox dialog input label progress radio-group scroll-area select separator sheet skeleton switch table tabs textarea toggle toggle-group
   ```
   > **原因：** shadcn-vue 的底層（Reka UI）與 React 版本（Base UI）在 API、插槽、事件上差異極大，直接手動移植容易出錯。使用官方 CLI 生成的 Vue 版本元件最為準確，生成後再視需要微調樣式。
3. **刪除原有 React UI 元件** — 移除 `components/ui/*.tsx` 舊檔案
4. **建立路由與 Composable** — `src/router/index.ts`、`src/composables/useNavigation.ts`
5. **遷移入口與 App** — `src/main.ts`、`src/App.vue`
6. **遷移 Layout** — `src/components/layout.vue`
7. **遷移各頁面** — 8 個頁面元件（由簡至複：garbage → handover → outage → account → dashboard → contract → subsidy → notes）

---

## 8. 不在範疇內

- 後端 (`express`) 任何變更
- 新增功能或頁面
- 修改 Tailwind 主題或設計系統顏色
- 引入狀態管理（Pinia）—— 現有狀態皆為 local state，不需要

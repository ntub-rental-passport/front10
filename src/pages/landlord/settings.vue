<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Crown,
  Database,
  Download,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-vue-next'
import { useLandlordWorkspace } from '@/src/composables/useLandlordWorkspace'
import { useLandlordSettings } from '@/src/composables/useLandlordSettings'

type SettingsCategory = 'workspace' | 'notifications' | 'data' | 'support' | 'legal' | 'security'

interface SettingsItem {
  key: string
  category: SettingsCategory
  title: string
  description: string
  path: string
  icon: typeof UserRound
  badge?: string
  tone?: 'success' | 'warning' | 'neutral'
}

const query = ref('')
const activeCategory = ref<SettingsCategory>('workspace')
const { properties, rooms, loading } = useLandlordWorkspace()
const { state, session, completeness } = useLandlordSettings()

const categories: Array<{ key: SettingsCategory; label: string; icon: typeof UserRound }> = [
  { key: 'workspace', label: '帳號與工作區', icon: UserRound },
  { key: 'notifications', label: '通知與提醒', icon: Bell },
  { key: 'data', label: '資料與紀錄', icon: Database },
  { key: 'support', label: '支援與說明', icon: BookOpen },
  { key: 'legal', label: '法務與版本', icon: ShieldCheck },
  { key: 'security', label: '登入與安全', icon: ShieldCheck },
]

const items = computed<SettingsItem[]>(() => [
  { key: 'account', category: 'workspace', title: '帳號資料', description: '更新名稱、聯絡手機與工作區名稱。', path: '/landlord/settings/account', icon: UserRound, badge: completeness.value === 100 ? '完整' : `${completeness.value}%`, tone: completeness.value === 100 ? 'success' : 'warning' },
  { key: 'team', category: 'workspace', title: '團隊成員', description: '邀請夥伴並設定管理、帳務或檢視權限。', path: '/landlord/settings/team', icon: Users, badge: `${state.members.length + 1} 位` },
  { key: 'plan', category: 'workspace', title: '方案權益與功能', description: '查看目前方案、管理規模與可用功能。', path: '/landlord/settings/plan', icon: Crown, badge: '免費方案', tone: 'success' },
  { key: 'notifications', category: 'notifications', title: '通知偏好', description: '設定租金、合約與報修通知的提醒方式。', path: '/landlord/settings/notifications', icon: Bell, badge: state.lineBound ? 'LINE 已綁定' : 'LINE 未綁定', tone: state.lineBound ? 'success' : 'warning' },
  { key: 'data', category: 'data', title: '資料匯出與備份', description: '匯出房務、租客及租約資料，方便備份交接。', path: '/landlord/settings/data', icon: Download, badge: '可使用', tone: 'success' },
  { key: 'activity', category: 'data', title: '操作紀錄', description: '查看設定、租客及房務資料的重要異動。', path: '/landlord/settings/activity', icon: Activity, badge: `${state.audit.length} 筆` },
  { key: 'support', category: 'support', title: '使用說明與意見回饋', description: '查看常見操作方式，或回報使用問題。', path: '/landlord/settings/support', icon: CircleHelp },
  { key: 'legal', category: 'legal', title: '隱私權與服務條款', description: '查看資料政策、使用條款與系統版本。', path: '/landlord/settings/legal', icon: BookOpen, badge: 'v1.2.0' },
  { key: 'security', category: 'security', title: '登入與安全', description: '檢查登入信箱、裝置狀態與資料安全。', path: '/landlord/settings/security', icon: ShieldCheck, badge: session?.emailVerified ? '正常' : '待驗證', tone: session?.emailVerified ? 'success' : 'warning' },
])

const visibleItems = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return items.value.filter((item) => {
    const matchesCategory = item.category === activeCategory.value
    const matchesKeyword = !keyword || `${item.title}${item.description}`.toLowerCase().includes(keyword)
    return (keyword || matchesCategory) && matchesKeyword
  })
})

const activeLabel = computed(() => categories.find((item) => item.key === activeCategory.value)?.label)
const rentedRooms = computed(() => rooms.value.filter((room) => room.status === 'rented').length)
const healthIssues = computed(() => Number(!state.lineBound) + Number(completeness.value < 100))
</script>

<template>
  <div class="settings-page mx-auto max-w-[1600px] space-y-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#68846d]">Workspace settings</p>
        <h1 class="text-3xl font-black tracking-tight sm:text-4xl">設定</h1>
        <p class="mt-2 text-sm text-[#778078]">管理帳號、工作區、通知偏好與房東資料。</p>
      </div>
      <div class="flex items-center gap-3 rounded-2xl border border-[#dfd9cc] bg-white/80 px-4 py-3">
        <span class="grid h-10 w-10 place-items-center rounded-xl bg-[#e5efe5] font-black text-[#55775c]">{{ state.displayName.slice(0, 1) }}</span>
        <div><strong class="block text-sm">{{ state.displayName }}</strong><small class="text-[#858c86]">{{ session?.email }}</small></div>
      </div>
    </header>

    <section class="overflow-hidden rounded-[1.4rem] border border-[#e2dccf] bg-white/85 shadow-sm">
      <div class="grid md:grid-cols-[1.65fr_repeat(4,1fr)]">
        <div class="flex items-center gap-3 border-b border-[#e7e1d6] p-5 md:border-b-0 md:border-r">
          <span class="grid h-12 w-12 place-items-center rounded-2xl bg-[#e6f0e6] text-[#587b5e]"><Building2 class="h-5 w-5" /></span>
          <div><p class="font-black">{{ state.workspaceName }}</p><small class="text-[#7f877f]">擁有者 · {{ session?.email }}</small></div>
        </div>
        <div class="metric"><small>管理規模</small><strong>{{ loading ? '—' : `${properties.length} 棟 / ${rooms.length} 間` }}</strong></div>
        <div class="metric"><small>目前出租</small><strong>{{ rentedRooms }} 間</strong></div>
        <div class="metric"><small>目前方案</small><strong>免費方案</strong></div>
        <div class="metric"><small>系統狀態</small><strong class="text-[#4f7657]">正常運行</strong></div>
      </div>
    </section>

    <section class="grid overflow-hidden rounded-[1.3rem] border border-[#e2dccf] bg-white/80 sm:grid-cols-3">
      <RouterLink to="/landlord/settings/account" class="health-card"><CheckCircle2 :class="completeness === 100 ? 'text-[#5b8263]' : 'text-[#bd7b2b]'" /><span><small>帳號完整度</small><b>{{ completeness }}%</b></span><ChevronRight /></RouterLink>
      <RouterLink to="/landlord/settings/notifications" class="health-card"><Bell :class="state.lineBound ? 'text-[#5b8263]' : 'text-[#bd7b2b]'" /><span><small>LINE 通知</small><b>{{ state.lineBound ? '已完成綁定' : '尚未綁定' }}</b></span><ChevronRight /></RouterLink>
      <RouterLink to="/landlord/settings/security" class="health-card"><ShieldCheck class="text-[#5b8263]" /><span><small>設定健康度</small><b>{{ healthIssues ? `${healthIssues} 個項目待處理` : '狀態良好' }}</b></span><ChevronRight /></RouterLink>
    </section>

    <div class="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside class="h-fit overflow-hidden rounded-[1.3rem] border border-[#e2dccf] bg-white/80">
        <div class="border-b border-[#e7e1d6] p-4"><h2 class="font-black">設定分類</h2><p class="mt-1 text-xs text-[#899088]">快速前往需要調整的區域</p></div>
        <nav class="space-y-1 p-2.5">
          <button v-for="(category, index) in categories" :key="category.key" class="category-button" :class="{ active: activeCategory === category.key }" @click="activeCategory = category.key; query = ''">
            <span class="text-[10px] opacity-60">0{{ index + 1 }}</span><component :is="category.icon" class="h-4 w-4" /><b>{{ category.label }}</b>
          </button>
        </nav>
      </aside>

      <section class="overflow-hidden rounded-[1.3rem] border border-[#e2dccf] bg-white/85">
        <header class="flex flex-col gap-3 border-b border-[#e7e1d6] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 class="font-black">{{ query ? '搜尋結果' : activeLabel }}</h2><p class="mt-1 text-xs text-[#899088]">{{ visibleItems.length }} 個設定項目</p></div>
          <label class="flex items-center gap-2 rounded-xl border border-[#ded8cc] bg-[#fbfaf6] px-3 py-2 text-sm sm:w-72"><Search class="h-4 w-4 text-[#8b928d]" /><input v-model="query" class="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜尋設定" /></label>
        </header>
        <div v-if="visibleItems.length">
          <RouterLink v-for="item in visibleItems" :key="item.key" :to="item.path" class="setting-row">
            <span class="setting-icon"><component :is="item.icon" /></span>
            <span class="min-w-0 flex-1"><b>{{ item.title }}</b><small>{{ item.description }}</small></span>
            <em v-if="item.badge" :class="item.tone">{{ item.badge }}</em><ChevronRight class="h-4 w-4 text-[#a1a69f]" />
          </RouterLink>
        </div>
        <div v-else class="grid min-h-52 place-items-center p-8 text-center text-sm text-[#858d86]">找不到符合「{{ query }}」的設定。</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.metric { @apply flex min-h-20 flex-col justify-center border-r border-[#e7e1d6] px-5 last:border-r-0; }.metric small { @apply text-xs text-[#899088]; }.metric strong { @apply mt-1 text-sm font-black; }
.health-card { @apply flex items-center gap-3 border-b border-[#e7e1d6] px-5 py-4 transition hover:bg-[#f7faf5] sm:border-b-0 sm:border-r sm:last:border-r-0; }.health-card > svg:first-child { @apply h-5 w-5; }.health-card > svg:last-child { @apply ml-auto h-4 w-4 text-[#a1a69f]; }.health-card span { @apply flex flex-1 flex-col; }.health-card small { @apply text-xs text-[#899088]; }.health-card b { @apply mt-0.5 text-sm; }
.category-button { @apply flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm text-[#687169] transition hover:bg-[#f4f6f1]; }.category-button b { @apply font-semibold; }.category-button.active { @apply bg-[#e8f0e7] text-[#52745a] shadow-[inset_2px_0_0_#5b8263]; }
.setting-row { @apply flex min-h-20 items-center gap-3 border-b border-[#ece6dc] px-5 py-3.5 transition last:border-b-0 hover:bg-[#fafbf7]; }.setting-icon { @apply grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f1f2ed] text-[#68746b]; }.setting-icon :deep(svg) { @apply h-4 w-4; }.setting-row b,.setting-row small { @apply block; }.setting-row b { @apply text-sm; }.setting-row small { @apply mt-1 truncate text-xs text-[#858d86]; }.setting-row em { @apply rounded-full bg-[#f1f0ea] px-2.5 py-1 text-[11px] font-bold not-italic text-[#737b75]; }.setting-row em.success { @apply bg-[#e8f3e9] text-[#53785a]; }.setting-row em.warning { @apply bg-[#fff1de] text-[#ae7025]; }
@media (max-width: 767px) { .metric { @apply border-b border-r-0; } }
</style>

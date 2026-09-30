<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bell, Check, ChevronRight, Database, FileClock, FileSpreadsheet, FileText, LayoutGrid, Scale, ShieldCheck, Sparkles, Users } from 'lucide-vue-next'

type Plan = 'free' | 'plus' | 'pro'
type Category = 'all' | 'included' | 'team' | 'data' | 'records' | 'finance'
const props = defineProps<{ currentPlan: Plan }>()
const activeCategory = ref<Category>('all')
const expanded = ref<string | null>(null)
const rank: Record<Plan, number> = { free: 0, plus: 1, pro: 2 }
const planNames: Record<Plan, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' }
const categories = [
  { key: 'all', label: '全部功能', icon: LayoutGrid },
  { key: 'included', label: '目前已包含', icon: Check },
  { key: 'team', label: '團隊與責任', icon: Users },
  { key: 'data', label: '資料管理', icon: Database },
  { key: 'records', label: '紀錄與交接', icon: FileClock },
  { key: 'finance', label: '帳務與費用', icon: Scale },
] as const
const features: Array<{ id: string; title: string; description: string; detail: string; category: Category; plan: Plan; icon: typeof Bell }> = [
  { id: 'reminders', title: '租金到期提醒', description: '掌握租金收款時間，減少逐筆確認的時間。', detail: 'Plus 與 Pro 方案包含租金到期提醒，可搭配通知設定管理日常收款。', category: 'finance', plan: 'plus', icon: Bell },
  { id: 'tenants', title: '租客與租約管理', description: '集中整理租客聯絡方式、租期與租約資料。', detail: 'Free 包含基本管理功能，Plus 與 Pro 提供完整租客與租約管理。物件與房間數依各方案額度計算。', category: 'data', plan: 'free', icon: FileText },
  { id: 'properties', title: '物件與房間管理', description: '依棟別整理房間，查看出租狀態與管理規模。', detail: 'Free 可管理 1 個物件、5 間房間；Plus 可管理 5 個物件、30 間房間；Pro 不限物件與房間數。', category: 'data', plan: 'free', icon: LayoutGrid },
  { id: 'income', title: '基本收支紀錄', description: '記錄租金收入與日常支出，掌握帳務往來。', detail: '所有方案皆包含基本收支紀錄；如需匯出或進階分析，可查看 Plus 與 Pro 方案。', category: 'finance', plan: 'free', icon: Scale },
  { id: 'repairs', title: '維修工單與進度追蹤', description: '整理報修案件與處理進度，方便持續追蹤。', detail: 'Plus 與 Pro 方案包含維修工單追蹤，集中查看案件處理狀態。', category: 'records', plan: 'plus', icon: FileClock },
  { id: 'export', title: '收支報表匯出', description: '將收支資料整理為報表，方便核對與交接。', detail: 'Plus 與 Pro 方案包含收支報表匯出，適合日常帳務整理與資料交接。', category: 'records', plan: 'plus', icon: FileSpreadsheet },
  { id: 'team', title: '多人團隊協作', description: '讓管理夥伴共同處理房務，分擔日常工作。', detail: 'Pro 方案包含多人團隊協作，可搭配工作區的團隊成員功能管理夥伴。', category: 'team', plan: 'pro', icon: Users },
  { id: 'permissions', title: '自訂通知與權限', description: '依團隊分工安排存取權限與通知偏好。', detail: 'Pro 方案包含自訂通知與權限，適合需要分工的出租管理團隊。', category: 'team', plan: 'pro', icon: ShieldCheck },
  { id: 'reports', title: '進階營運報表', description: '彙整出租營運資料，協助掌握整體表現。', detail: 'Pro 方案提供進階分析報表，適合管理多個出租物件時檢視營運狀況。', category: 'finance', plan: 'pro', icon: Database },
]
const isIncluded = (plan: Plan) => rank[props.currentPlan] >= rank[plan]
const visibleFeatures = computed(() => features.filter(feature => activeCategory.value === 'all' || (activeCategory.value === 'included' ? isIncluded(feature.plan) : feature.category === activeCategory.value)))
watch([activeCategory, () => props.currentPlan], () => { expanded.value = null })
</script>

<template>
  <section class="benefits" aria-labelledby="benefits-heading">
    <header class="benefits-heading">
      <Sparkles aria-hidden="true" />
      <div><h2 id="benefits-heading">功能權益</h2><p>查看目前方案包含的功能，以及其他方案提供的能力。</p></div>
      <span class="preview-label">方案內容展示</span>
    </header>
    <div class="benefits-body">
      <nav class="categories" aria-label="功能權益分類">
        <button v-for="category in categories" :key="category.key" type="button" :class="{ active: activeCategory === category.key }" :aria-pressed="activeCategory === category.key" aria-controls="benefit-list" @click="activeCategory = category.key">
          <component :is="category.icon" aria-hidden="true" /><span>{{ category.label }}</span>
        </button>
      </nav>
      <div id="benefit-list" class="feature-list">
        <p class="sr-only" role="status">{{ visibleFeatures.length }} 項功能</p>
        <article v-for="feature in visibleFeatures" :key="feature.id" class="feature" :class="{ expanded: expanded === feature.id }">
          <button type="button" class="feature-button" :aria-expanded="expanded === feature.id" :aria-controls="`benefit-${feature.id}`" @click="expanded = expanded === feature.id ? null : feature.id">
            <span class="feature-icon"><component :is="feature.icon" aria-hidden="true" /></span>
            <span class="feature-copy"><strong>{{ feature.title }}</strong><span>{{ feature.description }}</span></span>
            <span class="plan-badge" :class="{ available: isIncluded(feature.plan) }">{{ isIncluded(feature.plan) ? '目前已包含' : `${planNames[feature.plan]} 起提供` }}</span>
            <ChevronRight class="feature-chevron" aria-hidden="true" />
          </button>
          <div :id="`benefit-${feature.id}`" v-show="expanded === feature.id" class="feature-detail">
            <p>{{ feature.detail }}</p>
            <a v-if="!isIncluded(feature.plan)" href="#available-plans">查看方案差異 <span aria-hidden="true">→</span></a>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.benefits { overflow: hidden; border: 1px solid #e2dccf; border-radius: 22px; background: #fffdf8; color: #303b32; }
.benefits-heading { display: flex; align-items: center; gap: 14px; padding: 20px 24px; border-bottom: 1px solid #e2dccf; }
.benefits-heading > svg { width: 20px; height: 20px; flex-shrink: 0; color: #6a7d62; }
.benefits-heading h2 { font-size: 17px; font-weight: 750; }
.benefits-heading p { margin-top: 3px; font-size: 12px; line-height: 1.7; color: #85887d; }
.preview-label { margin-left: auto; flex-shrink: 0; font-size: 11px; color: #85887d; }
.benefits-body { display: grid; grid-template-columns: 190px minmax(0, 1fr); }
.categories { padding: 12px; border-right: 1px solid #e2dccf; }
.categories button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 12px; border-radius: 8px; text-align: left; font-size: 13px; color: #7b8176; transition: background .15s; }
.categories button + button { margin-top: 3px; }
.categories button:hover { background: #f1f4ed; }
.categories button.active { background: #eaf1e8; color: #4f6a51; font-weight: 700; }
.categories svg { width: 16px; height: 16px; flex-shrink: 0; }
.feature + .feature { border-top: 1px solid #e2dccf; }
.feature-button { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 78px; padding: 16px 22px; text-align: left; transition: background .15s; }
.feature-button:hover, .feature.expanded { background: #f6f8f1; }
.feature-icon { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 50%; background: #ebf1e7; color: #687f63; }
.feature-icon svg { width: 18px; height: 18px; }
.feature-copy { flex: 1; min-width: 0; }
.feature-copy strong { display: block; font-size: 14px; font-weight: 700; }
.feature-copy > span { display: block; margin-top: 5px; font-size: 12px; line-height: 1.7; color: #85887d; }
.plan-badge { flex-shrink: 0; padding: 4px 10px; border-radius: 8px; background: #f1ede3; color: #85704e; font-size: 11px; white-space: nowrap; }
.plan-badge.available { background: #eaf1e8; color: #506b52; }
.feature-chevron { width: 15px; height: 15px; flex-shrink: 0; color: #94998d; transition: transform .15s; }
.expanded .feature-chevron { transform: rotate(90deg); }
.feature-detail { padding: 0 50px 20px 76px; font-size: 13px; line-height: 1.8; color: #65715f; }
.feature-detail a { display: inline-block; margin-top: 10px; color: #4f7356; font-weight: 700; }
.feature-detail a:hover { text-decoration: underline; }
button:focus-visible, a:focus-visible { outline: 2px solid #628367; outline-offset: -3px; border-radius: 8px; }
@media (max-width: 700px) {
  .benefits-body { grid-template-columns: 1fr; }
  .categories { display: flex; gap: 5px; overflow-x: auto; border-right: 0; border-bottom: 1px solid #e2dccf; }
  .categories button { width: auto; flex-shrink: 0; padding: 10px 12px; }
  .categories button + button { margin-top: 0; }
  .benefits-heading { padding: 18px; }
  .preview-label { display: none; }
  .feature-button { display: grid; grid-template-columns: 36px minmax(0, 1fr) 15px; gap: 8px 12px; padding: 16px; }
  .feature-icon { width: 36px; height: 36px; grid-column: 1; grid-row: 1; }
  .feature-copy { grid-column: 2; grid-row: 1; }
  .feature-chevron { grid-column: 3; grid-row: 1; }
  .plan-badge { grid-column: 2; justify-self: start; }
  .feature-detail { padding: 0 28px 18px 64px; }
}
</style>

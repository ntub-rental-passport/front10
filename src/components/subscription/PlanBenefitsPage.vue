<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeft, ArrowRight, Check, CreditCard, Gauge, Layers3, Sparkles } from 'lucide-vue-next'
import { planFeatures, type PlanRole } from '@/src/utils/subscription-plans'
import { usePlanOverview } from '@/src/composables/usePlanOverview'
import PlanUsage from './PlanUsage.vue'

const props = defineProps<{ role: PlanRole }>()
const { currentPlan, usage, loading, error, refresh } = usePlanOverview(props.role)
const activeGroup = ref('全部功能')
const features = computed(() => planFeatures[props.role])
const groups = computed(() => ['全部功能', ...new Set(features.value.map((row) => row.group))])
const visibleFeatures = computed(() =>
  features.value.filter(
    (row) => activeGroup.value === '全部功能' || row.group === activeGroup.value,
  ),
)
const subscriptionPath = computed(() =>
  props.role === 'landlord' ? '/landlord/subscription' : '/app/subscription',
)
const backPath = computed(() => (props.role === 'landlord' ? '/landlord/settings' : '/app/account'))
// The report marks whole rows with an asterisk even when the Free/basic capability already exists.
const freePlanned = new Set(['室友共享上限', '附件總容量'])
</script>

<template>
  <div class="plans-page" :class="role">
    <RouterLink class="plan-back" :to="backPath"
      ><ArrowLeft :size="16" />{{ role === 'landlord' ? '返回設定' : '返回我的帳戶' }}</RouterLink
    >
    <header class="plans-header">
      <div>
        <p class="plan-eyebrow">YOUR MEMBERSHIP</p>
        <h1>方案權益與功能</h1>
        <p>查看目前方案、使用額度與可用功能。</p>
      </div>
      <RouterLink class="plan-link-button" :to="subscriptionPath"
        ><Layers3 :size="16" />查看方案差異<ArrowRight :size="16"
      /></RouterLink>
    </header>
    <div class="benefits-layout">
      <div class="benefits-main">
        <section class="plan-panel membership-card">
          <div class="membership-icon"><CreditCard :size="26" /></div>
          <div>
            <p class="plan-muted">目前方案</p>
            <h2>{{ currentPlan.name }} <span class="plan-badge">使用中</span></h2>
            <p>{{ currentPlan.description }}</p>
          </div>
          <div class="membership-role">
            <small>{{ role === 'landlord' ? '工作區角色' : '帳戶類型' }}</small
            ><strong>{{ role === 'landlord' ? '擁有者' : '租客' }}</strong>
          </div>
          <p class="membership-footnote">目前提供 Free 基本服務；付費方案及續訂尚未開放。</p>
        </section>
        <section class="plan-panel">
          <header class="plan-panel-heading">
            <div>
              <h2><Gauge :size="20" />使用額度</h2>
              <p>
                {{
                  role === 'landlord'
                    ? '依房務資料與本機成員名冊顯示；上限依營運計畫方案。'
                    : '未知用量以「—」顯示，不代表尚未使用或仍有剩餘額度。'
                }}
              </p>
            </div>
            <button
              v-if="role === 'landlord'"
              class="plan-text-button"
              :disabled="loading"
              @click="refresh"
            >
              {{ loading ? '更新中…' : '更新用量' }}
            </button>
          </header>
          <PlanUsage :items="usage" :loading="loading" />
          <p v-if="error" class="plan-notice" role="alert">資料暫時無法更新，請稍後重試。</p>
        </section>
        <section class="plan-panel">
          <header class="plan-panel-heading">
            <div>
              <h2><Sparkles :size="20" />功能權益</h2>
              <p>查看 Free 包含的功能，以及其他方案的進階權益。</p>
            </div>
          </header>
          <div class="benefits-feature-layout">
            <nav aria-label="功能分類">
              <button
                v-for="group in groups"
                :key="group"
                :aria-pressed="activeGroup === group"
                :class="{ active: activeGroup === group }"
                @click="activeGroup = group"
              >
                {{ group }}
              </button>
            </nav>
            <div>
              <article
                v-for="feature in visibleFeatures"
                :key="feature.label"
                class="benefit-feature"
              >
                <span class="benefit-check"
                  ><Check v-if="feature.values[0] !== '不包含'" :size="18" /><Layers3
                    v-else
                    :size="18"
                /></span>
                <div>
                  <h3>{{ feature.label }}</h3>
                  <p>
                    {{
                      feature.values[0] === '不包含'
                        ? `Plus：${feature.values[1]}；Pro：${feature.values[2]}`
                        : feature.values[0]
                    }}
                  </p>
                </div>
                <span
                  class="plan-badge"
                  :class="{
                    neutral: feature.values[0] === '不包含' || freePlanned.has(feature.label),
                  }"
                  >{{
                    freePlanned.has(feature.label)
                      ? '規劃中'
                      : feature.values[0] === '不包含'
                        ? '進階方案權益'
                        : 'Free 已包含'
                  }}</span
                >
              </article>
            </div>
          </div>
        </section>
      </div>
      <aside class="benefits-aside">
        <section class="plan-panel">
          <header class="plan-panel-heading">
            <h2><CreditCard :size="18" />訂閱與付款</h2>
          </header>
          <div class="benefits-aside-content">
            <span class="plan-badge neutral">免費方案</span>
            <h3>目前無付費訂閱</h3>
            <p>Free 不需綁定信用卡。目前付費訂閱尚未開放，沒有自動續訂扣款。</p>
            <RouterLink class="plan-button" :to="subscriptionPath"
              >比較付費方案<ArrowRight :size="16"
            /></RouterLink>
          </div>
        </section>
        <section class="plan-panel">
          <header class="plan-panel-heading"><h2>最近方案事件</h2></header>
          <div class="benefits-aside-content"><p>尚無可顯示的付款或訂閱紀錄。</p></div>
        </section>
        <section class="benefits-help">
          <h3>額度達上限也不用擔心</h3>
          <p>
            規劃保留基本查閱與下載，超額時先限制新增，不立即刪除既有紀錄。方案額度與扣款規則以正式開放時的說明為準。
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>

<style src="./subscription.css"></style>

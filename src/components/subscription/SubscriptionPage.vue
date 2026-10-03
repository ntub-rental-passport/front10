<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, Check, CreditCard, Sparkles } from 'lucide-vue-next'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  annualSavings,
  billingAmount,
  monthlyEquivalent,
  planFeatures,
  subscriptionPlans,
  type BillingCycle,
  type PlanKey,
  type PlanRole,
} from '@/src/utils/subscription-plans'
import { usePlanOverview } from '@/src/composables/usePlanOverview'
import PlanUsage from './PlanUsage.vue'
import SubscriptionCheckout from './SubscriptionCheckout.vue'

const props = defineProps<{ role: PlanRole }>()
const { currentPlan, usage, loading, error, refresh } = usePlanOverview(props.role)
const cycle = ref<BillingCycle>('monthly')
const onlyDifferences = ref(false)
const selected = ref<PlanKey | null>(null)
const dialogOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null
  },
})
const plans = computed(() => subscriptionPlans[props.role])
const selectedPlan = computed(() => plans.value.find((plan) => plan.key === selected.value))
const features = computed(() =>
  planFeatures[props.role].filter((row) => !onlyDifferences.value || new Set(row.values).size > 1),
)
const groups = computed(() => [...new Set(features.value.map((row) => row.group))])
const benefitsPath = computed(() =>
  props.role === 'landlord' ? '/landlord/settings/plan' : '/app/account/plan',
)
const currency = (value: number) => value.toLocaleString('zh-TW')
</script>

<template>
  <div class="plans-page" :class="role">
    <header class="plans-header">
      <div>
        <p class="plan-eyebrow">RENTMATE / MEMBERSHIP</p>
        <h1>方案與訂閱</h1>
        <p>
          {{
            role === 'landlord'
              ? '從第一個出租物件，到一起管理的團隊。'
              : '從安心租屋，到一起生活的每一天。'
          }}找到適合現在的方案。
        </p>
      </div>
      <RouterLink class="plan-link-button" :to="benefitsPath"
        ><CreditCard :size="17" />方案權益與功能<ArrowRight :size="16"
      /></RouterLink>
    </header>

    <section class="plan-panel current-overview" aria-label="目前方案與使用額度">
      <div class="current-overview-heading">
        <div>
          <span class="plan-muted">目前方案</span>
          <h2>{{ currentPlan.name }} <span class="plan-badge">使用中</span></h2>
        </div>
        <p>目前提供 Free 基本服務，付費訂閱尚未開放。</p>
      </div>
      <PlanUsage :items="usage" :loading="loading" compact />
      <p v-if="error" class="plan-notice" role="alert">
        用量暫時無法更新。<button @click="refresh">重新整理</button>
      </p>
    </section>

    <section class="plan-intro">
      <div>
        <p class="plan-eyebrow">CHOOSE YOUR PLAN</p>
        <h2>{{ role === 'landlord' ? '讓管理隨規模成長' : '基本生活免費，進階整理按需升級' }}</h2>
        <p>價格均為含稅規劃。年繳相當於付 10 個月，省下 2 個月。</p>
      </div>
      <div class="plan-cycle" aria-label="計費週期">
        <button
          :aria-pressed="cycle === 'monthly'"
          :class="{ active: cycle === 'monthly' }"
          @click="cycle = 'monthly'"
        >
          月繳</button
        ><button
          :aria-pressed="cycle === 'yearly'"
          :class="{ active: cycle === 'yearly' }"
          @click="cycle = 'yearly'"
        >
          年繳 <span>省 2 個月</span>
        </button>
      </div>
    </section>

    <section class="plan-cards" aria-label="訂閱方案">
      <article
        v-for="plan in plans"
        :key="plan.key"
        class="plan-card"
        :class="{ recommended: plan.key === 'plus', current: plan.key === currentPlan.key }"
      >
        <div class="plan-card-top">
          <span>{{ plan.key.toUpperCase() }}</span
          ><span v-if="plan.key === 'plus'"><Sparkles :size="13" />推薦方案</span
          ><span v-else-if="plan.key === currentPlan.key">目前方案</span>
        </div>
        <h2>{{ plan.name }}</h2>
        <p class="plan-description">{{ plan.description }}</p>
        <div class="plan-price">
          <strong>NT$ {{ currency(billingAmount(plan, cycle)) }}</strong
          ><span>{{ plan.key === 'free' ? '／免費' : cycle === 'yearly' ? '／年' : '／月' }}</span>
        </div>
        <p class="plan-price-note">
          {{
            plan.key === 'free'
              ? '基本功能持續免費使用'
              : cycle === 'yearly'
                ? `月均 NT$ ${monthlyEquivalent(plan)} · 每年省 NT$ ${currency(annualSavings(plan))}`
                : `年繳 NT$ ${currency(plan.annual)} · 每年省 NT$ ${currency(annualSavings(plan))}`
          }}
        </p>
        <strong class="plan-scale">{{ plan.scale }}</strong>
        <ul>
          <li v-for="feature in plan.highlights" :key="feature">
            <Check :size="16" /><span>{{ feature }}</span>
          </li>
        </ul>
        <button
          class="plan-button"
          :class="{ secondary: plan.key !== 'plus' }"
          :disabled="plan.key === currentPlan.key"
          @click="selected = plan.key"
        >
          {{
            plan.key === currentPlan.key
              ? '目前使用中'
              : `了解 ${plan.key === 'plus' ? 'Plus' : 'Pro'} 方案`
          }}<ArrowRight v-if="plan.key !== currentPlan.key" :size="16" />
        </button>
      </article>
    </section>

    <section class="plan-panel comparison">
      <header class="plan-panel-heading">
        <div>
          <h2>方案功能比較</h2>
          <p>從管理額度到日常功能，一次看清楚差異。</p>
        </div>
        <label class="plan-difference"
          ><input v-model="onlyDifferences" type="checkbox" />只顯示差異</label
        >
      </header>
      <div class="plan-table-scroll" tabindex="0" role="region" aria-label="方案比較表，可左右捲動">
        <table>
          <caption class="sr-only">
            {{
              role === 'landlord' ? '房東' : '租客'
            }}訂閱方案完整比較
          </caption>
          <thead>
            <tr>
              <th scope="col">功能與權益</th>
              <th v-for="plan in plans" :key="plan.key" scope="col">{{ plan.name }}</th>
            </tr>
          </thead>
          <tbody v-for="group in groups" :key="group">
            <tr class="plan-group">
              <th colspan="4" scope="rowgroup">{{ group }}</th>
            </tr>
            <tr v-for="row in features.filter((item) => item.group === group)" :key="row.label">
              <th scope="row">{{ row.label }}<small v-if="row.planned">含規劃中權益＊</small></th>
              <td v-for="(value, index) in row.values" :key="index">
                <Check v-if="value === '包含'" :size="18" aria-label="包含" /><span
                  v-else
                  :class="{ 'plan-muted': value === '不包含' }"
                  >{{ value }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="plan-table-note">
        ＊依營運計畫書，新增彙整、匯出、自動化及協作等部分權益仍在規劃中；既有基本查閱、紀錄與原始資料下載不受影響。
      </p>
    </section>

    <section class="plan-bottom-grid">
      <article class="plan-panel plan-policy">
        <p class="plan-eyebrow">GOOD TO KNOW</p>
        <h2>選擇前，先了解這些</h2>
        <details open>
          <summary>額度如何計算？</summary>
          <p v-if="role === 'landlord'">
            物件數、房間數與管理者席次均須符合方案上限；席次包含工作區擁有者，不包含租客。超過 100
            間房或有特殊需求，需另行評估方案。AI、OCR、照片與通知另設使用上限，並非不限量。
          </p>
          <p v-else>
            AI 分析每次限 1 份、不超過 10
            頁的契約；系統失敗重試不重複扣點，另提交新版契約才扣點。月額度按月重置、不累積，年繳不會一次發放全年額度。
          </p>
        </details>
        <details>
          <summary>降級或付款失敗，資料還在嗎？</summary>
          <p>
            規劃保留基本查閱與下載；超額時先限制新增，不立即刪除既有紀錄。正式續訂、退款及降級規則會於付款前清楚列出。
          </p>
        </details>
        <details>
          <summary>{{ role === 'landlord' ? '有免費試用嗎？' : '室友共享如何計費？' }}</summary>
          <p>
            {{
              role === 'landlord'
                ? '規劃 Plus 14 天免綁卡試用，結束後回到 Free；目前尚未開放啟用。'
                : '一個共享空間由一位訂閱者付費，人數上限包含訂閱者。AI 額度與容量由空間共用，受邀室友不另計入付費戶數。'
            }}
          </p>
        </details>
      </article>
      <article class="plan-panel plan-policy plan-accent-panel">
        <Sparkles :size="26" />
        <h2>{{ role === 'tenant' ? '偶爾分析，也有彈性選擇' : '先把日常管理做好' }}</h2>
        <p>
          {{
            role === 'tenant'
              ? '規劃 NT$ 39 單次契約檢查包：包含 1 次契約分析及該次報告匯出，不自動續訂。'
              : '保留基本房務、租客與租約管理；再依物件規模與團隊需求，選擇適合的進階工具。'
          }}
        </p>
        <span class="plan-badge">{{
          role === 'tenant' ? '加購功能規劃中' : 'Plus 包含 Free · Pro 包含 Plus'
        }}</span
        ><RouterLink :to="benefitsPath">查看我的方案權益 <ArrowRight :size="16" /></RouterLink>
      </article>
    </section>

    <Dialog v-model:open="dialogOpen">
      <DialogContent
        class="checkout-dialog w-[calc(100%-2rem)] max-w-[560px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[18px] border-0 p-0 gap-0"
      >
        <SubscriptionCheckout
          v-if="selectedPlan"
          :plan="selectedPlan"
          :role="role"
          v-model:cycle="cycle"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>

<style src="./subscription.css"></style>

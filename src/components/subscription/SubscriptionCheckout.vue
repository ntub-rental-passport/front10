<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CreditCard, LockKeyhole, Check, ArrowRight } from 'lucide-vue-next'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  annualSavings,
  billingAmount,
  monthlyEquivalent,
  type BillingCycle,
  type PlanRole,
  type SubscriptionPlan,
} from '@/src/utils/subscription-plans'

const props = defineProps<{ plan: SubscriptionPlan; role: PlanRole; cycle: BillingCycle }>()
const emit = defineEmits<{ 'update:cycle': [value: BillingCycle] }>()
const agreed = ref(false)
const showTerms = ref(false)
const submitted = ref(false)
const amount = computed(() => billingAmount(props.plan, props.cycle).toLocaleString('zh-TW'))
const privacyUrl = `${import.meta.env.BASE_URL}rentmate-privacy-policy.pdf`
watch(
  () => [props.plan.key, props.cycle],
  () => {
    agreed.value = false
    submitted.value = false
  },
)
function submit() {
  if (agreed.value) submitted.value = true
}
</script>

<template>
  <div class="checkout" :class="role">
    <DialogHeader class="checkout-heading">
      <p class="checkout-kicker">RENTMATE MEMBERSHIP</p>
      <DialogTitle class="checkout-title">訂閱 {{ plan.name }}</DialogTitle>
      <DialogDescription class="checkout-subtitle"
        >確認方案與付款週期，為下一段租屋生活做好準備。</DialogDescription
      >
    </DialogHeader>
    <form class="checkout-body" @submit.prevent="submit">
      <fieldset class="checkout-field">
        <legend>付款週期</legend>
        <div class="checkout-cycle">
          <button
            type="button"
            :aria-pressed="cycle === 'monthly'"
            :class="{ active: cycle === 'monthly' }"
            @click="emit('update:cycle', 'monthly')"
          >
            月繳<small>每月 NT$ {{ plan.monthly }}</small>
          </button>
          <button
            type="button"
            :aria-pressed="cycle === 'yearly'"
            :class="{ active: cycle === 'yearly' }"
            @click="emit('update:cycle', 'yearly')"
          >
            年繳 <span>省 2 個月</span
            ><small>每年 NT$ {{ plan.annual.toLocaleString('zh-TW') }}</small>
          </button>
        </div>
      </fieldset>

      <fieldset class="checkout-field">
        <legend>付款方式</legend>
        <label class="checkout-payment"
          ><span class="checkout-payment-icon"><CreditCard :size="22" /></span
          ><span><strong>綠界付款</strong><small>信用卡定期定額・依所選週期自動續訂</small></span
          ><input type="radio" name="payment-provider" value="ecpay" checked aria-label="綠界付款"
        /></label>
      </fieldset>

      <section class="checkout-total" aria-label="付款金額" aria-live="polite">
        <div>
          <strong>本次付款</strong
          ><span class="checkout-amount">NT$ {{ amount }}<small>含稅</small></span>
        </div>
        <p v-if="cycle === 'yearly'">
          月均 NT$ {{ monthlyEquivalent(plan) }}，每年省 NT$ {{ annualSavings(plan) }}。
        </p>
        <p v-else>每月付款一次，依月繳週期續訂。</p>
      </section>

      <div class="checkout-rules">
        <h3><LockKeyhole :size="14" />付款規則</h3>
        <p>
          正式開放後，須經綠界確認首筆付款成功才會啟用方案。預計依所選週期自動續訂；續訂金額、取消方式及升降級規則會在正式付款前提供完整說明。
        </p>
        <p class="checkout-preview-note">
          目前為訂閱介面預覽，付款尚未開放，不會扣款或變更目前方案。
        </p>
      </div>

      <div class="checkout-agreement">
        <input id="checkout-consent" v-model="agreed" type="checkbox" />
        <div>
          <label for="checkout-consent">我已確認方案、金額與續訂方式，並同意</label>
          <button
            type="button"
            class="checkout-text-link"
            :aria-expanded="showTerms"
            aria-controls="checkout-terms"
            @click="showTerms = !showTerms"
          >
            服務條款
          </button>
          及
          <a class="checkout-text-link" :href="privacyUrl" target="_blank" rel="noopener noreferrer"
            >隱私權政策<span class="sr-only">（另開新分頁）</span></a
          >。
        </div>
      </div>
      <section v-if="showTerms" id="checkout-terms" class="checkout-terms">
        <h3>服務條款說明</h3>
        <p>
          目前僅提供方案與訂閱流程預覽，勾選不會成立付費訂閱。正式訂閱條款尚未發布；開放付款時將提供完整條款並重新取得同意。
        </p>
      </section>
      <p v-if="submitted" class="checkout-feedback" role="status">
        <Check :size="17" />已確認方案選擇。綠界付款尚未開放，目前維持 Free 方案。
      </p>
      <button class="checkout-submit" type="submit" :disabled="!agreed">
        <LockKeyhole :size="16" />使用綠界付款訂閱<ArrowRight :size="16" />
      </button>
      <p class="checkout-footer">付款功能尚未開放 · 此步驟不會收取費用</p>
    </form>
  </div>
</template>

<style scoped>
.checkout {
  --checkout-accent: #55775c;
  --checkout-soft: #f0f5ef;
  --checkout-line: #e9e3d9;
  --checkout-muted: #7b817a;
  color: #29372e;
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
}
.checkout.tenant {
  --checkout-accent: #5746b5;
  --checkout-soft: #f3f0fb;
  --checkout-line: #e6e2ef;
  --checkout-muted: #7a788a;
  color: #27243d;
}
.checkout-heading {
  padding: 24px 28px 20px;
  border-bottom: 1px solid var(--checkout-line);
  text-align: left;
  gap: 6px;
}
.checkout-kicker {
  font-size: 9px;
  letter-spacing: 0.16em;
  font-weight: 750;
  color: var(--checkout-accent);
  margin: 0 0 3px;
}
.checkout-title {
  font-size: 21px;
  font-weight: 750;
  padding-right: 20px;
}
.checkout-subtitle {
  font-size: 12px;
  line-height: 1.7;
  color: var(--checkout-muted);
}
.checkout-body {
  padding: 22px 28px 18px;
  display: flex;
  flex-direction: column;
  gap: 19px;
}
.checkout-field {
  padding: 0;
  margin: 0;
  border: 0;
  min-width: 0;
}
.checkout-field legend {
  font-size: 12px;
  font-weight: 650;
  color: var(--checkout-muted);
  margin-bottom: 9px;
}
.checkout-cycle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #f4f2ed;
  border-radius: 11px;
  padding: 4px;
  gap: 4px;
}
.tenant .checkout-cycle {
  background: #f1eff6;
}
.checkout-cycle button {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--checkout-muted);
  cursor: pointer;
}
.checkout-cycle button.active {
  background: #fff;
  color: var(--checkout-accent);
  border-color: var(--checkout-line);
  box-shadow: 0 2px 5px #00000004;
}
.checkout-cycle small {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  font-weight: 400;
}
.checkout-cycle span {
  font-size: 9px;
  border-radius: 4px;
  padding: 2px 4px;
  background: var(--checkout-soft);
  color: var(--checkout-accent);
  margin-left: 4px;
}
.checkout-payment {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--checkout-accent);
  border-radius: 10px;
  padding: 14px;
  background: var(--checkout-soft);
  cursor: pointer;
}
.checkout-payment-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: #ffffffaa;
  border-radius: 50%;
  color: var(--checkout-accent);
  flex-shrink: 0;
}
.checkout-payment strong {
  font-size: 14px;
}
.checkout-payment small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--checkout-muted);
  line-height: 1.6;
}
.checkout-payment input {
  margin-left: auto;
  accent-color: var(--checkout-accent);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.checkout-total {
  border-top: 1px solid var(--checkout-line);
  border-bottom: 1px solid var(--checkout-line);
  padding: 16px 0;
}
.checkout-total > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.checkout-total strong {
  font-size: 13px;
  color: var(--checkout-muted);
}
.checkout-amount {
  font-size: 25px;
  font-weight: 750;
  letter-spacing: -0.03em;
}
.checkout-amount small {
  font-size: 10px;
  font-weight: 400;
  color: var(--checkout-muted);
  margin-left: 8px;
}
.checkout-total p {
  font-size: 11px;
  color: var(--checkout-muted);
  margin: 5px 0 0;
  text-align: right;
}
.checkout-rules,
.checkout-terms {
  background: #f8f6f1;
  border-radius: 10px;
  padding: 14px 16px;
}
.tenant .checkout-rules,
.tenant .checkout-terms {
  background: #f7f6fa;
}
.checkout h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  margin: 0 0 7px;
}
.checkout-rules p,
.checkout-terms p {
  margin: 0;
  font-size: 11px;
  line-height: 1.9;
  color: var(--checkout-muted);
}
.checkout-rules .checkout-preview-note {
  color: var(--checkout-accent);
  margin-top: 6px;
  font-weight: 550;
}
.checkout-agreement {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 11px;
  color: var(--checkout-muted);
  line-height: 1.9;
}
.checkout-agreement > input {
  margin-top: 3px;
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  accent-color: var(--checkout-accent);
}
.checkout-agreement label {
  cursor: pointer;
}
.checkout-text-link {
  color: var(--checkout-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  font-weight: 650;
  cursor: pointer;
}
.checkout-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  min-height: 47px;
  border: 0;
  border-radius: 10px;
  background: var(--checkout-accent);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.checkout-submit:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
.checkout-submit > svg:last-child {
  margin-left: auto;
}
.checkout-submit > svg:first-child {
  margin-right: auto;
}
.checkout-submit {
  padding: 12px 18px;
}
.checkout :is(button, input, a):focus-visible {
  outline: 3px solid var(--checkout-accent);
  outline-offset: 3px;
}
.checkout-footer {
  text-align: center;
  color: var(--checkout-muted);
  font-size: 10px;
  margin: -8px 0 0;
}
.checkout-feedback {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--checkout-soft);
  color: var(--checkout-accent);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.7;
  margin: 0;
}
.checkout-feedback svg {
  flex-shrink: 0;
  margin-top: 2px;
}
@media (max-width: 520px) {
  .checkout-heading {
    padding: 22px 20px 16px;
  }
  .checkout-body {
    padding: 18px 20px 16px;
    gap: 16px;
  }
  .checkout-title {
    font-size: 19px;
  }
  .checkout-payment {
    padding: 12px;
    gap: 9px;
  }
  .checkout-payment small {
    font-size: 10px;
  }
}
</style>

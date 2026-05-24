<template>
  <div class="page-wrap">
    <SectionTabs group="subsidy" />

    <!-- Topbar -->
    <div class="page-topbar">
      <div class="breadcrumb">租補申請管理 / <span>資格試算</span></div>
      <div class="topbar-right">{{ today }}</div>
    </div>

    <!-- Heading -->
    <div class="page-heading">
      <h1 class="page-title">租金補貼資格試算</h1>
      <p class="page-sub">回答以下問題，快速了解是否符合申請資格，並預估可領取補貼金額</p>
    </div>

    <!-- 步驟進度 -->
    <div class="step-progress-wrap">
      <div
        v-for="(s, i) in stepDefs"
        :key="i"
        class="step-node"
        :class="{ done: currentStep > i + 1, active: currentStep === i + 1 }"
      >
        <div class="step-circle">
          <span v-if="currentStep > i + 1">✓</span>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <div class="step-label">{{ s }}</div>
        <div v-if="i < stepDefs.length - 1" class="step-connector"></div>
      </div>
    </div>

    <!-- 主內容 -->
    <div class="page-body">
      <transition name="slide-fade" mode="out-in">
        <!-- STEP 1 -->
        <div v-if="currentStep === 1" key="s1" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">基本身分資料</span>
              <span class="step-badge">STEP 01 / 03</span>
            </div>
            <div class="card-body">
              <div class="field-group">
                <label class="field-label">年齡區間</label>
                <div class="radio-grid cols-3">
                  <label
                    v-for="o in ageOptions"
                    :key="o.value"
                    class="radio-card"
                    :class="{ selected: form.age === o.value }"
                    @click="form.age = o.value"
                  >
                    <span class="rc-icon">{{ o.icon }}</span>
                    <span class="rc-text">{{ o.label }}</span>
                  </label>
                </div>
              </div>
              <div class="field-group">
                <label class="field-label">戶籍地與租屋地關係</label>
                <div class="radio-list">
                  <label
                    v-for="o in residenceOptions"
                    :key="o.value"
                    class="radio-row"
                    :class="{ selected: form.residence === o.value }"
                    @click="form.residence = o.value"
                  >
                    <span class="rr-dot" :class="{ active: form.residence === o.value }"></span>
                    <div>
                      <div class="rr-title">{{ o.label }}</div>
                      <div class="rr-hint">{{ o.hint }}</div>
                    </div>
                  </label>
                </div>
              </div>
              <div class="field-group">
                <label class="field-label">目前居住縣市</label>
                <select class="select-field" v-model="form.city">
                  <option value="">請選擇縣市</option>
                  <option v-for="c in cities" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
            </div>
            <div class="card-footer">
              <button class="btn-primary" :disabled="!step1Valid" @click="currentStep = 2">
                下一步：家庭資料 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">💡</div>
              <div class="info-title">試算說明</div>
              <div class="info-text">
                本試算依據內政部租金補貼相關規定，結果僅供參考，實際資格以各縣市主管機關審核為準。
              </div>
            </div>
            <div class="card info-card" style="margin-top: 12px">
              <div class="info-icon">📋</div>
              <div class="info-title">申請資格概要</div>
              <ul class="info-list">
                <li>設籍與租屋地不同鄉鎮</li>
                <li>家庭年收入符合所得限制</li>
                <li>無自有住宅</li>
                <li>具書面租賃契約</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- STEP 2 -->
        <div v-else-if="currentStep === 2" key="s2" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">家庭與收入狀況</span>
              <span class="step-badge">STEP 02 / 03</span>
            </div>
            <div class="card-body">
              <div class="field-group">
                <label class="field-label">家庭人口數（含本人）</label>
                <div class="counter-row">
                  <button
                    class="counter-btn"
                    @click="form.familySize = Math.max(1, form.familySize - 1)"
                  >
                    −
                  </button>
                  <span class="counter-val">{{ form.familySize }} 人</span>
                  <button
                    class="counter-btn"
                    @click="form.familySize = Math.min(10, form.familySize + 1)"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="field-group">
                <label class="field-label">家庭年收入（萬元）</label>
                <input
                  type="range"
                  class="slider"
                  min="0"
                  max="200"
                  step="5"
                  v-model.number="form.income"
                />
                <div class="slider-labels">
                  <span>0</span>
                  <span class="slider-val">{{ form.income }} 萬</span>
                  <span>200+</span>
                </div>
                <div class="income-tag-row">
                  <span class="tag" :class="incomeLevel.cls">{{ incomeLevel.label }}</span>
                  <span class="income-desc">{{ incomeLevel.desc }}</span>
                </div>
              </div>
              <div class="field-group">
                <label class="field-label">特殊身分（可複選）</label>
                <div class="radio-grid cols-2">
                  <label
                    v-for="o in specialOptions"
                    :key="o.value"
                    class="radio-card"
                    :class="{ selected: form.special.includes(o.value) }"
                    @click="toggleSpecial(o.value)"
                  >
                    <span class="rc-icon">{{ o.icon }}</span>
                    <span class="rc-text">{{ o.label }}</span>
                    <span class="rc-check" v-if="form.special.includes(o.value)">✓</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="card-footer two-btn">
              <button class="btn-outline" @click="currentStep = 1">← 上一步</button>
              <button class="btn-primary" :disabled="!step2Valid" @click="currentStep = 3">
                下一步：租屋資訊 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">🏠</div>
              <div class="info-title">收入認定說明</div>
              <div class="info-text">家庭年收入以最近一年度綜合所得稅申報資料為準。</div>
            </div>
            <div class="card info-card" style="margin-top: 12px">
              <div class="info-icon">📊</div>
              <div class="info-title">即時收入試算</div>
              <div class="limit-row">
                <span class="limit-label">所得上限</span
                ><span class="limit-val">{{ Math.min(form.familySize * 24, 120) }} 萬元</span>
              </div>
              <div class="limit-row">
                <span class="limit-label">您的收入</span
                ><span
                  class="limit-val"
                  :class="
                    form.income <= Math.min(form.familySize * 24, 120) ? 'val-ok' : 'val-over'
                  "
                  >{{ form.income }} 萬元</span
                >
              </div>
              <div
                class="limit-status"
                :class="form.income <= Math.min(form.familySize * 24, 120) ? 'ok' : 'over'"
              >
                {{
                  form.income <= Math.min(form.familySize * 24, 120)
                    ? '✓ 符合收入條件'
                    : '✗ 超過收入上限'
                }}
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 3 -->
        <div v-else-if="currentStep === 3" key="s3" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">租屋資訊</span>
              <span class="step-badge">STEP 03 / 03</span>
            </div>
            <div class="card-body">
              <div class="field-group">
                <label class="field-label">每月租金（元）</label>
                <div class="input-unit">
                  <input
                    class="text-input"
                    type="number"
                    v-model.number="form.rent"
                    placeholder="例如：8000"
                    min="0"
                  />
                  <span class="unit">元 / 月</span>
                </div>
              </div>
            </div>
            <div class="card-footer two-btn">
              <button class="btn-outline" @click="currentStep = 2">← 上一步</button>
              <button class="btn-primary" :disabled="!step3Valid" @click="currentStep = 4">
                查看試算結果 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">💰</div>
              <div class="info-title">各縣市補貼上限</div>
              <div class="city-limit-list">
                <div class="city-row">
                  <span>台北市</span><span class="city-amt">6,000 元/月</span>
                </div>
                <div class="city-row">
                  <span>新北、桃園</span><span class="city-amt">5,500 元/月</span>
                </div>
                <div class="city-row">
                  <span>六都（其餘）</span><span class="city-amt">5,000 元/月</span>
                </div>
                <div class="city-row">
                  <span>其他縣市</span><span class="city-amt">4,000 元/月</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 結果頁 -->
        <div v-else-if="currentStep === 4" key="s4" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">試算結果</span>
              <span
                class="card-badge"
                :class="result.eligible ? 'status-success' : 'status-danger'"
              >
                {{ result.eligible ? '初步符合' : '不符合' }}
              </span>
            </div>
            <div class="card-body">
              <div v-if="result.eligible" class="amount-block">
                <div class="amount-label">預估每月補貼金額</div>
                <div class="amount-row">
                  <span class="amount-num">{{ result.monthlyAmount.toLocaleString() }}</span>
                  <span class="amount-unit">元 / 月</span>
                </div>
                <div class="amount-annual">
                  每年最高補貼 NT$ {{ (result.monthlyAmount * 12).toLocaleString() }} 元
                </div>
              </div>
              <div v-else class="ineligible-block">
                <div class="ineligible-icon">😔</div>
                <div class="ineligible-text">{{ result.summary }}</div>
              </div>
              <div class="check-list" style="margin-top: 16px">
                <div class="check-section-title">條件檢核</div>
                <div
                  v-for="r in result.reasons"
                  :key="r.text"
                  class="check-row"
                  :class="r.pass ? 'pass' : 'fail'"
                >
                  <span class="check-icon">{{ r.pass ? '✓' : '✗' }}</span>
                  <span>{{ r.text }}</span>
                </div>
              </div>
            </div>
            <div class="card-footer two-btn">
              <button class="btn-outline" @click="reset">重新試算</button>
              <button v-if="result.eligible" class="btn-primary" @click="goApply">
                前往申請 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">📋</div>
              <div class="info-title">您的試算摘要</div>
              <div class="summary-rows">
                <div class="sum-row">
                  <span>年齡區間</span
                  ><span>{{ ageOptions.find((o) => o.value === form.age)?.label }}</span>
                </div>
                <div class="sum-row">
                  <span>居住縣市</span><span>{{ form.city }}</span>
                </div>
                <div class="sum-row">
                  <span>家庭人口</span><span>{{ form.familySize }} 人</span>
                </div>
                <div class="sum-row">
                  <span>家庭年收入</span><span>{{ form.income }} 萬元</span>
                </div>
                <div class="sum-row">
                  <span>每月租金</span><span>NT$ {{ form.rent?.toLocaleString() }}</span>
                </div>
              </div>
            </div>
            <div class="card info-card" style="margin-top: 12px">
              <div class="info-icon">⚠️</div>
              <div class="info-title">注意事項</div>
              <div class="info-text">
                試算結果僅供參考，實際資格及補貼金額以各縣市主管機關審核核定為準。
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import SectionTabs from '@/src/components/section-tabs.vue'

const router = useRouter()

const today = new Date()
  .toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\//g, '-')
const stepDefs = ['基本資料', '家庭收入', '租屋資訊', '試算結果']
const currentStep = ref(1)
const form = ref({
  age: '',
  residence: '',
  city: '',
  familySize: 1,
  income: 60,
  special: [],
  rent: null,
})

const ageOptions = [
  { value: 'youth', label: '18–40 歲', icon: '🧑' },
  { value: 'middle', label: '41–64 歲', icon: '👨‍💼' },
  { value: 'senior', label: '65 歲以上', icon: '👴' },
]
const residenceOptions = [
  { value: 'diff', label: '戶籍地與租屋地不同縣市', hint: '符合一般租金補貼申請條件' },
  { value: 'same_city', label: '同縣市但不同鄉鎮', hint: '部分縣市方案仍可申請' },
  { value: 'same', label: '戶籍地就在租屋處', hint: '通常不符合補助條件' },
]
const cities = [
  '台北市',
  '新北市',
  '桃園市',
  '台中市',
  '台南市',
  '高雄市',
  '基隆市',
  '新竹市',
  '新竹縣',
  '苗栗縣',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義市',
  '嘉義縣',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '台東縣',
  '澎湖縣',
  '金門縣',
  '連江縣',
]
const specialOptions = [
  { value: 'disability', label: '身心障礙', icon: '♿' },
  { value: 'lowIncome', label: '低收/中低收', icon: '🏠' },
  { value: 'indigenous', label: '原住民族', icon: '🌿' },
  { value: 'singleParent', label: '單親家庭', icon: '👨‍👧' },
  { value: 'senior', label: '獨居老人', icon: '👴' },
  { value: 'none', label: '無特殊身分', icon: '👤' },
]

const incomeLevel = computed(() => {
  const i = form.value.income
  if (i <= 40) return { label: '低收入', cls: 'tag-red', desc: '可能符合較高補助額度' }
  if (i <= 80) return { label: '中低收入', cls: 'tag-orange', desc: '符合一般補助資格門檻' }
  if (i <= 120) return { label: '中等收入', cls: 'tag-blue', desc: '視家庭人口數評估' }
  return { label: '較高收入', cls: 'tag-gray', desc: '超過收入上限可能不符資格' }
})
const step1Valid = computed(() => form.value.age && form.value.residence && form.value.city)
const step2Valid = computed(() => form.value.familySize > 0)
const step3Valid = computed(() => form.value.rent > 0)

function toggleSpecial(val) {
  if (val === 'none') {
    form.value.special = ['none']
    return
  }
  form.value.special = form.value.special.filter((v) => v !== 'none')
  const idx = form.value.special.indexOf(val)
  if (idx > -1) form.value.special.splice(idx, 1)
  else form.value.special.push(val)
}

const result = computed(() => {
  const f = form.value
  const reasons = []
  let eligible = true
  const residenceOk = f.residence === 'diff' || f.residence === 'same_city'
  reasons.push({ text: '戶籍地與租屋地符合規定', pass: residenceOk })
  if (!residenceOk) eligible = false
  const incomeLimit = Math.min(f.familySize * 24, 120)
  const incomeOk = f.income <= incomeLimit
  reasons.push({ text: `家庭年收入符合所得上限（≤ ${incomeLimit} 萬元）`, pass: incomeOk })
  if (!incomeOk) eligible = false
  reasons.push({
    text: f.age === 'youth' ? '青年族群，可申請青年租金補貼加碼' : '年齡條件確認',
    pass: true,
  })
  let monthlyAmount = 0
  if (eligible) {
    const cityLimit =
      f.city === '台北市'
        ? 6000
        : ['新北市', '桃園市'].includes(f.city)
          ? 5500
          : ['台中市', '台南市', '高雄市'].includes(f.city)
            ? 5000
            : 4000
    const base = Math.min(f.rent, cityLimit)
    let factor = f.income <= 40 ? 1.0 : f.income <= 80 ? 0.8 : 0.6
    const hasSpecial = f.special.some((v) =>
      ['disability', 'lowIncome', 'indigenous', 'singleParent', 'senior'].includes(v),
    )
    if (hasSpecial) factor = Math.min(factor + 0.1, 1.0)
    monthlyAmount = Math.round((base * factor) / 100) * 100
  }
  return {
    eligible,
    summary: '依目前資料，有條件尚未符合，請調整後重新試算。',
    reasons,
    monthlyAmount,
  }
})

function reset() {
  currentStep.value = 1
  form.value = {
    age: '',
    residence: '',
    city: '',
    familySize: 1,
    income: 60,
    special: [],
    rent: null,
  }
}

function goApply() {
  router.push('/app/subsidy/apply')
}
</script>

<style scoped>
.page-wrap {
  --c-primary: #4845A5;
  --c-primary-light: #F0EFFE;
  --c-primary-dark: #393684;
  --c-success: #10b981;
  --c-success-light: #ecfdf5;
  --c-danger: #ef4444;
  --c-danger-light: #fef2f2;
  --c-text: #1e293b;
  --c-muted: #64748b;
  --c-border: #e2e8f0;
  --c-bg: #f8fafc;
  --c-card: #ffffff;
  --radius: 14px;
  --radius-sm: 9px;
  --shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  min-height: 100%;
  color: var(--c-text);
  padding: 0 0 48px;
}
.page-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px 0;
}
.breadcrumb {
  font-size: 13px;
  color: var(--c-muted);
}
.breadcrumb span {
  color: var(--c-text);
  font-weight: 600;
}
.topbar-right {
  font-size: 13px;
  color: var(--c-muted);
}
.page-heading {
  padding: 10px 28px 16px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 3px;
}
.page-sub {
  font-size: 13px;
  color: var(--c-muted);
  margin: 0;
}
.step-progress-wrap {
  display: flex;
  align-items: flex-start;
  padding: 0 28px 20px;
}
.step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
}
.step-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid var(--c-border);
  background: var(--c-card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--c-muted);
  transition: all 0.25s;
  z-index: 1;
}
.step-node.done .step-circle {
  background: var(--c-success);
  border-color: var(--c-success);
  color: #fff;
}
.step-node.active .step-circle {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
}
.step-label {
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 5px;
  white-space: nowrap;
}
.step-node.active .step-label {
  color: var(--c-primary);
  font-weight: 600;
}
.step-node.done .step-label {
  color: var(--c-success);
}
.step-connector {
  position: absolute;
  top: 15px;
  left: calc(50% + 15px);
  width: calc(100% - 30px);
  height: 2px;
  background: var(--c-border);
}
.step-node.done .step-connector {
  background: var(--c-success);
}
.page-body {
  padding: 0 28px;
}
.two-col {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 16px;
}
.main-card {
  display: flex;
  flex-direction: column;
}
.card {
  background: var(--c-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1.5px solid var(--c-border);
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--c-border);
}
.card-title {
  font-size: 14px;
  font-weight: 700;
}
.step-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--c-primary);
  background: var(--c-primary-light);
  padding: 3px 10px;
  border-radius: 99px;
}
.card-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 99px;
  font-weight: 600;
}
.status-success {
  background: var(--c-success-light);
  color: #065f46;
}
.status-danger {
  background: var(--c-danger-light);
  color: #991b1b;
}
.card-body {
  padding: 18px;
  flex: 1;
}
.card-footer {
  padding: 14px 18px;
  border-top: 1px solid var(--c-border);
}
.card-footer.two-btn {
  display: flex;
  gap: 10px;
}
.info-card {
  padding: 16px;
}
.info-icon {
  font-size: 20px;
  margin-bottom: 6px;
}
.info-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}
.info-text {
  font-size: 12px;
  color: var(--c-muted);
  line-height: 1.7;
}
.info-list {
  margin: 0;
  padding-left: 16px;
}
.info-list li {
  font-size: 12px;
  color: var(--c-muted);
  margin-bottom: 4px;
  line-height: 1.6;
}
.field-group {
  margin-bottom: 20px;
}
.field-group:last-child {
  margin-bottom: 0;
}
.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.radio-grid {
  display: grid;
  gap: 8px;
}
.radio-grid.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}
.radio-grid.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}
.radio-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 12px 8px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.radio-card:hover {
  border-color: var(--c-primary);
}
.radio-card.selected {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.rc-icon {
  font-size: 20px;
}
.rc-text {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}
.rc-check {
  position: absolute;
  top: 3px;
  right: 6px;
  font-size: 10px;
  color: var(--c-primary);
  font-weight: 700;
}
.radio-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.radio-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}
.radio-row:hover {
  border-color: var(--c-primary);
}
.radio-row.selected {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.rr-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--c-border);
  flex-shrink: 0;
  margin-top: 2px;
  transition: all 0.2s;
}
.rr-dot.active {
  border-color: var(--c-primary);
  background: var(--c-primary);
}
.rr-title {
  font-size: 13px;
  font-weight: 500;
}
.rr-hint {
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 1px;
}
.select-field {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  background: #fff;
  color: var(--c-text);
  cursor: pointer;
  transition: border-color 0.2s;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748B' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}
.select-field:focus {
  outline: none;
  border-color: var(--c-primary);
}
.counter-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.counter-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1.5px solid var(--c-border);
  background: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-primary);
}
.counter-btn:hover {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.counter-val {
  font-size: 16px;
  font-weight: 700;
  min-width: 48px;
  text-align: center;
}
.slider {
  width: 100%;
  accent-color: var(--c-primary);
}
.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 4px;
}
.slider-val {
  font-weight: 700;
  color: var(--c-primary);
}
.income-tag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.income-desc {
  font-size: 12px;
  color: var(--c-muted);
}
.tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 99px;
}
.tag-red {
  background: #fee2e2;
  color: #dc2626;
}
.tag-orange {
  background: #fef3c7;
  color: #d97706;
}
.tag-blue {
  background: #E7E6FA;
  color: #393684;
}
.tag-gray {
  background: #f1f5f9;
  color: #475569;
}
.input-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}
.text-input {
  flex: 1;
  padding: 9px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--c-text);
  transition: border-color 0.2s;
}
.text-input:focus {
  outline: none;
  border-color: var(--c-primary);
}
.unit {
  font-size: 13px;
  color: var(--c-muted);
  white-space: nowrap;
}
.limit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 5px 0;
  border-bottom: 1px solid var(--c-border);
}
.limit-label {
  color: var(--c-muted);
}
.limit-val {
  font-weight: 700;
}
.val-ok {
  color: var(--c-success);
}
.val-over {
  color: var(--c-danger);
}
.limit-status {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  text-align: center;
}
.limit-status.ok {
  background: var(--c-success-light);
  color: #065f46;
}
.limit-status.over {
  background: var(--c-danger-light);
  color: #991b1b;
}
.city-limit-list {
  display: flex;
  flex-direction: column;
}
.city-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--c-border);
}
.city-row:last-child {
  border-bottom: none;
}
.city-amt {
  font-weight: 700;
  color: var(--c-primary);
}
.amount-block {
  background: linear-gradient(135deg, var(--c-primary-light), #E7E6FA);
  border-radius: var(--radius-sm);
  padding: 20px;
  margin-bottom: 16px;
  text-align: center;
}
.amount-label {
  font-size: 12px;
  color: var(--c-muted);
  margin-bottom: 6px;
}
.amount-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}
.amount-num {
  font-size: 44px;
  font-weight: 800;
  color: var(--c-primary);
}
.amount-unit {
  font-size: 16px;
  color: var(--c-primary);
}
.amount-annual {
  font-size: 12px;
  color: var(--c-muted);
  margin-top: 5px;
}
.ineligible-block {
  text-align: center;
  padding: 24px 0 16px;
}
.ineligible-icon {
  font-size: 40px;
  margin-bottom: 8px;
}
.ineligible-text {
  font-size: 13px;
  color: var(--c-muted);
  line-height: 1.7;
}
.check-section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.check-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.check-row.pass {
  background: var(--c-success-light);
  color: #065f46;
}
.check-row.fail {
  background: var(--c-danger-light);
  color: #991b1b;
}
.summary-rows {
  display: flex;
  flex-direction: column;
}
.sum-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--c-border);
}
.sum-row:last-child {
  border-bottom: none;
}
.sum-row span:first-child {
  color: var(--c-muted);
}
.sum-row span:last-child {
  font-weight: 600;
}
.btn-primary {
  flex: 1;
  padding: 10px 20px;
  background: var(--c-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}
.btn-primary:hover:not(:disabled) {
  background: var(--c-primary-dark);
}
.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-outline {
  padding: 10px 18px;
  background: #fff;
  color: var(--c-muted);
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-outline:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.slide-fade-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
@media (max-width: 700px) {
  .page-topbar,
  .page-heading,
  .step-progress-wrap,
  .page-body {
    padding-left: 16px;
    padding-right: 16px;
  }
  .two-col {
    grid-template-columns: 1fr;
  }
}
</style>

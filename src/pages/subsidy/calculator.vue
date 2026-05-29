<template>
  <div class="subsidy-calculator">
    <!-- Step Progress -->
    <div class="step-progress">
      <div v-for="s in 3" :key="s" class="step-item">
        <div class="step-circle" :class="{ active: step === s, done: step > s }">
          <i v-if="step > s" class="ti ti-check"></i>
          <span v-else>{{ s }}</span>
        </div>
        <div class="step-line" v-if="s < 3" :class="{ done: step > s }"></div>
      </div>
    </div>

    <!-- Step 1: 基本資料 -->
    <div v-if="step === 1" class="form-section">
      <h3 class="section-title">基本資料</h3>
      <p class="section-desc">請填寫您的基本個人與家庭資訊</p>

      <div class="form-group">
        <label>租屋縣市</label>
        <select v-model="form.city" @change="form.district = ''">
          <option value="">請選擇縣市</option>
          <option v-for="c in cities" :key="c.name" :value="c.name">{{ c.name }}</option>
        </select>
      </div>

      <div class="form-group" v-if="form.city">
        <label>租屋行政區</label>
        <select v-model="form.district">
          <option value="">請選擇行政區</option>
          <option v-for="d in currentDistricts" :key="d.name" :value="d.name">
            {{ d.name }}（第{{ d.level }}級補助區域）
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>申請人年齡</label>
        <input type="number" v-model.number="form.age" min="18" max="99" placeholder="請輸入年齡（需滿18歲）" />
      </div>

      <div class="form-group">
        <label>家庭成員人數（含申請人）</label>
        <div class="radio-group">
          <label class="radio-item" v-for="n in [1, 2, 3, 4, 5]" :key="n">
            <input type="radio" :value="n" v-model="form.members" />
            <span>{{ n }}人{{ n === 5 ? '以上' : '' }}</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>家庭年所得總額（新台幣）</label>
        <input type="number" v-model.number="form.income" min="0" placeholder="請輸入家庭全年所得合計" />
        <p class="hint" v-if="form.city && form.income > 0 && form.members > 0">
          每人每月平均所得：{{ formatCurrency(monthlyPerPerson) }} 元
          <span :class="incomeOkClass">（{{ incomeStatusText }}）</span>
        </p>
      </div>

      <button class="btn-next" @click="goStep2" :disabled="!step1Valid">下一步</button>
    </div>

    <!-- Step 2: 身份資格 -->
    <div v-if="step === 2" class="form-section">
      <h3 class="section-title">身份與資格</h3>
      <p class="section-desc">請勾選符合您情況的身份類別（可複選）</p>

      <div class="form-group">
        <label>弱勢身份（擇一最符合者）</label>
        <div class="checkbox-group">
          <label class="check-item" v-for="id in identities" :key="id.value">
            <input type="checkbox" :value="id.value" v-model="form.identities" @change="onIdentityChange(id.value)" />
            <span>{{ id.label }}</span>
            <span class="badge badge-info" v-if="id.note">{{ id.note }}</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>加碼資格（可複選）</label>
        <div class="checkbox-group">
          <label class="check-item" v-for="b in bonuses" :key="b.value">
            <input type="checkbox" :value="b.value" v-model="form.bonuses" />
            <span>{{ b.label }}</span>
            <span class="badge badge-purple">加碼 {{ b.multiplier }} 倍</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>其他條件確認</label>
        <div class="checkbox-group">
          <label class="check-item">
            <input type="checkbox" v-model="form.noOtherSubsidy" />
            <span>未享有其他政府住宅補貼</span>
          </label>
          <label class="check-item">
            <input type="checkbox" v-model="form.noOwnHouse" />
            <span>家庭成員均無自有房屋</span>
          </label>
          <label class="check-item">
            <input type="checkbox" v-model="form.validContract" />
            <span>具合法有效租賃契約</span>
          </label>
          <label class="check-item">
            <input type="checkbox" v-model="form.registeredAddress" />
            <span>戶籍設於租屋所在縣市</span>
          </label>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn-back" @click="step = 1">上一步</button>
        <button class="btn-next" @click="goStep3" :disabled="!step2Valid">試算結果</button>
      </div>
    </div>

    <!-- Step 3: 試算結果 -->
    <div v-if="step === 3" class="form-section">
      <h3 class="section-title">試算結果</h3>

      <!-- 不符合資格 -->
      <div v-if="!isEligible" class="result-card result-fail">
        <i class="ti ti-circle-x result-icon"></i>
        <h4>您目前不符合申請資格</h4>
        <ul class="fail-reasons">
          <li v-for="r in failReasons" :key="r">{{ r }}</li>
        </ul>
        <p class="hint">如有疑問，請洽各縣市政府住宅主管機關確認。</p>
      </div>

      <!-- 符合資格 -->
      <div v-else class="result-card result-pass">
        <div class="result-header">
          <i class="ti ti-circle-check result-icon success"></i>
          <div>
            <h4>恭喜！您符合申請資格</h4>
            <p class="level-badge">補助等級：第 {{ subsidyLevel }} 級</p>
          </div>
        </div>

        <div class="amount-grid">
          <div class="amount-card">
            <p class="amount-label">基本月補貼</p>
            <p class="amount-value">{{ formatCurrency(baseAmount) }} <span>元/月</span></p>
          </div>
          <div class="amount-card highlight">
            <p class="amount-label">加碼後月補貼</p>
            <p class="amount-value">{{ formatCurrency(finalAmount) }} <span>元/月</span></p>
          </div>
          <div class="amount-card">
            <p class="amount-label">年補貼估算</p>
            <p class="amount-value">{{ formatCurrency(finalAmount * 12) }} <span>元/年</span></p>
          </div>
        </div>

        <div class="detail-block">
          <div class="detail-row">
            <span>租屋地點</span>
            <span>{{ form.city }} {{ form.district }}</span>
          </div>
          <div class="detail-row">
            <span>補助等級</span>
            <span>第 {{ subsidyLevel }} 級（{{ subsidyLevelDesc }}）</span>
          </div>
          <div class="detail-row">
            <span>基本金額</span>
            <span>{{ formatCurrency(baseAmount) }} 元</span>
          </div>
          <div class="detail-row" v-if="bestBonus > 1">
            <span>加碼倍數</span>
            <span>{{ bestBonus }} 倍（{{ bestBonusLabel }}）</span>
          </div>
          <div class="detail-row total">
            <span>每月補貼</span>
            <span>{{ formatCurrency(finalAmount) }} 元</span>
          </div>
        </div>

        <div class="note-block">
          <i class="ti ti-info-circle" aria-hidden="true"></i>
          <p>此試算結果僅供參考，實際核定金額以各縣市政府審查結果為準。申請期間：全年受理（額滿為止）。</p>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn-back" @click="step = 2">上一步</button>
        <button class="btn-next" @click="resetForm">重新試算</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const step = ref(1)

const form = ref({
  city: '',
  district: '',
  age: null,
  members: 1,
  income: null,
  identities: [],
  bonuses: [],
  noOtherSubsidy: false,
  noOwnHouse: false,
  validContract: false,
  registeredAddress: false,
})

// ── 縣市 / 行政區補助級距資料（依內政部公告）
// level: 1=最高補助區域, 2=次高, 3=一般
// 補助金額（第一級身份/第二級身份/第三級身份）
const cities = [
  {
    name: '台北市',
    incomeLimit: 50948,
    districts: [
      { name: '信義區', level: 1 }, { name: '大安區', level: 1 }, { name: '中正區', level: 1 },
      { name: '中山區', level: 1 }, { name: '松山區', level: 1 }, { name: '大同區', level: 1 },
      { name: '萬華區', level: 1 }, { name: '南港區', level: 1 }, { name: '內湖區', level: 2 },
      { name: '士林區', level: 2 }, { name: '北投區', level: 2 }, { name: '文山區', level: 2 },
    ],
    // [area_level][subsidy_level] → 金額
    amounts: {
      1: { 1: 8000, 2: 6000, 3: 3000 },
      2: { 1: 7000, 2: 5000, 3: 3000 },
    },
  },
  {
    name: '新北市',
    incomeLimit: 42250,
    districts: [
      { name: '板橋區', level: 1 }, { name: '新莊區', level: 1 }, { name: '中和區', level: 1 },
      { name: '永和區', level: 1 }, { name: '土城區', level: 1 }, { name: '三重區', level: 1 },
      { name: '蘆洲區', level: 1 }, { name: '汐止區', level: 1 },
      { name: '新店區', level: 2 }, { name: '樹林區', level: 2 }, { name: '三峽區', level: 2 },
      { name: '林口區', level: 2 }, { name: '淡水區', level: 2 },
      { name: '瑞芳區', level: 3 }, { name: '平溪區', level: 3 }, { name: '雙溪區', level: 3 },
    ],
    amounts: {
      1: { 1: 6000, 2: 5000, 3: 2600 },
      2: { 1: 5500, 2: 4000, 3: 2400 },
      3: { 1: 4000, 2: 3000, 3: 2000 },
    },
  },
  {
    name: '桃園市',
    incomeLimit: 41920,
    districts: [
      { name: '桃園區', level: 1 }, { name: '中壢區', level: 1 }, { name: '八德區', level: 1 },
      { name: '蘆竹區', level: 1 },
      { name: '大溪區', level: 2 }, { name: '楊梅區', level: 2 }, { name: '平鎮區', level: 2 },
      { name: '龍潭區', level: 3 }, { name: '新屋區', level: 3 }, { name: '觀音區', level: 3 },
    ],
    amounts: {
      1: { 1: 5500, 2: 4500, 3: 2400 },
      2: { 1: 4500, 2: 3600, 3: 2200 },
      3: { 1: 3500, 2: 2800, 3: 2000 },
    },
  },
  {
    name: '台中市',
    incomeLimit: 40193,
    districts: [
      { name: '西屯區', level: 1 }, { name: '南屯區', level: 1 }, { name: '北屯區', level: 1 },
      { name: '西區', level: 1 }, { name: '北區', level: 1 }, { name: '中區', level: 1 },
      { name: '大里區', level: 2 }, { name: '太平區', level: 2 }, { name: '烏日區', level: 2 },
      { name: '霧峰區', level: 3 }, { name: '潭子區', level: 3 }, { name: '豐原區', level: 2 },
    ],
    amounts: {
      1: { 1: 5500, 2: 4500, 3: 2400 },
      2: { 1: 4500, 2: 3600, 3: 2200 },
      3: { 1: 3500, 2: 2800, 3: 2000 },
    },
  },
  {
    name: '台南市',
    incomeLimit: 38788,
    districts: [
      { name: '中西區', level: 1 }, { name: '東區', level: 1 }, { name: '南區', level: 1 },
      { name: '北區', level: 1 }, { name: '安平區', level: 1 }, { name: '安南區', level: 1 },
      { name: '永康區', level: 2 }, { name: '仁德區', level: 2 }, { name: '歸仁區', level: 2 },
      { name: '新化區', level: 3 }, { name: '善化區', level: 3 },
    ],
    amounts: {
      1: { 1: 4500, 2: 3600, 3: 2200 },
      2: { 1: 4000, 2: 3200, 3: 2000 },
      3: { 1: 3000, 2: 2400, 3: 2000 },
    },
  },
  {
    name: '高雄市',
    incomeLimit: 40100,
    districts: [
      { name: '前金區', level: 1 }, { name: '苓雅區', level: 1 }, { name: '新興區', level: 1 },
      { name: '三民區', level: 1 }, { name: '鼓山區', level: 1 }, { name: '左營區', level: 1 },
      { name: '楠梓區', level: 2 }, { name: '鳳山區', level: 2 }, { name: '仁武區', level: 2 },
      { name: '大寮區', level: 3 }, { name: '林園區', level: 3 }, { name: '岡山區', level: 2 },
    ],
    amounts: {
      1: { 1: 5000, 2: 4000, 3: 2400 },
      2: { 1: 4000, 2: 3200, 3: 2200 },
      3: { 1: 3000, 2: 2400, 3: 2000 },
    },
  },
  {
    name: '新竹市',
    incomeLimit: 38788,
    districts: [
      { name: '東區', level: 1 }, { name: '北區', level: 1 }, { name: '香山區', level: 2 },
    ],
    amounts: {
      1: { 1: 5000, 2: 4000, 3: 2400 },
      2: { 1: 4000, 2: 3200, 3: 2200 },
    },
  },
  {
    name: '其他縣市',
    incomeLimit: 38788,
    districts: [
      { name: '市區', level: 1 }, { name: '一般區域', level: 2 }, { name: '偏遠區域', level: 3 },
    ],
    amounts: {
      1: { 1: 4000, 2: 3200, 3: 2000 },
      2: { 1: 3000, 2: 2400, 3: 2000 },
      3: { 1: 2400, 2: 2000, 3: 2000 },
    },
  },
]

const identities = [
  { value: 'low_income', label: '低收入戶' },
  { value: 'mid_low_income', label: '中低收入戶' },
  { value: 'none', label: '無特殊身份' },
]

const bonuses = [
  { value: 'young', label: '18~39歲單身青年', multiplier: 1.2 },
  { value: 'newwed_old', label: '新婚家庭（2025/12/31前登記）', multiplier: 1.3 },
  { value: 'newwed_new', label: '新婚家庭（2026/1/1後登記）', multiplier: 1.5 },
  { value: 'child', label: '育有未成年子女家庭', multiplier: 1.8 },
  { value: 'social_weak', label: '社會弱勢（身障/原住民/特殊境遇等）', multiplier: 1.2 },
  { value: 'mid_low_bonus', label: '中低收入戶身份加碼', multiplier: 1.4 },
  { value: 'low_bonus', label: '低收入戶身份加碼', multiplier: 1.4 },
]

const onIdentityChange = (val) => {
  if (val !== 'none') {
    form.value.identities = form.value.identities.filter(v => v !== 'none')
  } else {
    form.value.identities = ['none']
  }
}

const currentCityData = computed(() => cities.find(c => c.name === form.value.city))
const currentDistricts = computed(() => currentCityData.value?.districts || [])
const currentDistrict = computed(() => currentDistricts.value.find(d => d.name === form.value.district))
const incomeLimit = computed(() => currentCityData.value?.incomeLimit || 38788)

const monthlyPerPerson = computed(() => {
  if (!form.value.income || !form.value.members) return 0
  return Math.round(form.value.income / 12 / form.value.members)
})

const incomeOkClass = computed(() => monthlyPerPerson.value < incomeLimit.value ? 'text-pass' : 'text-fail')
const incomeStatusText = computed(() => monthlyPerPerson.value < incomeLimit.value ? '符合所得限制' : '超出所得限制')

const step1Valid = computed(() =>
  form.value.city && form.value.district && form.value.age >= 18 &&
  form.value.income > 0 && form.value.members > 0
)

const step2Valid = computed(() =>
  form.value.noOtherSubsidy && form.value.noOwnHouse &&
  form.value.validContract && form.value.registeredAddress
)

// ── 補助等級判定
const subsidyLevel = computed(() => {
  const ids = form.value.identities
  const m = form.value.members
  if (
    (ids.includes('low_income') && m >= 2) ||
    (ids.includes('mid_low_income') && m >= 3)
  ) return 1
  if (m >= 2) return 2
  return 3
})

const subsidyLevelDesc = computed(() => {
  if (subsidyLevel.value === 1) return '低/中低收入多人家庭'
  if (subsidyLevel.value === 2) return '2人以上家庭'
  return '單身（1人）'
})

const areaLevel = computed(() => currentDistrict.value?.level || 1)

const baseAmount = computed(() => {
  const city = currentCityData.value
  if (!city) return 0
  const aLv = areaLevel.value
  const sLv = subsidyLevel.value
  return city.amounts[aLv]?.[sLv] || city.amounts[1]?.[sLv] || 0
})

const bestBonus = computed(() => {
  const selected = form.value.bonuses
  if (!selected.length) return 1
  const mults = selected.map(v => bonuses.find(b => b.value === v)?.multiplier || 1)
  return Math.max(...mults)
})

const bestBonusLabel = computed(() => {
  const selected = form.value.bonuses
  if (!selected.length) return ''
  let best = null, bestVal = 1
  selected.forEach(v => {
    const b = bonuses.find(b => b.value === v)
    if (b && b.multiplier > bestVal) { best = b; bestVal = b.multiplier }
  })
  return best?.label || ''
})

const finalAmount = computed(() => Math.round(baseAmount.value * bestBonus.value))

const failReasons = computed(() => {
  const r = []
  if (form.value.age < 18) r.push('申請人年齡未滿 18 歲')
  if (monthlyPerPerson.value >= incomeLimit.value)
    r.push(`每人每月平均所得 ${formatCurrency(monthlyPerPerson.value)} 元，超出 ${form.value.city} 上限 ${formatCurrency(incomeLimit.value)} 元`)
  if (!form.value.noOtherSubsidy) r.push('正享有其他政府住宅補貼')
  if (!form.value.noOwnHouse) r.push('家庭成員持有自有房屋')
  if (!form.value.validContract) r.push('租賃契約不符規定')
  if (!form.value.registeredAddress) r.push('戶籍未設於租屋縣市')
  return r
})

const isEligible = computed(() => failReasons.value.length === 0)

const goStep2 = () => { if (step1Valid.value) step.value = 2 }
const goStep3 = () => { if (step2Valid.value) step.value = 3 }
const resetForm = () => {
  step.value = 1
  form.value = { city: '', district: '', age: null, members: 1, income: null, identities: [], bonuses: [], noOtherSubsidy: false, noOwnHouse: false, validContract: false, registeredAddress: false }
}

const formatCurrency = (n) => Math.round(n).toLocaleString('zh-TW')
</script>

<style scoped>
.subsidy-calculator { padding: 0; }

.step-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 2rem;
}
.step-item { display: flex; align-items: center; }
.step-circle {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: 2px solid #d4c9f0;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 500;
  color: #8f7fcf;
  background: #fff;
  transition: all 0.2s;
}
.step-circle.active { background: #5b4ecb; border-color: #5b4ecb; color: #fff; }
.step-circle.done { background: #ede9fa; border-color: #5b4ecb; color: #5b4ecb; }
.step-line { width: 60px; height: 2px; background: #e0d9f7; margin: 0 4px; }
.step-line.done { background: #5b4ecb; }

.form-section {}
.section-title { font-size: 18px; font-weight: 500; color: #2d2257; margin: 0 0 4px; }
.section-desc { font-size: 14px; color: #888; margin: 0 0 1.5rem; }

.form-group { margin-bottom: 1.25rem; }
.form-group > label { display: block; font-size: 14px; font-weight: 500; color: #444; margin-bottom: 6px; }
.form-group select,
.form-group input[type="number"] {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d9d4f0;
  border-radius: 8px;
  font-size: 15px;
  color: #2d2257;
  background: #faf9ff;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.form-group select:focus,
.form-group input:focus { border-color: #5b4ecb; background: #fff; }

.radio-group { display: flex; gap: 10px; flex-wrap: wrap; }
.radio-item {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  border: 1px solid #d9d4f0;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  color: #444;
  transition: all 0.15s;
}
.radio-item:has(input:checked) { background: #5b4ecb; border-color: #5b4ecb; color: #fff; }
.radio-item input { display: none; }

.checkbox-group { display: flex; flex-direction: column; gap: 8px; }
.check-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  border: 1px solid #e8e4f4;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #444;
  transition: all 0.15s;
}
.check-item:has(input:checked) { background: #f3f0fd; border-color: #5b4ecb; }
.check-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: #5b4ecb; }

.badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: auto; }
.badge-info { background: #e8f4fd; color: #1a6fa8; }
.badge-purple { background: #ede9fa; color: #5b4ecb; }

.hint { font-size: 13px; color: #888; margin-top: 6px; }
.text-pass { color: #16a34a; font-weight: 500; }
.text-fail { color: #dc2626; font-weight: 500; }

.btn-next {
  width: 100%;
  padding: 14px;
  background: #5b4ecb;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 0.5rem;
  transition: background 0.2s;
}
.btn-next:hover:not(:disabled) { background: #4a3db0; }
.btn-next:disabled { background: #c9c3e8; cursor: not-allowed; }
.btn-back {
  padding: 14px 24px;
  background: transparent;
  color: #5b4ecb;
  border: 1px solid #d4c9f0;
  border-radius: 10px;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-back:hover { background: #f3f0fd; }

.btn-row { display: flex; gap: 12px; margin-top: 1rem; }
.btn-row .btn-next { flex: 1; margin-top: 0; }

/* Result */
.result-card {
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.result-fail {
  background: #fff8f8;
  border: 1px solid #fca5a5;
  text-align: center;
}
.result-fail h4 { color: #b91c1c; font-size: 17px; margin: 0.5rem 0; }
.result-icon { font-size: 40px; color: #ef4444; }
.fail-reasons { list-style: none; padding: 0; margin: 1rem 0; text-align: left; }
.fail-reasons li { font-size: 14px; color: #7f1d1d; padding: 4px 0; }
.fail-reasons li::before { content: '✗ '; color: #ef4444; }

.result-pass { background: #f9f8ff; border: 1px solid #c4b8f0; }
.result-header { display: flex; align-items: center; gap: 14px; margin-bottom: 1.25rem; }
.result-icon.success { font-size: 40px; color: #5b4ecb; }
.result-header h4 { font-size: 17px; color: #2d2257; margin: 0 0 4px; }
.level-badge { font-size: 13px; background: #ede9fa; color: #5b4ecb; padding: 2px 12px; border-radius: 10px; display: inline-block; margin: 0; }

.amount-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 1.25rem; }
.amount-card {
  background: #fff;
  border: 1px solid #e0d9f7;
  border-radius: 10px;
  padding: 12px;
  text-align: center;
}
.amount-card.highlight { background: #5b4ecb; border-color: #5b4ecb; }
.amount-label { font-size: 12px; color: #888; margin: 0 0 4px; }
.amount-card.highlight .amount-label { color: #d4c9f0; }
.amount-value { font-size: 20px; font-weight: 500; color: #2d2257; margin: 0; }
.amount-value span { font-size: 12px; font-weight: 400; }
.amount-card.highlight .amount-value { color: #fff; }
.amount-card.highlight .amount-value span { color: #d4c9f0; }

.detail-block { background: #fff; border: 1px solid #e8e4f4; border-radius: 10px; overflow: hidden; margin-bottom: 1rem; }
.detail-row { display: flex; justify-content: space-between; padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #f0edf9; }
.detail-row:last-child { border-bottom: none; }
.detail-row span:first-child { color: #888; }
.detail-row span:last-child { color: #2d2257; font-weight: 500; }
.detail-row.total span { color: #5b4ecb; font-weight: 500; font-size: 15px; }

.note-block { display: flex; gap: 8px; align-items: flex-start; background: #faf9ff; border: 1px solid #e0d9f7; border-radius: 8px; padding: 12px; }
.note-block i { font-size: 18px; color: #8f7fcf; flex-shrink: 0; margin-top: 1px; }
.note-block p { font-size: 13px; color: #888; margin: 0; line-height: 1.5; }
</style>
